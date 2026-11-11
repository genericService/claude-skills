#!/usr/bin/env node
/**
 * @fileoverview Deterministic repo scanner, AST/schema validator, and live HTTP
 * readiness auditor for the 2026 Agentic Web stack:
 * - llms.txt v2+ (https://llmstxt.org/, August 2026 AST + Link relations + .md twins)
 * - AdCP v3.2+ (/.well-known/brand.json, /.well-known/adagents.json)
 * - RFC 8615 well-known discovery (mcp.json SEP-2127, agent-card.json A2A,
 *   api-catalog RFC 9727, oauth-protected-resource RFC 9728, security.txt RFC 9116)
 * - Crawl signals & browser tooling (robots.txt Content-Signal / IETF aipref, WebMCP)
 *
 * Requires Node.js >= 24.0.0. Zero external dependencies.
 */

import fs from "node:fs";
import path from "node:path";

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".astro",
  ".vercel",
  ".output",
  ".cache",
  ".tina",
  ".agents",
  ".agent",
  ".claude",
  "dist",
  "build",
  "out",
  "coverage",
]);

const ADCP_CHANNELS = new Set([
  "display",
  "olv",
  "social",
  "search",
  "ctv",
  "linear_tv",
  "radio",
  "streaming_audio",
  "podcast",
  "dooh",
  "ooh",
  "print",
  "cinema",
  "email",
  "gaming",
  "retail_media",
  "influencer",
  "affiliate",
  "product_placement",
  "sponsored_intelligence",
]);

const ADCP_AUTH_TYPES = new Map([
  ["property_ids", "property_ids"],
  ["property_tags", "property_tags"],
  ["inline_properties", "properties"],
  ["publisher_properties", "publisher_properties"],
  ["signal_ids", "signal_ids"],
  ["signal_tags", "signal_tags"],
]);

const BRAND_V5_FORBIDDEN_KEYS = [
  "house",
  "brands",
  "brand_refs",
  "authorized_operators",
  "authoritative_location",
  "redirect_reason",
  "redirect_effective_at",
  "region",
  "note",
];

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const BRAND_ID_RE = /^[a-z0-9_]+$/;
const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const SECRET_VALUE_RE = /(sk-[a-zA-Z0-9]{16,}|Bearer\s+[A-Za-z0-9._-]{16,}|ghp_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,})/;

/**
 * Parse CLI arguments into a structured options bag.
 * @param {readonly string[]} argv
 */
function parseArgs(argv) {
  const opts = {
    root: null,
    url: null,
    manifestOut: null,
    json: false,
    reportOnly: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--root" && argv[i + 1]) {
      opts.root = path.resolve(argv[i + 1]);
      i += 1;
    } else if (arg === "--url" && argv[i + 1]) {
      opts.url = argv[i + 1];
      i += 1;
    } else if (arg === "--manifest") {
      if (argv[i + 1] && !argv[i + 1].startsWith("--")) {
        opts.manifestOut = path.resolve(argv[i + 1]);
        i += 1;
      } else {
        opts.manifestOut = "STDOUT";
      }
    } else if (arg === "--json") {
      opts.json = true;
    } else if (arg === "--report-only") {
      opts.reportOnly = true;
    } else if (arg === "-h" || arg === "--help") {
      opts.help = true;
    }
  }

  if (!opts.root && !opts.url) {
    opts.root = process.cwd();
  }
  return opts;
}

/**
 * Recursively walk a directory while pruning build and vendor folders.
 * @param {string} dir
 * @param {string} baseDir
 * @returns {string[]} Relative POSIX paths
 */
function walkRepo(dir, baseDir = dir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const rel = path.relative(baseDir, full).split(path.sep).join("/");
    if (entry.isDirectory()) {
      results.push(...walkRepo(full, baseDir));
    } else if (entry.isFile()) {
      results.push(rel);
    }
  }
  return results;
}

/**
 * Build a deterministic project manifest for agentic context and discovery.
 * @param {string} rootDir
 */
function buildRepoManifest(rootDir) {
  const files = walkRepo(rootDir);
  const fileSet = new Set(files);

  let framework = "static-or-custom";
  if (files.some((f) => /^(src\/)?app\/.*page\.(tsx|ts|jsx|js|mdx)$/.test(f))) {
    framework = "nextjs-app-router";
  } else if (files.some((f) => /^(src\/)?pages\/.*\.(tsx|ts|jsx|js)$/.test(f))) {
    framework = "nextjs-pages-router";
  } else if (fileSet.has("astro.config.mjs") || fileSet.has("astro.config.ts")) {
    framework = "astro";
  } else if (files.some((f) => f.includes(".vitepress/config"))) {
    framework = "vitepress";
  } else if (fileSet.has("hugo.toml") || fileSet.has("config.toml")) {
    framework = "hugo";
  }

  const brandGuides = files.filter((f) =>
    /^(DESIGN|GEMINI|CLAUDE|README|BRAND)\.md$/i.test(path.basename(f)) &&
    f.split("/").length <= 2
  );

  const appRoutes = files
    .filter((f) => /^(src\/)?app\/(.*\/)?page\.(tsx|ts|jsx|js|mdx)$/.test(f))
    .map((f) => {
      const stripped = f
        .replace(/^(src\/)?app/, "")
        .replace(/\/page\.(tsx|ts|jsx|js|mdx)$/, "")
        .replace(/\/\([^)]+\)/g, "");
      return stripped === "" ? "/" : stripped;
    })
    .sort();

  const contentFiles = files
    .filter((f) => /^(content|docs|posts|notes)\/.*\.(md|mdx)$/.test(f))
    .sort();

  const markdownTwins = files
    .filter(
      (f) =>
        (f.startsWith("public/") && f.endsWith(".md")) ||
        /^(src\/)?app\/.*\.md\/route\.(ts|js)$/.test(f) ||
        /^(src\/)?app\/llms-md\/.*route\.(ts|js)$/.test(f)
    )
    .sort();

  const wellKnownFiles = files
    .filter((f) => f.includes(".well-known/"))
    .sort();

  const middlewareFiles = files.filter((f) =>
    /^(src\/)?(middleware|proxy)\.(ts|js|mjs)$/.test(f)
  );

  const webMcpFiles = files.filter((f) => {
    if (!/\.(ts|tsx|js|jsx|mjs)$/.test(f)) return false;
    const text = fs.readFileSync(path.join(rootDir, f), "utf8");
    return text.includes("modelContext") && text.includes("registerTool");
  });

  return {
    root: rootDir,
    framework,
    brandGuides,
    appRoutes,
    contentFiles,
    markdownTwins,
    wellKnownFiles,
    middlewareFiles,
    webMcpFiles,
    hasLlmsTxt: fileSet.has("public/llms.txt") || fileSet.has("llms.txt") || files.some((f) => f.endsWith("llms.txt/route.ts")),
    hasLlmsFullTxt: fileSet.has("public/llms-full.txt") || fileSet.has("llms-full.txt") || files.some((f) => f.endsWith("llms-full.txt/route.ts")),
    hasRobots: fileSet.has("public/robots.txt") || fileSet.has("robots.txt") || files.some((f) => /^(src\/)?app\/robots\.(ts|js)$/.test(f)),
  };
}

/**
 * Parse and validate an llms.txt document against the August 2026 v2 AST spec.
 * @param {string} rawText
 * @param {string} sourceLabel
 */
function validateLlmsTxtV2(rawText, sourceLabel) {
  const findings = [];
  const text = rawText.replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/);

  let state = "BEFORE_H1";
  let currentSection = null;
  let inCodeFence = false;
  let h1Title = null;
  const blockquoteLines = [];
  const sections = new Map();
  let totalLinks = 0;
  let htmlOnlyInternalLinks = 0;

  for (let idx = 0; idx < lines.length; idx += 1) {
    const lineNo = idx + 1;
    const line = lines[idx];
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      inCodeFence = !inCodeFence;
      if (state === "IN_SECTION") {
        findings.push({
          severity: "error",
          check: "llms-txt-v2-ast",
          location: `${sourceLabel}:${lineNo}`,
          message: `Code fence inside "## ${currentSection}" breaks the v2 file-list grammar. Move code examples into a linked .md file.`,
        });
      }
      continue;
    }
    if (inCodeFence || trimmed === "") continue;

    if (state === "BEFORE_H1") {
      if (line.startsWith("# ") && !line.startsWith("## ")) {
        h1Title = line.slice(2).trim();
        if (!h1Title) {
          findings.push({
            severity: "error",
            check: "llms-txt-v2-ast",
            location: `${sourceLabel}:${lineNo}`,
            message: "H1 heading is empty. Provide the project or site name.",
          });
        }
        state = "AFTER_H1";
      } else {
        findings.push({
          severity: "error",
          check: "llms-txt-v2-ast",
          location: `${sourceLabel}:${lineNo}`,
          message: "Content appears before the required top-level '# Title' H1 heading.",
        });
      }
      continue;
    }

    if (line.startsWith("# ") && !line.startsWith("## ")) {
      findings.push({
        severity: "error",
        check: "llms-txt-v2-ast",
        location: `${sourceLabel}:${lineNo}`,
        message: "Multiple H1 headings found. llms.txt v2 allows only a single H1 at the top.",
      });
      continue;
    }

    if (/^#{3,6}\s+/.test(line)) {
      findings.push({
        severity: "error",
        check: "llms-txt-v2-ast",
        location: `${sourceLabel}:${lineNo}`,
        message: `Subheading "${trimmed}" violates llms.txt v2 grammar. Preamble forbids headings, and H2 sections allow only Markdown link lists. Move structured brand/voice guidance into /.well-known/brand.json or a linked .md page.`,
      });
      continue;
    }

    if (line.startsWith("## ")) {
      currentSection = line.slice(3).trim();
      if (!sections.has(currentSection)) {
        sections.set(currentSection, []);
      }
      state = "IN_SECTION";
      continue;
    }

    if (state === "AFTER_H1") {
      if (trimmed.startsWith(">")) {
        blockquoteLines.push(trimmed.replace(/^>\s?/, ""));
      } else {
        state = "IN_PREAMBLE";
      }
      continue;
    }

    if (state === "IN_PREAMBLE") {
      if (trimmed.startsWith(">")) {
        findings.push({
          severity: "warning",
          check: "llms-txt-v2-ast",
          location: `${sourceLabel}:${lineNo}`,
          message: "Blockquote appears after preamble text; place the summary blockquote immediately after the H1 heading.",
        });
      }
      continue;
    }

    if (state === "IN_SECTION") {
      const linkMatch = line.match(/^\s*[-*]\s+\[([^\]]+)\]\(([^)\s]+)\)(?:\s*:\s*(.*))?$/);
      if (!linkMatch) {
        findings.push({
          severity: "error",
          check: "llms-txt-v2-ast",
          location: `${sourceLabel}:${lineNo}`,
          message: `Non-link line inside "## ${currentSection}": "${trimmed.slice(0, 70)}". Every line under an H2 section must match "- [Title](url): Optional note".`,
        });
        continue;
      }

      const [, title, url, desc] = linkMatch;
      totalLinks += 1;
      sections.get(currentSection).push({ title, url, desc: desc ?? "", lineNo });

      if (!/^https?:\/\//.test(url) && !url.startsWith("/")) {
        findings.push({
          severity: "warning",
          check: "llms-txt-v2-links",
          location: `${sourceLabel}:${lineNo}`,
          message: `Relative link "${url}" should use a full https:// canonical URL or leading "/" path.`,
        });
      }

      const isMarkdownOrRaw = /\.(md|mdx|txt|json|yaml|yml|py|ts|xml|svg|pdf|csv|rss|atom)(\?.*)?$/i.test(url);
      if (!isMarkdownOrRaw) {
        htmlOnlyInternalLinks += 1;
      }
    }
  }

  if (!h1Title) {
    findings.push({
      severity: "error",
      check: "llms-txt-v2-ast",
      location: sourceLabel,
      message: "Missing required '# Title' H1 heading in llms.txt.",
    });
  }

  if (blockquoteLines.length === 0) {
    findings.push({
      severity: "warning",
      check: "llms-txt-v2-summary",
      location: sourceLabel,
      message: "Missing recommended '> Summary' blockquote immediately after the H1 heading.",
    });
  }

  if (totalLinks === 0) {
    findings.push({
      severity: "warning",
      check: "llms-txt-v2-links",
      location: sourceLabel,
      message: "llms.txt contains zero H2 file-list links.",
    });
  } else if (htmlOnlyInternalLinks > 0) {
    findings.push({
      severity: "warning",
      check: "llms-txt-v2-md-twins",
      location: sourceLabel,
      message: `${htmlOnlyInternalLinks} of ${totalLinks} links in llms.txt point to non-Markdown URLs. In llms.txt v2, link directly to clean .md page twins (page.md or page.html.md) where available.`,
    });
  }

  const estimatedTokens = Math.ceil(Buffer.byteLength(text, "utf8") / 4);
  if (estimatedTokens > 4000) {
    findings.push({
      severity: "warning",
      check: "llms-txt-v2-size",
      location: sourceLabel,
      message: `llms.txt is ~${estimatedTokens} tokens. Keep /llms.txt compact as an index and offload bulk prose to linked .md twins or /llms-full.txt.`,
    });
  }

  return {
    findings,
    ast: {
      title: h1Title,
      summary: blockquoteLines.join(" ").trim(),
      sectionNames: [...sections.keys()],
      totalLinks,
      estimatedTokens,
    },
  };
}

/**
 * Validate a brand.json object against AdCP v3.2.10 schema invariants.
 * @param {unknown} doc
 * @param {string} sourceLabel
 */
function validateBrandJson(doc, sourceLabel) {
  const findings = [];
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    findings.push({
      severity: "error",
      check: "adcp-brand-json",
      location: sourceLabel,
      message: "brand.json root must be a JSON object.",
    });
    return findings;
  }

  const obj = /** @type {Record<string, unknown>} */ (doc);

  if ("brand_name" in obj || "brand_colors" in obj) {
    findings.push({
      severity: "error",
      check: "adcp-brand-json",
      location: sourceLabel,
      message: "Found non-standard keys ('brand_name' or 'brand_colors'). AdCP v3 brand.json uses 'id' + 'names' and 'colors'.",
    });
  }

  // Variant 1: authoritative_location redirect
  if ("authoritative_location" in obj) {
    if (typeof obj.authoritative_location !== "string" || !obj.authoritative_location.startsWith("https://")) {
      findings.push({
        severity: "error",
        check: "adcp-brand-json",
        location: sourceLabel,
        message: "Variant 1 authoritative_location must be an https:// URI.",
      });
    }
    return findings;
  }

  // Variant 4 or 2: house present
  if ("house" in obj) {
    if (typeof obj.house === "string") {
      if (!DOMAIN_RE.test(obj.house)) {
        findings.push({
          severity: "error",
          check: "adcp-brand-json",
          location: sourceLabel,
          message: `Variant 2 house redirect "${obj.house}" must be a bare lowercase DNS hostname.`,
        });
      }
      return findings;
    }
    if (obj.house && typeof obj.house === "object") {
      const house = /** @type {Record<string, unknown>} */ (obj.house);
      if (typeof house.domain !== "string" || !DOMAIN_RE.test(house.domain) || typeof house.name !== "string") {
        findings.push({
          severity: "error",
          check: "adcp-brand-json",
          location: sourceLabel,
          message: "Variant 4 house object requires valid 'domain' (bare DNS hostname) and 'name'.",
        });
      }
      const brands = Array.isArray(obj.brands) ? obj.brands : [];
      const brandRefs = Array.isArray(obj.brand_refs) ? obj.brand_refs : [];
      if (brands.length === 0 && brandRefs.length === 0) {
        findings.push({
          severity: "error",
          check: "adcp-brand-json",
          location: sourceLabel,
          message: "Variant 4 house portfolio requires at least one entry in 'brands[]' or 'brand_refs[]'.",
        });
      }
      const inlineIds = new Set();
      for (const b of brands) {
        if (b && typeof b === "object" && typeof b.id === "string") {
          inlineIds.add(b.id);
        }
      }
      for (const ref of brandRefs) {
        if (ref && typeof ref === "object" && typeof ref.brand_id === "string" && inlineIds.has(ref.brand_id)) {
          findings.push({
            severity: "error",
            check: "adcp-brand-json",
            location: sourceLabel,
            message: `Cross-array collision: brand_id "${ref.brand_id}" cannot appear in both brands[] and brand_refs[].`,
          });
        }
      }
      return findings;
    }
  }

  // Variant 3: MCP agent pointer without inline brand id
  if (("agents" in obj || "brand_agent" in obj) && !("id" in obj)) {
    return findings;
  }

  // Variant 5: Brand Canonical Document
  for (const forbidden of BRAND_V5_FORBIDDEN_KEYS) {
    if (forbidden in obj) {
      findings.push({
        severity: "error",
        check: "adcp-brand-json",
        location: sourceLabel,
        message: `Key "${forbidden}" is disallowed on a Variant 5 standalone Brand Canonical Document.`,
      });
    }
  }

  if (typeof obj.id !== "string" || !BRAND_ID_RE.test(obj.id)) {
    findings.push({
      severity: "error",
      check: "adcp-brand-json",
      location: sourceLabel,
      message: `Variant 5 brand.json requires 'id' matching ^[a-z0-9_]+$ (lowercase alphanumeric and underscores only; got ${JSON.stringify(obj.id)}).`,
    });
  }

  if (!Array.isArray(obj.names) || obj.names.length === 0) {
    findings.push({
      severity: "error",
      check: "adcp-brand-json",
      location: sourceLabel,
      message: "Variant 5 brand.json requires a non-empty 'names' array (for example: [{ \"en_US\": \"Brand Name\" }]).",
    });
  } else {
    for (const item of obj.names) {
      if (!item || typeof item !== "object" || Array.isArray(item) || Object.keys(item).length !== 1) {
        findings.push({
          severity: "error",
          check: "adcp-brand-json",
          location: sourceLabel,
          message: "Each entry in 'names[]' must be a single-key locale object such as { \"en_US\": \"Acme\" }.",
        });
      }
    }
  }

  if (obj.colors && typeof obj.colors === "object" && !Array.isArray(obj.colors)) {
    for (const [role, val] of Object.entries(obj.colors)) {
      if (typeof val === "string" && !HEX_COLOR_RE.test(val)) {
        findings.push({
          severity: "warning",
          check: "adcp-brand-json",
          location: sourceLabel,
          message: `Color "${role}": "${val}" should be a 6-digit hex code (#RRGGBB).`,
        });
      } else if (Array.isArray(val)) {
        for (const entry of val) {
          if (typeof entry === "string" && !HEX_COLOR_RE.test(entry)) {
            findings.push({
              severity: "warning",
              check: "adcp-brand-json",
              location: sourceLabel,
              message: `Color "${role}" entry "${entry}" should be a 6-digit hex code (#RRGGBB).`,
            });
          }
        }
      }
    }
  }

  if (Array.isArray(obj.logos)) {
    for (const logo of obj.logos) {
      if (!logo || typeof logo !== "object" || typeof logo.url !== "string" || !logo.url.startsWith("http")) {
        findings.push({
          severity: "error",
          check: "adcp-brand-json",
          location: sourceLabel,
          message: "Every item in brand.json 'logos[]' requires a full http(s) 'url'.",
        });
      }
    }
  }

  return findings;
}

/**
 * Validate an adagents.json object against AdCP v3.2.10 schema invariants.
 * @param {unknown} doc
 * @param {string} sourceLabel
 */
function validateAdagentsJson(doc, sourceLabel) {
  const findings = [];
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    findings.push({
      severity: "error",
      check: "adcp-adagents-json",
      location: sourceLabel,
      message: "adagents.json root must be a JSON object.",
    });
    return findings;
  }

  const obj = /** @type {Record<string, unknown>} */ (doc);

  if ("authoritative_location" in obj) {
    if (typeof obj.authoritative_location !== "string" || !obj.authoritative_location.startsWith("https://")) {
      findings.push({
        severity: "error",
        check: "adcp-adagents-json",
        location: sourceLabel,
        message: "Variant 1 authoritative_location in adagents.json must be an https:// URI.",
      });
    }
    return findings;
  }

  if (!Array.isArray(obj.authorized_agents)) {
    findings.push({
      severity: "error",
      check: "adcp-adagents-json",
      location: sourceLabel,
      message: "Inline adagents.json requires an 'authorized_agents' array.",
    });
    return findings;
  }

  const declaredPropertyIds = new Set();
  if (Array.isArray(obj.properties)) {
    for (const prop of obj.properties) {
      if (!prop || typeof prop !== "object") continue;
      if (typeof prop.property_id === "string") {
        declaredPropertyIds.add(prop.property_id);
      }
      if (typeof prop.property_type !== "string" || typeof prop.name !== "string" || !Array.isArray(prop.identifiers) || prop.identifiers.length === 0) {
        findings.push({
          severity: "error",
          check: "adcp-adagents-json",
          location: sourceLabel,
          message: "Each entry in properties[] requires 'property_type', 'name', and non-empty 'identifiers[]'.",
        });
      }
      if (Array.isArray(prop.supported_channels)) {
        for (const ch of prop.supported_channels) {
          if (typeof ch !== "string" || !ADCP_CHANNELS.has(ch)) {
            findings.push({
              severity: "warning",
              check: "adcp-adagents-json",
              location: sourceLabel,
              message: `Unknown AdCP media channel "${ch}" in supported_channels.`,
            });
          }
        }
      }
    }
  }

  for (let i = 0; i < obj.authorized_agents.length; i += 1) {
    const agent = obj.authorized_agents[i];
    if (!agent || typeof agent !== "object") {
      findings.push({
        severity: "error",
        check: "adcp-adagents-json",
        location: `${sourceLabel}#authorized_agents[${i}]`,
        message: "authorized_agents entry must be an object.",
      });
      continue;
    }

    if (typeof agent.url !== "string" || !agent.url.startsWith("https://")) {
      findings.push({
        severity: "error",
        check: "adcp-adagents-json",
        location: `${sourceLabel}#authorized_agents[${i}]`,
        message: "authorized_agents entry requires an https:// 'url'.",
      });
    }

    if (typeof agent.authorized_for !== "string" || agent.authorized_for.trim().length === 0 || agent.authorized_for.length > 500) {
      findings.push({
        severity: "error",
        check: "adcp-adagents-json",
        location: `${sourceLabel}#authorized_agents[${i}]`,
        message: "authorized_agents entry requires 'authorized_for' (1 to 500 characters) per AdCP authorized-agent-base.json.",
      });
    }

    const authType = agent.authorization_type;
    if (typeof authType !== "string" || !ADCP_AUTH_TYPES.has(authType)) {
      findings.push({
        severity: "error",
        check: "adcp-adagents-json",
        location: `${sourceLabel}#authorized_agents[${i}]`,
        message: `Invalid authorization_type ${JSON.stringify(authType)}. Expected one of: ${[...ADCP_AUTH_TYPES.keys()].join(", ")}.`,
      });
      continue;
    }

    const requiredArrayField = ADCP_AUTH_TYPES.get(authType);
    if (!Array.isArray(agent[requiredArrayField]) || agent[requiredArrayField].length === 0) {
      findings.push({
        severity: "error",
        check: "adcp-adagents-json",
        location: `${sourceLabel}#authorized_agents[${i}]`,
        message: `authorization_type "${authType}" requires a non-empty '${requiredArrayField}' array.`,
      });
    } else if (authType === "property_ids") {
      for (const pid of agent.property_ids) {
        if (!declaredPropertyIds.has(pid)) {
          findings.push({
            severity: "error",
            check: "adcp-adagents-json",
            location: `${sourceLabel}#authorized_agents[${i}]`,
            message: `property_id "${pid}" is referenced in authorized_agents but missing from top-level properties[].`,
          });
        }
      }
    }
  }

  return findings;
}

/**
 * Validate /.well-known/mcp.json (SEP-2127 Server Card).
 * @param {unknown} doc
 * @param {string} rawText
 * @param {string} sourceLabel
 */
function validateMcpJson(doc, rawText, sourceLabel) {
  const findings = [];
  if (SECRET_VALUE_RE.test(rawText)) {
    findings.push({
      severity: "error",
      check: "mcp-server-card-security",
      location: sourceLabel,
      message: "Potential secret or token detected inside public mcp.json. Never include credentials in /.well-known/mcp.json.",
    });
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    findings.push({
      severity: "error",
      check: "mcp-server-card",
      location: sourceLabel,
      message: "mcp.json must be a JSON object.",
    });
    return findings;
  }
  const obj = /** @type {Record<string, unknown>} */ (doc);
  for (const req of ["name", "description", "version"]) {
    if (typeof obj[req] !== "string" || obj[req].trim() === "") {
      findings.push({
        severity: "error",
        check: "mcp-server-card",
        location: sourceLabel,
        message: `mcp.json missing required string field '${req}'.`,
      });
    }
  }
  if (!Array.isArray(obj.remotes) || obj.remotes.length === 0) {
    findings.push({
      severity: "error",
      check: "mcp-server-card",
      location: sourceLabel,
      message: "mcp.json requires a non-empty 'remotes[]' array with { type, url }.",
    });
  }
  return findings;
}

/**
 * Validate /.well-known/agent-card.json (A2A).
 * @param {unknown} doc
 * @param {string} sourceLabel
 */
function validateAgentCardJson(doc, sourceLabel) {
  const findings = [];
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    findings.push({
      severity: "error",
      check: "a2a-agent-card",
      location: sourceLabel,
      message: "agent-card.json must be a JSON object.",
    });
    return findings;
  }
  const obj = /** @type {Record<string, unknown>} */ (doc);
  for (const req of ["name", "description", "version"]) {
    if (typeof obj[req] !== "string" || obj[req].trim() === "") {
      findings.push({
        severity: "error",
        check: "a2a-agent-card",
        location: sourceLabel,
        message: `agent-card.json missing required string field '${req}'.`,
      });
    }
  }
  if (typeof obj.url !== "string" && !Array.isArray(obj.supportedInterfaces)) {
    findings.push({
      severity: "error",
      check: "a2a-agent-card",
      location: sourceLabel,
      message: "agent-card.json requires either 'url' or 'supportedInterfaces[]'.",
    });
  }
  if (!Array.isArray(obj.skills) || obj.skills.length === 0) {
    findings.push({
      severity: "warning",
      check: "a2a-agent-card",
      location: sourceLabel,
      message: "agent-card.json should declare at least one skill in 'skills[]'.",
    });
  }
  return findings;
}

/**
 * Validate /.well-known/api-catalog (RFC 9727 JSON Linkset).
 * @param {unknown} doc
 * @param {string} sourceLabel
 */
function validateApiCatalogJson(doc, sourceLabel) {
  const findings = [];
  if (!doc || typeof doc !== "object" || Array.isArray(doc) || !Array.isArray(doc.linkset)) {
    findings.push({
      severity: "error",
      check: "rfc9727-api-catalog",
      location: sourceLabel,
      message: "api-catalog must be an RFC 9264 JSON object containing a 'linkset' array.",
    });
    return findings;
  }
  for (let i = 0; i < doc.linkset.length; i += 1) {
    const entry = doc.linkset[i];
    if (!entry || typeof entry !== "object" || typeof entry.anchor !== "string") {
      findings.push({
        severity: "error",
        check: "rfc9727-api-catalog",
        location: `${sourceLabel}#linkset[${i}]`,
        message: "Each linkset entry in api-catalog requires an 'anchor' URI.",
      });
    }
  }
  return findings;
}

/**
 * Validate /.well-known/oauth-protected-resource (RFC 9728).
 * @param {unknown} doc
 * @param {string} sourceLabel
 */
function validateOauthProtectedResource(doc, sourceLabel) {
  const findings = [];
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    findings.push({
      severity: "error",
      check: "rfc9728-oauth-protected-resource",
      location: sourceLabel,
      message: "oauth-protected-resource must be a JSON object.",
    });
    return findings;
  }
  if (typeof doc.resource !== "string" || !Array.isArray(doc.authorization_servers) || doc.authorization_servers.length === 0) {
    findings.push({
      severity: "error",
      check: "rfc9728-oauth-protected-resource",
      location: sourceLabel,
      message: "RFC 9728 oauth-protected-resource requires 'resource' and non-empty 'authorization_servers[]'.",
    });
  }
  return findings;
}

/**
 * Validate /.well-known/security.txt (RFC 9116).
 * @param {string} text
 * @param {string} sourceLabel
 */
function validateSecurityTxt(text, sourceLabel) {
  const findings = [];
  const hasContact = /^Contact:\s*\S+/m.test(text);
  const expiresMatch = text.match(/^Expires:\s*(.+)$/m);

  if (!hasContact) {
    findings.push({
      severity: "error",
      check: "rfc9116-security-txt",
      location: sourceLabel,
      message: "security.txt is missing required 'Contact:' field (RFC 9116).",
    });
  }

  if (!expiresMatch) {
    findings.push({
      severity: "error",
      check: "rfc9116-security-txt",
      location: sourceLabel,
      message: "security.txt is missing required 'Expires:' ISO 8601 timestamp (RFC 9116).",
    });
  } else {
    const expDate = new Date(expiresMatch[1].trim());
    if (Number.isNaN(expDate.getTime())) {
      findings.push({
        severity: "error",
        check: "rfc9116-security-txt",
        location: sourceLabel,
        message: `Invalid 'Expires:' date "${expiresMatch[1].trim()}" in security.txt.`,
      });
    } else {
      const now = Date.now();
      const daysRemaining = (expDate.getTime() - now) / (1000 * 60 * 60 * 24);
      if (daysRemaining <= 0) {
        findings.push({
          severity: "error",
          check: "rfc9116-security-txt",
          location: sourceLabel,
          message: `security.txt expired on ${expDate.toISOString()}. Update 'Expires:' to a future ISO 8601 timestamp.`,
        });
      } else if (daysRemaining < 30) {
        findings.push({
          severity: "warning",
          check: "rfc9116-security-txt",
          location: sourceLabel,
          message: `security.txt expires in ${Math.round(daysRemaining)} days (${expDate.toISOString()}). Renew soon.`,
        });
      }
    }
  }
  return findings;
}

/**
 * Audit a local project directory against Agentic Web standards.
 * @param {string} rootDir
 */
function auditLocalRepo(rootDir) {
  const manifest = buildRepoManifest(rootDir);
  const findings = [];

  // 1. llms.txt check
  const llmsCandidates = ["public/llms.txt", "llms.txt"]
    .map((rel) => ({ rel, full: path.join(rootDir, rel) }))
    .filter((c) => fs.existsSync(c.full));

  let llmsAst = null;
  if (llmsCandidates.length === 0 && !manifest.hasLlmsTxt) {
    findings.push({
      severity: "error",
      check: "llms-txt-presence",
      location: rootDir,
      message: "Missing /llms.txt (expected public/llms.txt or app/llms.txt/route.ts).",
    });
  } else if (llmsCandidates.length > 0) {
    const raw = fs.readFileSync(llmsCandidates[0].full, "utf8");
    const res = validateLlmsTxtV2(raw, llmsCandidates[0].rel);
    llmsAst = res.ast;
    findings.push(...res.findings);
  }

  // 2. Discoverability link relations in codebase (rel="alternate" type="text/markdown" + rel="describedby")
  const configAndLayoutFiles = walkRepo(rootDir).filter((f) =>
    /^(src\/)?app\/.*layout\.(tsx|ts|jsx|js)$|^next\.config\.(ts|mjs|js)$|^(src\/)?(middleware|proxy)\.(ts|js|mjs)$|^public\/_headers$/.test(f)
  );
  const combinedConfigText = configAndLayoutFiles
    .map((f) => fs.readFileSync(path.join(rootDir, f), "utf8"))
    .join("\n");

  const hasMarkdownAlternate =
    combinedConfigText.includes("text/markdown") &&
    (combinedConfigText.includes("alternate") || combinedConfigText.includes("alternates"));
  const hasDescribedBy = combinedConfigText.includes("describedby");

  if (!hasMarkdownAlternate) {
    findings.push({
      severity: "warning",
      check: "llms-txt-v2-link-alternate",
      location: "layout / headers",
      message: "No 'rel=\"alternate\" type=\"text/markdown\"' link or Next.js alternates.types['text/markdown'] declaration detected.",
    });
  }
  if (!hasDescribedBy) {
    findings.push({
      severity: "warning",
      check: "llms-txt-v2-link-describedby",
      location: "layout / headers",
      message: "No 'rel=\"describedby\"' link pointing to /llms.txt detected in HTML <head> or HTTP Link headers.",
    });
  }

  // 3. Middleware interception check
  for (const mwRel of manifest.middlewareFiles) {
    const mwText = fs.readFileSync(path.join(rootDir, mwRel), "utf8");
    if (mwText.includes("matcher") && !mwText.includes(".well-known")) {
      findings.push({
        severity: "warning",
        check: "rfc8615-middleware-guard",
        location: mwRel,
        message: `${mwRel} defines a route matcher without excluding '.well-known' or '.md'. Verify middleware does not rewrite or block discovery endpoints.`,
      });
    }
  }

  // 4. AdCP & RFC 8615 well-known files check
  const wellKnownJsonValidators = [
    { rel: "public/.well-known/brand.json", fn: (doc) => validateBrandJson(doc, "public/.well-known/brand.json") },
    { rel: "public/.well-known/adagents.json", fn: (doc) => validateAdagentsJson(doc, "public/.well-known/adagents.json") },
    { rel: "public/.well-known/mcp.json", fn: (doc, raw) => validateMcpJson(doc, raw, "public/.well-known/mcp.json") },
    { rel: "public/.well-known/agent-card.json", fn: (doc) => validateAgentCardJson(doc, "public/.well-known/agent-card.json") },
    { rel: "public/.well-known/api-catalog", fn: (doc) => validateApiCatalogJson(doc, "public/.well-known/api-catalog") },
    { rel: "public/.well-known/oauth-protected-resource", fn: (doc) => validateOauthProtectedResource(doc, "public/.well-known/oauth-protected-resource") },
  ];

  const brandJsonPath = path.join(rootDir, "public/.well-known/brand.json");
  const hasBrandRoute = manifest.wellKnownFiles.some((f) => f.includes("brand.json"));
  if (!fs.existsSync(brandJsonPath) && !hasBrandRoute) {
    findings.push({
      severity: "warning",
      check: "adcp-brand-json-presence",
      location: "public/.well-known/brand.json",
      message: "Missing /.well-known/brand.json (AdCP v3 canonical brand identity, palette, typography, and voice rules).",
    });
  }

  for (const item of wellKnownJsonValidators) {
    const full = path.join(rootDir, item.rel);
    if (!fs.existsSync(full)) continue;
    const raw = fs.readFileSync(full, "utf8");
    try {
      const parsed = JSON.parse(raw);
      findings.push(...item.fn(parsed, raw));
    } catch (err) {
      findings.push({
        severity: "error",
        check: "well-known-json-syntax",
        location: item.rel,
        message: `Invalid JSON in ${item.rel}: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  const secTxtPath = path.join(rootDir, "public/.well-known/security.txt");
  if (fs.existsSync(secTxtPath)) {
    findings.push(...validateSecurityTxt(fs.readFileSync(secTxtPath, "utf8"), "public/.well-known/security.txt"));
  } else if (!manifest.wellKnownFiles.some((f) => f.includes("security.txt"))) {
    findings.push({
      severity: "warning",
      check: "rfc9116-security-txt-presence",
      location: "public/.well-known/security.txt",
      message: "Missing /.well-known/security.txt (RFC 9116).",
    });
  }

  // 5. Crawl & Content-Signal check
  const robotsFiles = ["public/robots.txt", "robots.txt", "app/robots.ts", "src/app/robots.ts"]
    .filter((rel) => fs.existsSync(path.join(rootDir, rel)));
  if (robotsFiles.length > 0) {
    const robotsText = robotsFiles.map((rel) => fs.readFileSync(path.join(rootDir, rel), "utf8")).join("\n");
    if (!robotsText.includes("Content-Signal") && !combinedConfigText.includes("Content-Signal")) {
      findings.push({
        severity: "info",
        check: "aipref-content-signal",
        location: robotsFiles[0],
        message: "Consider declaring 'Content-Signal: search=yes, ai-input=yes, ai-train=no' in robots.txt or response headers.",
      });
    }
  } else {
    findings.push({
      severity: "warning",
      check: "robots-presence",
      location: rootDir,
      message: "No robots.txt or app/robots.ts found.",
    });
  }

  return { manifest, llmsAst, findings };
}

/**
 * Audit a live origin over HTTP(S).
 * @param {string} baseUrl
 */
async function auditLiveUrl(baseUrl) {
  const origin = new URL(baseUrl).origin;
  const findings = [];
  const probed = {};

  async function probe(pathname, headers = {}, manualRedirect = false) {
    const target = `${origin}${pathname}`;
    try {
      const res = await fetch(target, {
        headers: { "User-Agent": "agentic-web-audit/1.0", ...headers },
        redirect: manualRedirect ? "manual" : "follow",
        signal: AbortSignal.timeout(8000),
      });
      const body = res.status >= 200 && res.status < 300 ? await res.text() : "";
      return {
        ok: res.status >= 200 && res.status < 300,
        status: res.status,
        locationHeader: res.headers.get("location") ?? "",
        contentType: res.headers.get("content-type") ?? "",
        linkHeader: res.headers.get("link") ?? "",
        cors: res.headers.get("access-control-allow-origin") ?? "",
        vary: res.headers.get("vary") ?? "",
        contentSignal: res.headers.get("content-signal") ?? "",
        markdownTokens: res.headers.get("x-markdown-tokens") ?? "",
        bytes: Buffer.byteLength(body, "utf8"),
        body,
      };
    } catch (err) {
      return {
        ok: false,
        status: 0,
        error: err instanceof Error ? err.message : String(err),
        contentType: "",
        linkHeader: "",
        cors: "",
        vary: "",
        contentSignal: "",
        markdownTokens: "",
        bytes: 0,
        body: "",
      };
    }
  }

  const [homeRes, homeMdNeg, llmsRes, brandRes, adagentsRes, mcpRes, agentCardRes, apiCatRes, secRes, robotsRes] =
    await Promise.all([
      probe("/"),
      probe("/", { Accept: "text/markdown" }),
      probe("/llms.txt"),
      probe("/.well-known/brand.json", {}, true),
      probe("/.well-known/adagents.json", {}, true),
      probe("/.well-known/mcp.json"),
      probe("/.well-known/agent-card.json"),
      probe("/.well-known/api-catalog"),
      probe("/.well-known/security.txt"),
      probe("/robots.txt"),
    ]);

  probed["/"] = { status: homeRes.status, contentType: homeRes.contentType, linkHeader: homeRes.linkHeader };
  probed["/ (Accept: text/markdown)"] = {
    status: homeMdNeg.status,
    contentType: homeMdNeg.contentType,
    vary: homeMdNeg.vary,
    markdownTokens: homeMdNeg.markdownTokens,
    contentSignal: homeMdNeg.contentSignal,
  };

  // Check Link relations on homepage
  const hasLinkAltHeader = homeRes.linkHeader.includes("text/markdown") && homeRes.linkHeader.includes("alternate");
  const hasLinkDescHeader = homeRes.linkHeader.includes("describedby");
  const hasHtmlAlt = /<link[^>]+rel=["']alternate["'][^>]+type=["']text\/markdown["']/i.test(homeRes.body) ||
    /<link[^>]+type=["']text\/markdown["'][^>]+rel=["']alternate["']/i.test(homeRes.body);
  const hasHtmlDesc = /<link[^>]+rel=["']describedby["']/i.test(homeRes.body);

  if (!hasLinkAltHeader && !hasHtmlAlt) {
    findings.push({
      severity: "warning",
      check: "live-llms-v2-link-alternate",
      location: `${origin}/`,
      message: "Root page neither emits HTTP Link rel=\"alternate\"; type=\"text/markdown\" nor HTML <link rel=\"alternate\" type=\"text/markdown\">.",
    });
  }
  if (!hasLinkDescHeader && !hasHtmlDesc) {
    findings.push({
      severity: "warning",
      check: "live-llms-v2-link-describedby",
      location: `${origin}/`,
      message: "Root page neither emits HTTP Link rel=\"describedby\" nor HTML <link rel=\"describedby\" href=\"/llms.txt\">.",
    });
  }
  if (!homeMdNeg.contentType.includes("text/markdown")) {
    findings.push({
      severity: "info",
      check: "live-accept-markdown",
      location: `${origin}/`,
      message: "Origin does not negotiate 'Accept: text/markdown' at root URL (optional when static .md page twins are linked).",
    });
  }

  // Validate /llms.txt
  probed["/llms.txt"] = { status: llmsRes.status, contentType: llmsRes.contentType, bytes: llmsRes.bytes };
  let llmsAst = null;
  if (!llmsRes.ok) {
    findings.push({
      severity: "error",
      check: "live-llms-txt",
      location: `${origin}/llms.txt`,
      message: `GET /llms.txt returned HTTP ${llmsRes.status}.`,
    });
  } else if (llmsRes.contentType.includes("text/html")) {
    findings.push({
      severity: "error",
      check: "live-llms-txt-content-type",
      location: `${origin}/llms.txt`,
      message: `GET /llms.txt returned HTML (${llmsRes.contentType}) instead of text/markdown or text/plain. Check SPA fallback or middleware rules.`,
    });
  } else {
    const parsed = validateLlmsTxtV2(llmsRes.body, `${origin}/llms.txt`);
    llmsAst = parsed.ast;
    findings.push(...parsed.findings);
  }

  // Helper for optional live JSON well-known endpoints
  const checkLiveWellKnown = (pathname, res, validator, expectType = "application/json", isAdcpPointer = false) => {
    probed[pathname] = { status: res.status, contentType: res.contentType, cors: res.cors };
    if (isAdcpPointer && res.status >= 300 && res.status < 400) {
      const loc = res.locationHeader;
      let isSameDomainWwwRedirect = false;
      try {
        const srcHost = new URL(origin).hostname.replace(/^www\./, "");
        const dstHost = new URL(loc, origin).hostname.replace(/^www\./, "");
        isSameDomainWwwRedirect = srcHost === dstHost;
      } catch {
        isSameDomainWwwRedirect = false;
      }
      findings.push({
        severity: isSameDomainWwwRedirect ? "warning" : "error",
        check: isSameDomainWwwRedirect ? "adcp-canonical-host-redirect" : "adcp-no-redirect",
        location: `${origin}${pathname}`,
        message: isSameDomainWwwRedirect
          ? `${pathname} returned HTTP ${res.status} to canonical host (${loc}). Prefer serving /.well-known/* directly with 200 OK on bare apex as well so strict no-redirect validators resolve without extra hops.`
          : `${pathname} returned cross-host HTTP ${res.status} redirect (${loc}). AdCP requires 200 OK at origin (use inline 'authoritative_location' JSON pointer instead of HTTP 3xx redirects).`,
      });
      return;
    }
    if (!res.ok) return;
    if (res.contentType.includes("text/html")) {
      findings.push({
        severity: "error",
        check: "well-known-html-fallback",
        location: `${origin}${pathname}`,
        message: `${pathname} returned HTML 200 OK (${res.contentType}). Exclude /.well-known/* from SPA fallback, Cloudflare challenges, and Next.js catch-all routes.`,
      });
      return;
    }
    if (isAdcpPointer && res.bytes > 5 * 1024 * 1024) {
      findings.push({
        severity: "error",
        check: "adcp-size-cap",
        location: `${origin}${pathname}`,
        message: `${pathname} exceeds AdCP 5 MB well-known SSRF size cap (${res.bytes} bytes).`,
      });
    }
    if (!res.contentType.includes(expectType) && !res.contentType.includes("json")) {
      findings.push({
        severity: "error",
        check: "well-known-content-type",
        location: `${origin}${pathname}`,
        message: `${pathname} returned Content-Type "${res.contentType}" (expected ${expectType}).`,
      });
      return;
    }
    if (res.cors !== "*") {
      findings.push({
        severity: "warning",
        check: "well-known-cors",
        location: `${origin}${pathname}`,
        message: `${pathname} missing 'Access-Control-Allow-Origin: *' header for browser/IDE agent discovery.`,
      });
    }
    try {
      const parsed = JSON.parse(res.body);
      findings.push(...validator(parsed, res.body, `${origin}${pathname}`));
    } catch (err) {
      findings.push({
        severity: "error",
        check: "well-known-json-syntax",
        location: `${origin}${pathname}`,
        message: `Invalid JSON at ${pathname}: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  };

  checkLiveWellKnown("/.well-known/brand.json", brandRes, (d, _r, loc) => validateBrandJson(d, loc), "application/json", true);
  checkLiveWellKnown("/.well-known/adagents.json", adagentsRes, (d, _r, loc) => validateAdagentsJson(d, loc), "application/json", true);
  checkLiveWellKnown("/.well-known/mcp.json", mcpRes, (d, r, loc) => validateMcpJson(d, r, loc));
  checkLiveWellKnown("/.well-known/agent-card.json", agentCardRes, (d, _r, loc) => validateAgentCardJson(d, loc));
  checkLiveWellKnown("/.well-known/api-catalog", apiCatRes, (d, _r, loc) => validateApiCatalogJson(d, loc), "application/linkset+json");

  if (!brandRes.ok && !(brandRes.status >= 300 && brandRes.status < 400)) {
    findings.push({
      severity: "warning",
      check: "live-adcp-brand-json",
      location: `${origin}/.well-known/brand.json`,
      message: "No /.well-known/brand.json published on origin.",
    });
  }

  probed["/.well-known/security.txt"] = { status: secRes.status, contentType: secRes.contentType };
  if (secRes.ok && !secRes.contentType.includes("text/html")) {
    findings.push(...validateSecurityTxt(secRes.body, `${origin}/.well-known/security.txt`));
  } else {
    findings.push({
      severity: "warning",
      check: "live-security-txt",
      location: `${origin}/.well-known/security.txt`,
      message: "Missing or HTML-wrapped /.well-known/security.txt (RFC 9116).",
    });
  }

  probed["/robots.txt"] = { status: robotsRes.status };
  if (robotsRes.ok && !robotsRes.body.includes("Content-Signal") && !homeRes.contentSignal) {
    findings.push({
      severity: "info",
      check: "live-content-signal",
      location: `${origin}/robots.txt`,
      message: "No Content-Signal policy detected in /robots.txt or HTTP response headers.",
    });
  }

  return { origin, probed, llmsAst, findings };
}

/**
 * Format and print human-readable or JSON report.
 */
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(
      [
        "Usage: node agentic-web-audit.mjs [options]",
        "",
        "Options:",
        "  --root <dir>          Audit local repository directory (default: cwd if --url omitted)",
        "  --url <https://...>   Probe live origin over HTTP(S) for headers, status, and schemas",
        "  --manifest [file]     Emit deterministic repo manifest JSON (to file or stdout)",
        "  --json                Emit full audit report as JSON",
        "  --report-only         Exit 0 even when error-severity findings are present",
      ].join("\n")
    );
    return;
  }

  if (opts.manifestOut) {
    const targetRoot = opts.root ?? process.cwd();
    const manifest = buildRepoManifest(targetRoot);
    const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
    if (opts.manifestOut === "STDOUT") {
      process.stdout.write(serialized);
    } else {
      fs.writeFileSync(opts.manifestOut, serialized, "utf8");
      console.log(`Wrote manifest to ${opts.manifestOut}`);
    }
    return;
  }

  const report = {
    timestamp: new Date().toISOString(),
    local: null,
    live: null,
    summary: { errors: 0, warnings: 0, info: 0 },
  };

  if (opts.root) {
    report.local = auditLocalRepo(opts.root);
  }
  if (opts.url) {
    report.live = await auditLiveUrl(opts.url);
  }

  const allFindings = [
    ...(report.local?.findings ?? []),
    ...(report.live?.findings ?? []),
  ];

  for (const f of allFindings) {
    if (f.severity === "error") report.summary.errors += 1;
    else if (f.severity === "warning") report.summary.warnings += 1;
    else report.summary.info += 1;
  }

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    if (report.local) {
      console.log(`Local Repo Audit: ${report.local.manifest.root} (${report.local.manifest.framework})`);
      console.log(
        `  Routes: ${report.local.manifest.appRoutes.length} | Content files: ${report.local.manifest.contentFiles.length} | .md twins: ${report.local.manifest.markdownTwins.length} | .well-known files: ${report.local.manifest.wellKnownFiles.length}`
      );
      if (report.local.llmsAst) {
        console.log(
          `  llms.txt AST: H1="${report.local.llmsAst.title}" | Sections=${report.local.llmsAst.sectionNames.length} | Links=${report.local.llmsAst.totalLinks} | ~${report.local.llmsAst.estimatedTokens} tokens`
        );
      }
    }
    if (report.live) {
      console.log(`Live URL Audit: ${report.live.origin}`);
      for (const [ep, meta] of Object.entries(report.live.probed)) {
        console.log(`  ${ep.padEnd(32)} -> HTTP ${meta.status} ${meta.contentType ? `(${meta.contentType})` : ""}`);
      }
    }
    console.log("");
    if (allFindings.length === 0) {
      console.log("PASS: Zero findings across llms.txt v2, AdCP v3, and RFC 8615 checks.");
    } else {
      for (const f of allFindings) {
        const tag = f.severity.toUpperCase().padEnd(7);
        console.log(`[${tag}] (${f.check}) ${f.location}: ${f.message}`);
      }
    }
    console.log(
      `\nSummary: ${report.summary.errors} error(s), ${report.summary.warnings} warning(s), ${report.summary.info} info note(s).`
    );
  }

  if (report.summary.errors > 0 && !opts.reportOnly) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
