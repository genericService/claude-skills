#!/usr/bin/env node
/**
 * @fileoverview Deterministic repo scanner, primary-source AST/schema validator,
 * and live HTTP readiness auditor for the Agentic Web v2.0 stack:
 * - llms.txt v2+ (https://llmstxt.org/, AnswerDotAI/llms-txt parser rules,
 *   RFC 8288 Link relations, .md twins, Chrome Lighthouse agentic-browsing)
 * - AdCP v3.2.8+ (/.well-known/brand.json, /.well-known/adagents.json)
 * - RFC 8615 well-known discovery (SEP-2127 ai-catalog.json + server-card,
 *   A2A v1.0.1 agent-card.json, RFC 9727 api-catalog, RFC 9728 oauth-protected-resource,
 *   RFC 9116 security.txt)
 * - Crawl rights, browser tools & commerce (IETF aipref Content-Usage, Cloudflare
 *   Content-Signal, W3C TDMRep, W3C WebMCP document.modelContext, UCP, ACP)
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

const BRAND_REDIRECT_ONLY_KEYS = [
  "authoritative_location",
  "redirect_reason",
  "redirect_effective_at",
  "region",
  "note",
];

const A2A_PROTOCOL_BINDINGS = new Set(["JSONRPC", "HTTP+JSON", "GRPC"]);
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const BRAND_ID_RE = /^[a-z0-9_]+$/;
const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const MCP_SERVER_CARD_NAME_RE = /^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/;
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
  } else if (fileSet.has("docusaurus.config.ts") || fileSet.has("docusaurus.config.js")) {
    framework = "docusaurus";
  } else if (fileSet.has("hugo.toml") || fileSet.has("config.toml")) {
    framework = "hugo";
  }

  const brandGuides = files.filter(
    (f) =>
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
    .filter(
      (f) =>
        f.includes(".well-known/") ||
        /^(src\/)?app\/(brand|adagents|ai-catalog|agent-card|acp)\.json\/route\.(ts|js)$/.test(f)
    )
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
    hasLlmsTxt:
      fileSet.has("public/llms.txt") ||
      fileSet.has("llms.txt") ||
      files.some((f) => f.endsWith("llms.txt/route.ts")),
    hasLlmsFullTxt:
      fileSet.has("public/llms-full.txt") ||
      fileSet.has("llms-full.txt") ||
      files.some((f) => f.endsWith("llms-full.txt/route.ts")),
    hasRobots:
      fileSet.has("public/robots.txt") ||
      fileSet.has("robots.txt") ||
      files.some((f) => /^(src\/)?app\/robots\.(ts|js)$/.test(f)),
  };
}

/**
 * Parse and validate an llms.txt document against the August 2026 v2 AST spec,
 * AnswerDotAI/llms-txt@0.0.7 parser invariants, and Chrome Lighthouse rules.
 * @param {string} rawText
 * @param {string} sourceLabel
 */
function validateLlmsTxtV2(rawText, sourceLabel) {
  const findings = [];
  if (rawText.startsWith("\uFEFF")) {
    findings.push({
      severity: "warning",
      check: "llms-txt-bom",
      location: `${sourceLabel}:1`,
      message:
        "UTF-8 BOM (\\uFEFF) detected on line 1. Python's AnswerDotAI/llms-txt parse_llms_file uses start.strip(), which fails to strip \\uFEFF and breaks H1 matching. Save as UTF-8 without BOM.",
    });
  }

  const text = rawText.replace(/^\uFEFF/, "");
  const byteLength = Buffer.byteLength(text, "utf8");
  if (text.trim().length < 50) {
    findings.push({
      severity: "error",
      check: "llms-txt-lighthouse-min-length",
      location: sourceLabel,
      message:
        "llms.txt has fewer than 50 non-whitespace characters and will fail Chrome Lighthouse's agentic-browsing llms-txt audit.",
    });
  }

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
          message:
            "Blockquote appears after preamble text; place the summary blockquote immediately after the H1 heading.",
        });
      }
      continue;
    }

    if (state === "IN_SECTION") {
      if (/^\s*[*+]\s+\[/.test(line)) {
        findings.push({
          severity: "error",
          check: "llms-txt-bullet-marker",
          location: `${sourceLabel}:${lineNo}`,
          message: `Bullet "${trimmed.slice(0, 40)}..." uses '*' or '+'. AnswerDotAI/llms-txt parse_link matches '-' ONLY and crashes with AttributeError on '*' or '+'. Use '- [Title](url)'.`,
        });
        continue;
      }

      if (/^\s*-\s+\[[^\]]*\[/.test(line) || /^\s*-\s+\[[^\]]+\]\([^)\s]*\([^)\s]*\)/.test(line)) {
        findings.push({
          severity: "error",
          check: "llms-txt-parser-escape",
          location: `${sourceLabel}:${lineNo}`,
          message:
            "Nested '[' inside link title or unencoded '(' / ')' inside URL breaks the official reference regex. Remove square brackets from titles and percent-encode URL parentheses (%28 / %29).",
        });
        continue;
      }

      const linkMatch = line.match(/^\s*-\s*\[([^\]]+)\]\(([^)\s]+)\)(?:\s*:\s*(.*))?$/);
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
  } else if (blockquoteLines.length > 1) {
    findings.push({
      severity: "warning",
      check: "llms-txt-multiline-summary",
      location: sourceLabel,
      message:
        "Summary blockquote spans multiple '>' lines. AnswerDotAI/llms-txt matches only a single-line '> summary' via ^> (?P<summary>.+?$)$; collapse the summary onto one line.",
    });
  }

  if (totalLinks === 0) {
    findings.push({
      severity: "warning",
      check: "llms-txt-v2-links",
      location: sourceLabel,
      message: "llms.txt contains zero H2 file-list links (fails Chrome Lighthouse llms-txt check).",
    });
  } else if (htmlOnlyInternalLinks > 0) {
    findings.push({
      severity: "warning",
      check: "llms-txt-v2-md-twins",
      location: sourceLabel,
      message: `${htmlOnlyInternalLinks} of ${totalLinks} links in llms.txt point to non-Markdown URLs. In llms.txt v2, link directly to clean .md page twins (page.md or page.html.md) where available.`,
    });
  }

  if (byteLength > 50 * 1024) {
    findings.push({
      severity: "warning",
      check: "llms-txt-size-cap-50kib",
      location: sourceLabel,
      message: `llms.txt is ${Math.round(byteLength / 1024)} KiB (> 50 KiB strict validator ceiling). Keep /llms.txt compact and move full content to /llms-full.txt.`,
    });
  }

  const estimatedTokens = Math.ceil(byteLength / 4);
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
      bytes: byteLength,
    },
  };
}

/**
 * Validate a brand.json object against AdCP v3.2.8 schema invariants.
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
      message:
        "Found non-standard keys ('brand_name' or 'brand_colors'). AdCP v3 brand.json uses 'version' + 'id' + 'names' and 'colors'.",
    });
  }

  // Variant 1: authoritative_location redirect
  if ("authoritative_location" in obj) {
    if (
      typeof obj.authoritative_location !== "string" ||
      !obj.authoritative_location.startsWith("https://")
    ) {
      findings.push({
        severity: "error",
        check: "adcp-brand-json",
        location: sourceLabel,
        message: "Variant 1 authoritative_location must be an https:// URI.",
      });
    }
    return findings;
  }

  // Variant 2: house string redirect
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

  // Variants 3, 4, and 5 require version: "1.0" in AdCP 3.2.8
  if (obj.version !== "1.0") {
    findings.push({
      severity: "warning",
      check: "adcp-brand-json-version",
      location: sourceLabel,
      message: `AdCP v3.2.8 brand.json expects root "version": "1.0" (got ${JSON.stringify(obj.version)}).`,
    });
  }

  // Variant 4: House Portfolio (may stand alone or compose with Variant 5)
  const hasHouseObject = Boolean(obj.house && typeof obj.house === "object" && !Array.isArray(obj.house));
  if (hasHouseObject) {
    const house = /** @type {Record<string, unknown>} */ (obj.house);
    if (
      typeof house.domain !== "string" ||
      !DOMAIN_RE.test(house.domain) ||
      typeof house.name !== "string"
    ) {
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
        message:
          "Variant 4 house portfolio requires at least one entry in 'brands[]' or 'brand_refs[]'.",
      });
    }
    const inlineIds = new Set();
    for (const b of brands) {
      if (b && typeof b === "object" && typeof b.id === "string") {
        inlineIds.add(b.id);
      }
    }
    for (const ref of brandRefs) {
      if (ref && typeof ref === "object") {
        if (typeof ref.brand_id !== "string" || !BRAND_ID_RE.test(ref.brand_id)) {
          findings.push({
            severity: "error",
            check: "adcp-brand-json",
            location: sourceLabel,
            message: "Each brand_refs[] item requires 'brand_id' matching ^[a-z0-9_]+$.",
          });
        } else if (inlineIds.has(ref.brand_id)) {
          findings.push({
            severity: "error",
            check: "adcp-brand-json",
            location: sourceLabel,
            message: `Cross-array collision: brand_id "${ref.brand_id}" cannot appear in both brands[] and brand_refs[].`,
          });
        }
      }
    }
    if (!("id" in obj) && !("names" in obj)) {
      return findings;
    }
  }

  // Variant 3: Brand Agent Pointer without inline brand id
  if (("agents" in obj || "brand_agent" in obj) && !("id" in obj) && !hasHouseObject) {
    return findings;
  }

  // Variant 5: Brand Canonical Document
  for (const forbidden of BRAND_REDIRECT_ONLY_KEYS) {
    if (forbidden in obj) {
      findings.push({
        severity: "error",
        check: "adcp-brand-json",
        location: sourceLabel,
        message: `Redirect key "${forbidden}" is disallowed on a Brand Canonical Document.`,
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
      message:
        'Variant 5 brand.json requires a non-empty \'names\' array (for example: [{ "en_US": "Brand Name" }]).',
    });
  } else {
    for (const item of obj.names) {
      if (
        !item ||
        typeof item !== "object" ||
        Array.isArray(item) ||
        Object.keys(item).length !== 1
      ) {
        findings.push({
          severity: "error",
          check: "adcp-brand-json",
          location: sourceLabel,
          message:
            'Each entry in \'names[]\' must be a single-key locale object such as { "en_US": "Acme" }.',
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
      } else if (val && typeof val === "object" && !Array.isArray(val)) {
        const pair = /** @type {Record<string, unknown>} */ (val);
        for (const mode of ["light", "dark"]) {
          if (typeof pair[mode] === "string" && !HEX_COLOR_RE.test(pair[mode])) {
            findings.push({
              severity: "warning",
              check: "adcp-brand-json",
              location: sourceLabel,
              message: `Color "${role}.${mode}": "${pair[mode]}" should be a 6-digit hex code (#RRGGBB).`,
            });
          }
        }
      }
    }
  }

  if (Array.isArray(obj.logos)) {
    for (const logo of obj.logos) {
      if (
        !logo ||
        typeof logo !== "object" ||
        typeof logo.url !== "string" ||
        !logo.url.startsWith("http")
      ) {
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
 * Validate an adagents.json object against AdCP v3.2.8 schema invariants.
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
    if (
      typeof obj.authoritative_location !== "string" ||
      !obj.authoritative_location.startsWith("https://")
    ) {
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

  if (obj.authorized_agents.length === 0) {
    const hasCatalogData = ["properties", "placements", "formats", "collections", "signals"].some(
      (k) => Array.isArray(obj[k]) && obj[k].length > 0
    );
    if (!hasCatalogData) {
      findings.push({
        severity: "warning",
        check: "adcp-adagents-empty",
        location: sourceLabel,
        message:
          "authorized_agents is empty and no catalog arrays (properties, placements, formats, collections, signals) are populated.",
      });
    }
  }

  const declaredPropertyIds = new Set();
  if (Array.isArray(obj.properties)) {
    for (const prop of obj.properties) {
      if (!prop || typeof prop !== "object") continue;
      if (typeof prop.property_id === "string") {
        declaredPropertyIds.add(prop.property_id);
      }
      if (
        typeof prop.property_type !== "string" ||
        typeof prop.name !== "string" ||
        !Array.isArray(prop.identifiers) ||
        prop.identifiers.length === 0
      ) {
        findings.push({
          severity: "error",
          check: "adcp-adagents-json",
          location: sourceLabel,
          message:
            "Each entry in properties[] requires 'property_type', 'name', and non-empty 'identifiers[]'.",
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

    if (
      typeof agent.authorized_for !== "string" ||
      agent.authorized_for.trim().length === 0 ||
      agent.authorized_for.length > 500
    ) {
      findings.push({
        severity: "error",
        check: "adcp-adagents-json",
        location: `${sourceLabel}#authorized_agents[${i}]`,
        message:
          "authorized_agents entry requires 'authorized_for' (1 to 500 characters) per AdCP authorized-agent-base.json.",
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

    if (authType === "inline_properties" && "inline_properties" in agent && !("properties" in agent)) {
      findings.push({
        severity: "error",
        check: "adcp-adagents-inline-key",
        location: `${sourceLabel}#authorized_agents[${i}]`,
        message:
          'When authorization_type is "inline_properties", the companion array key MUST be named "properties" (never "inline_properties").',
      });
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
    } else if (authType === "publisher_properties") {
      for (let j = 0; j < agent.publisher_properties.length; j += 1) {
        const sel = agent.publisher_properties[j];
        if (!sel || typeof sel !== "object") continue;
        const hasSingle = typeof sel.publisher_domain === "string";
        const hasMulti = Array.isArray(sel.publisher_domains) && sel.publisher_domains.length > 0;
        if (hasSingle === hasMulti) {
          findings.push({
            severity: "error",
            check: "adcp-adagents-publisher-selector",
            location: `${sourceLabel}#authorized_agents[${i}].publisher_properties[${j}]`,
            message:
              "Each publisher_properties selector requires exactly one of 'publisher_domain' (string) XOR 'publisher_domains' (non-empty array).",
          });
        }
        if (sel.selection_type === "by_id" && hasMulti) {
          findings.push({
            severity: "error",
            check: "adcp-adagents-publisher-selector",
            location: `${sourceLabel}#authorized_agents[${i}].publisher_properties[${j}]`,
            message:
              "selection_type 'by_id' forbids 'publisher_domains' array; scope 'by_id' to a single 'publisher_domain'.",
          });
        }
      }
    }
  }

  return findings;
}

/**
 * Validate /.well-known/ai-catalog.json (SEP-2127 domain discovery).
 * @param {unknown} doc
 * @param {string} sourceLabel
 */
function validateAiCatalogJson(doc, sourceLabel) {
  const findings = [];
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    findings.push({
      severity: "error",
      check: "sep2127-ai-catalog",
      location: sourceLabel,
      message: "ai-catalog.json must be a JSON object.",
    });
    return findings;
  }
  const obj = /** @type {Record<string, unknown>} */ (doc);
  if (obj.specVersion !== "1.0") {
    findings.push({
      severity: "error",
      check: "sep2127-ai-catalog",
      location: sourceLabel,
      message: `ai-catalog.json requires 'specVersion': "1.0" (got ${JSON.stringify(obj.specVersion)}).`,
    });
  }
  if (!Array.isArray(obj.entries)) {
    findings.push({
      severity: "error",
      check: "sep2127-ai-catalog",
      location: sourceLabel,
      message: "ai-catalog.json requires an 'entries' array.",
    });
  } else {
    for (let i = 0; i < obj.entries.length; i += 1) {
      const entry = obj.entries[i];
      if (
        !entry ||
        typeof entry !== "object" ||
        typeof entry.identifier !== "string" ||
        typeof entry.type !== "string" ||
        typeof entry.url !== "string" ||
        !entry.url.startsWith("https://")
      ) {
        findings.push({
          severity: "error",
          check: "sep2127-ai-catalog",
          location: `${sourceLabel}#entries[${i}]`,
          message:
            "Each ai-catalog.json entry requires 'identifier', 'type' (e.g. 'application/mcp-server-card+json'), and an https:// 'url'.",
        });
      }
    }
  }
  return findings;
}

/**
 * Validate an MCP SEP-2127 Server Card (v1/server-card.schema.json) or legacy mcp.json.
 * @param {unknown} doc
 * @param {string} rawText
 * @param {string} sourceLabel
 * @param {boolean} isLegacyMcpJsonPath
 */
function validateMcpServerCard(doc, rawText, sourceLabel, isLegacyMcpJsonPath = false) {
  const findings = [];
  if (SECRET_VALUE_RE.test(rawText)) {
    findings.push({
      severity: "error",
      check: "mcp-server-card-security",
      location: sourceLabel,
      message:
        "Potential secret or token detected inside public MCP discovery file. Never publish credentials in server cards.",
    });
  }
  if (isLegacyMcpJsonPath) {
    findings.push({
      severity: "warning",
      check: "sep2127-ai-catalog-migration",
      location: sourceLabel,
      message:
        "SEP-2127 standardized domain MCP discovery on /.well-known/ai-catalog.json + <mcp-url>/server-card (mcp.json is SEP-2633 local client config). Consider publishing /.well-known/ai-catalog.json.",
    });
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    findings.push({
      severity: "error",
      check: "mcp-server-card",
      location: sourceLabel,
      message: "MCP Server Card must be a JSON object.",
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
        message: `MCP Server Card missing required string field '${req}'.`,
      });
    }
  }
  if (!isLegacyMcpJsonPath) {
    if (obj.$schema !== "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json") {
      findings.push({
        severity: "warning",
        check: "mcp-server-card-schema",
        location: sourceLabel,
        message:
          'SEP-2127 Server Card requires "$schema": "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json".',
      });
    }
    if (typeof obj.name === "string" && !MCP_SERVER_CARD_NAME_RE.test(obj.name)) {
      findings.push({
        severity: "error",
        check: "mcp-server-card-name",
        location: sourceLabel,
        message: `SEP-2127 Server Card 'name' "${obj.name}" must use reverse-DNS namespace format (e.g. "com.acme/ops-server").`,
      });
    }
    if (typeof obj.description === "string" && obj.description.length > 100) {
      findings.push({
        severity: "error",
        check: "mcp-server-card-description",
        location: sourceLabel,
        message: `SEP-2127 Server Card 'description' is ${obj.description.length} chars (maxLength is 100 plain-text characters).`,
      });
    }
  }
  if ("remotes" in obj && (!Array.isArray(obj.remotes) || obj.remotes.length === 0)) {
    findings.push({
      severity: "error",
      check: "mcp-server-card",
      location: sourceLabel,
      message: "When 'remotes' is present, it must be a non-empty array of { type, url }.",
    });
  }
  return findings;
}

/**
 * Validate /.well-known/agent-card.json (A2A v1.0.1 lf.a2a.v1.AgentCard).
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

  if (Array.isArray(obj.supportedInterfaces) && obj.supportedInterfaces.length > 0) {
    for (let i = 0; i < obj.supportedInterfaces.length; i += 1) {
      const iface = obj.supportedInterfaces[i];
      if (
        !iface ||
        typeof iface !== "object" ||
        typeof iface.url !== "string" ||
        !A2A_PROTOCOL_BINDINGS.has(iface.protocolBinding) ||
        typeof iface.protocolVersion !== "string"
      ) {
        findings.push({
          severity: "error",
          check: "a2a-supported-interfaces",
          location: `${sourceLabel}#supportedInterfaces[${i}]`,
          message:
            "Each supportedInterfaces[] item requires 'url', 'protocolBinding' ('JSONRPC' | 'HTTP+JSON' | 'GRPC'), and 'protocolVersion' ('1.0').",
        });
      }
    }
  } else if (typeof obj.url === "string") {
    findings.push({
      severity: "warning",
      check: "a2a-v1-migration",
      location: sourceLabel,
      message:
        "agent-card.json uses legacy A2A v0.3 top-level 'url'. A2A v1.0.1 requires 'supportedInterfaces: [{ url, protocolBinding, protocolVersion: \"1.0\" }]'.",
    });
  } else {
    findings.push({
      severity: "error",
      check: "a2a-agent-card",
      location: sourceLabel,
      message: "agent-card.json requires non-empty 'supportedInterfaces[]' (A2A v1.0.1).",
    });
  }

  if (obj.capabilities && typeof obj.capabilities === "object" && "stateTransitionHistory" in obj.capabilities) {
    findings.push({
      severity: "warning",
      check: "a2a-v1-migration",
      location: sourceLabel,
      message:
        "capabilities.stateTransitionHistory was removed in A2A v1.0 (replaced by capabilities.extendedAgentCard).",
    });
  }

  if ("security" in obj && !("securityRequirements" in obj)) {
    findings.push({
      severity: "warning",
      check: "a2a-v1-migration",
      location: sourceLabel,
      message: "Top-level 'security' was renamed to 'securityRequirements' in A2A v1.0.",
    });
  }

  if (!Array.isArray(obj.defaultInputModes) || !Array.isArray(obj.defaultOutputModes)) {
    findings.push({
      severity: "warning",
      check: "a2a-agent-card",
      location: sourceLabel,
      message: "A2A v1.0 AgentCard requires 'defaultInputModes' and 'defaultOutputModes' string arrays.",
    });
  }

  if (!Array.isArray(obj.skills) || obj.skills.length === 0) {
    findings.push({
      severity: "warning",
      check: "a2a-agent-card",
      location: sourceLabel,
      message: "agent-card.json should declare at least one skill in 'skills[]'.",
    });
  } else {
    for (let i = 0; i < obj.skills.length; i += 1) {
      const skill = obj.skills[i];
      if (
        !skill ||
        typeof skill !== "object" ||
        typeof skill.id !== "string" ||
        typeof skill.name !== "string" ||
        typeof skill.description !== "string" ||
        !Array.isArray(skill.tags)
      ) {
        findings.push({
          severity: "error",
          check: "a2a-skill-schema",
          location: `${sourceLabel}#skills[${i}]`,
          message:
            "Every A2A v1.0 AgentSkill requires 'id', 'name', 'description', and a 'tags' string array.",
        });
      }
    }
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
  const obj = /** @type {Record<string, unknown>} */ (doc);
  if (
    typeof obj.resource !== "string" ||
    !Array.isArray(obj.authorization_servers) ||
    obj.authorization_servers.length === 0
  ) {
    findings.push({
      severity: "error",
      check: "rfc9728-oauth-protected-resource",
      location: sourceLabel,
      message:
        "RFC 9728 oauth-protected-resource requires 'resource' and non-empty 'authorization_servers[]'.",
    });
  }
  for (const [key, val] of Object.entries(obj)) {
    if (key !== "bearer_methods_supported" && Array.isArray(val) && val.length === 0) {
      findings.push({
        severity: "warning",
        check: "rfc9728-empty-array",
        location: sourceLabel,
        message: `RFC 9728 Section 2 requires omitting empty metadata array '${key}' instead of setting [].`,
      });
    }
  }
  return findings;
}

/**
 * Validate /.well-known/tdmrep.json (W3C TDM Reservation Protocol).
 * @param {unknown} doc
 * @param {string} sourceLabel
 */
function validateTdmRepJson(doc, sourceLabel) {
  const findings = [];
  if (!Array.isArray(doc)) {
    findings.push({
      severity: "error",
      check: "w3c-tdmrep-json",
      location: sourceLabel,
      message:
        "W3C tdmrep.json root MUST be a JSON Array of { location, 'tdm-reservation': 0 | 1 } objects.",
    });
    return findings;
  }
  for (let i = 0; i < doc.length; i += 1) {
    const rule = doc[i];
    if (
      !rule ||
      typeof rule !== "object" ||
      typeof rule.location !== "string" ||
      (rule["tdm-reservation"] !== 0 && rule["tdm-reservation"] !== 1)
    ) {
      findings.push({
        severity: "error",
        check: "w3c-tdmrep-json",
        location: `${sourceLabel}[${i}]`,
        message: "Each tdmrep.json rule requires 'location' (string) and 'tdm-reservation' (0 or 1).",
      });
    }
  }
  return findings;
}

/**
 * Validate /.well-known/ucp (Universal Commerce Protocol 2026-08-25).
 * @param {unknown} doc
 * @param {string} sourceLabel
 */
function validateUcpProfile(doc, sourceLabel) {
  const findings = [];
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    findings.push({
      severity: "error",
      check: "ucp-profile",
      location: sourceLabel,
      message: "/.well-known/ucp must be a JSON object.",
    });
    return findings;
  }
  const obj = /** @type {Record<string, unknown>} */ (doc);
  const ucp = /** @type {Record<string, unknown> | undefined} */ (
    obj.ucp && typeof obj.ucp === "object" ? obj.ucp : undefined
  );
  if (!ucp || typeof ucp.version !== "string" || !ucp.services || typeof ucp.services !== "object") {
    findings.push({
      severity: "error",
      check: "ucp-profile",
      location: sourceLabel,
      message: "/.well-known/ucp requires root 'ucp' object with 'version' and 'services'.",
    });
  }
  if ("keys" in obj && !Array.isArray(obj.keys)) {
    findings.push({
      severity: "error",
      check: "ucp-profile",
      location: sourceLabel,
      message: "/.well-known/ucp 'keys' field must be an array of JWKs.",
    });
  }
  return findings;
}

/**
 * Validate /.well-known/acp.json (Agentic Commerce Protocol 2026-04-17).
 * @param {unknown} doc
 * @param {string} sourceLabel
 */
function validateAcpDiscovery(doc, sourceLabel) {
  const findings = [];
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    findings.push({
      severity: "error",
      check: "acp-discovery",
      location: sourceLabel,
      message: "/.well-known/acp.json must be a JSON object.",
    });
    return findings;
  }
  const obj = /** @type {Record<string, unknown>} */ (doc);
  const proto = /** @type {Record<string, unknown> | undefined} */ (
    obj.protocol && typeof obj.protocol === "object" ? obj.protocol : undefined
  );
  if (!proto || proto.name !== "acp" || typeof proto.version !== "string" || typeof obj.api_base_url !== "string") {
    findings.push({
      severity: "error",
      check: "acp-discovery",
      location: sourceLabel,
      message:
        "/.well-known/acp.json requires 'protocol: { name: \"acp\", version }' and 'api_base_url'.",
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
  const contacts = [...text.matchAll(/^Contact:\s*(\S+)\s*$/gm)].map((m) => m[1]);
  const expiresMatches = [...text.matchAll(/^Expires:\s*(.+)$/gm)].map((m) => m[1].trim());
  const prefLangMatches = [...text.matchAll(/^Preferred-Languages:\s*(.+)$/gm)];
  const encryptionMatches = [...text.matchAll(/^Encryption:\s*(.+)$/gm)].map((m) => m[1].trim());

  if (contacts.length === 0) {
    findings.push({
      severity: "error",
      check: "rfc9116-security-txt",
      location: sourceLabel,
      message: "security.txt is missing required 'Contact:' field (RFC 9116).",
    });
  } else {
    for (const c of contacts) {
      if (!/^(mailto:|tel:|https:\/\/)/i.test(c)) {
        findings.push({
          severity: "warning",
          check: "rfc9116-contact-scheme",
          location: sourceLabel,
          message: `security.txt Contact "${c}" should use mailto:, tel:, or https:// URI scheme.`,
        });
      }
    }
  }

  if (expiresMatches.length === 0) {
    findings.push({
      severity: "error",
      check: "rfc9116-security-txt",
      location: sourceLabel,
      message: "security.txt is missing required 'Expires:' RFC 3339 timestamp (RFC 9116).",
    });
  } else {
    if (expiresMatches.length > 1) {
      findings.push({
        severity: "error",
        check: "rfc9116-single-expires",
        location: sourceLabel,
        message: "RFC 9116 forbids multiple 'Expires:' lines in security.txt.",
      });
    }
    const expDate = new Date(expiresMatches[0]);
    if (Number.isNaN(expDate.getTime())) {
      findings.push({
        severity: "error",
        check: "rfc9116-security-txt",
        location: sourceLabel,
        message: `Invalid 'Expires:' date "${expiresMatches[0]}" in security.txt.`,
      });
    } else {
      const daysRemaining = (expDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      if (daysRemaining <= 0) {
        findings.push({
          severity: "error",
          check: "rfc9116-security-txt",
          location: sourceLabel,
          message: `security.txt expired on ${expDate.toISOString()}. Update 'Expires:' to a future RFC 3339 timestamp.`,
        });
      } else if (daysRemaining < 30) {
        findings.push({
          severity: "warning",
          check: "rfc9116-security-txt",
          location: sourceLabel,
          message: `security.txt expires in ${Math.round(daysRemaining)} days (${expDate.toISOString()}). Renew soon.`,
        });
      } else if (daysRemaining > 366) {
        findings.push({
          severity: "warning",
          check: "rfc9116-expires-horizon",
          location: sourceLabel,
          message: `security.txt 'Expires:' is ${Math.round(daysRemaining)} days ahead; RFC 9116 Section 2.5.5 recommends less than 1 year.`,
        });
      }
    }
  }

  if (prefLangMatches.length > 1) {
    findings.push({
      severity: "error",
      check: "rfc9116-preferred-languages",
      location: sourceLabel,
      message: "RFC 9116 allows 'Preferred-Languages:' at most once (use comma-separated tags).",
    });
  }

  if (text.includes("-----BEGIN PGP PUBLIC KEY BLOCK-----")) {
    findings.push({
      severity: "error",
      check: "rfc9116-encryption-uri",
      location: sourceLabel,
      message:
        "RFC 9116 Section 2.5.4 forbids inline PGP public key blocks in security.txt; 'Encryption:' must be a URI pointing to the key.",
    });
  } else {
    for (const enc of encryptionMatches) {
      if (!/^(https:\/\/|openpgp4fpr:|dns:)/i.test(enc)) {
        findings.push({
          severity: "warning",
          check: "rfc9116-encryption-uri",
          location: sourceLabel,
          message: `Encryption "${enc}" should be an https://, openpgp4fpr:, or dns: URI.`,
        });
      }
    }
  }

  return findings;
}

/**
 * Validate IETF aipref Content-Usage syntax if present.
 * @param {string} text
 * @param {string} sourceLabel
 */
function validateCrawlSignalsText(text, sourceLabel) {
  const findings = [];
  const usageLines = [...text.matchAll(/Content-Usage\s*:\s*([^\r\n"']+)/gi)].map((m) => m[1]);
  for (const line of usageLines) {
    if (/=\s*(yes|no)\b/i.test(line)) {
      findings.push({
        severity: "error",
        check: "aipref-content-usage-tokens",
        location: sourceLabel,
        message: `Content-Usage "${line.trim()}" uses yes/no; IETF draft-ietf-aipref-vocab requires RFC 9651 tokens 'y' or 'n' (e.g. "train-ai=n, ai-use=y, search=y"). Use 'Content-Signal' for yes/no.`,
      });
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

  // 2. Discoverability link relations in codebase
  const configAndLayoutFiles = walkRepo(rootDir).filter((f) =>
    /^(src\/)?app\/.*layout\.(tsx|ts|jsx|js)$|^next\.config\.(ts|mjs|js)$|^(src\/)?(middleware|proxy)\.(ts|js|mjs)$|^public\/_headers$|\.vitepress\/config\.(ts|mjs|js)$/.test(
      f
    )
  );
  const combinedConfigText = configAndLayoutFiles
    .map((f) => fs.readFileSync(path.join(rootDir, f), "utf8"))
    .join("\n");

  const hasVitepressPluginLlms = combinedConfigText.includes("vitepress-plugin-llms");
  const hasMarkdownAlternate =
    hasVitepressPluginLlms ||
    (combinedConfigText.includes("text/markdown") &&
      (combinedConfigText.includes("alternate") || combinedConfigText.includes("alternates")));
  const hasDescribedBy = hasVitepressPluginLlms || combinedConfigText.includes("describedby");

  if (!hasMarkdownAlternate) {
    findings.push({
      severity: "warning",
      check: "llms-txt-v2-link-alternate",
      location: "layout / headers",
      message:
        "No 'rel=\"alternate\" type=\"text/markdown\"' link or Next.js alternates.types['text/markdown'] declaration detected.",
    });
  }
  if (!hasDescribedBy) {
    findings.push({
      severity: "warning",
      check: "llms-txt-v2-link-describedby",
      location: "layout / headers",
      message:
        "No 'rel=\"describedby\"' link pointing to /llms.txt detected in HTML <head> or HTTP Link headers.",
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

  // 4. WebMCP API migration check (document.modelContext vs legacy navigator.modelContext)
  for (const wmcpRel of manifest.webMcpFiles) {
    const wmcpText = fs.readFileSync(path.join(rootDir, wmcpRel), "utf8");
    if (wmcpText.includes("navigator.modelContext") && !wmcpText.includes("document.modelContext")) {
      findings.push({
        severity: "warning",
        check: "webmcp-document-model-context",
        location: wmcpRel,
        message:
          "W3C WebMCP (May 2026+) moved from navigator.modelContext to document.modelContext with AbortSignal cleanup. Prefer document.modelContext first.",
      });
    }
  }

  // 5. AdCP & RFC 8615 well-known files check
  const wellKnownJsonValidators = [
    {
      rel: "public/.well-known/brand.json",
      fn: (doc) => validateBrandJson(doc, "public/.well-known/brand.json"),
    },
    {
      rel: "public/.well-known/adagents.json",
      fn: (doc) => validateAdagentsJson(doc, "public/.well-known/adagents.json"),
    },
    {
      rel: "public/.well-known/ai-catalog.json",
      fn: (doc) => validateAiCatalogJson(doc, "public/.well-known/ai-catalog.json"),
    },
    {
      rel: "public/.well-known/mcp/server-card.json",
      fn: (doc, raw) =>
        validateMcpServerCard(doc, raw, "public/.well-known/mcp/server-card.json", false),
    },
    {
      rel: "public/.well-known/mcp.json",
      fn: (doc, raw) => validateMcpServerCard(doc, raw, "public/.well-known/mcp.json", true),
    },
    {
      rel: "public/.well-known/agent-card.json",
      fn: (doc) => validateAgentCardJson(doc, "public/.well-known/agent-card.json"),
    },
    {
      rel: "public/.well-known/api-catalog",
      fn: (doc) => validateApiCatalogJson(doc, "public/.well-known/api-catalog"),
    },
    {
      rel: "public/.well-known/oauth-protected-resource",
      fn: (doc) =>
        validateOauthProtectedResource(doc, "public/.well-known/oauth-protected-resource"),
    },
    {
      rel: "public/.well-known/tdmrep.json",
      fn: (doc) => validateTdmRepJson(doc, "public/.well-known/tdmrep.json"),
    },
    {
      rel: "public/.well-known/ucp",
      fn: (doc) => validateUcpProfile(doc, "public/.well-known/ucp"),
    },
    {
      rel: "public/.well-known/acp.json",
      fn: (doc) => validateAcpDiscovery(doc, "public/.well-known/acp.json"),
    },
  ];

  const brandJsonPath = path.join(rootDir, "public/.well-known/brand.json");
  const hasBrandRoute = manifest.wellKnownFiles.some((f) => f.includes("brand.json"));
  if (!fs.existsSync(brandJsonPath) && !hasBrandRoute) {
    findings.push({
      severity: "warning",
      check: "adcp-brand-json-presence",
      location: "public/.well-known/brand.json",
      message:
        "Missing /.well-known/brand.json (AdCP v3.2.8 canonical brand identity, palette, typography, and voice rules).",
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
    findings.push(
      ...validateSecurityTxt(
        fs.readFileSync(secTxtPath, "utf8"),
        "public/.well-known/security.txt"
      )
    );
  } else if (!manifest.wellKnownFiles.some((f) => f.includes("security.txt"))) {
    findings.push({
      severity: "warning",
      check: "rfc9116-security-txt-presence",
      location: "public/.well-known/security.txt",
      message: "Missing /.well-known/security.txt (RFC 9116).",
    });
  }

  // 6. Crawl signals check (IETF aipref Content-Usage + Cloudflare Content-Signal)
  const robotsFiles = [
    "public/robots.txt",
    "robots.txt",
    "app/robots.ts",
    "src/app/robots.ts",
  ].filter((rel) => fs.existsSync(path.join(rootDir, rel)));

  if (robotsFiles.length > 0) {
    const robotsText = robotsFiles
      .map((rel) => fs.readFileSync(path.join(rootDir, rel), "utf8"))
      .join("\n");
    findings.push(...validateCrawlSignalsText(`${robotsText}\n${combinedConfigText}`, robotsFiles[0]));
    const hasSignal =
      robotsText.includes("Content-Signal") ||
      robotsText.includes("Content-Usage") ||
      combinedConfigText.includes("Content-Signal") ||
      combinedConfigText.includes("Content-Usage");
    if (!hasSignal) {
      findings.push({
        severity: "info",
        check: "aipref-content-signal",
        location: robotsFiles[0],
        message:
          "Consider declaring 'Content-Usage: train-ai=n, ai-use=y, search=y' (IETF aipref) and 'Content-Signal: search=yes, ai-input=yes, ai-train=no' in robots.txt or response headers.",
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
        headers: { "User-Agent": "agentic-web-audit/2.0", ...headers },
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
        contentUsage: res.headers.get("content-usage") ?? "",
        bytes: Buffer.byteLength(body, "utf8"),
        body,
      };
    } catch (err) {
      return {
        ok: false,
        status: 0,
        error: err instanceof Error ? err.message : String(err),
        locationHeader: "",
        contentType: "",
        linkHeader: "",
        cors: "",
        vary: "",
        contentSignal: "",
        contentUsage: "",
        bytes: 0,
        body: "",
      };
    }
  }

  const [
    homeRes,
    homeMdNeg,
    llmsRes,
    brandRes,
    adagentsRes,
    aiCatalogRes,
    mcpRes,
    agentCardRes,
    apiCatRes,
    ucpRes,
    acpRes,
    secRes,
    robotsRes,
  ] = await Promise.all([
    probe("/"),
    probe("/", { Accept: "text/markdown" }),
    probe("/llms.txt"),
    probe("/.well-known/brand.json", {}, true),
    probe("/.well-known/adagents.json", {}, true),
    probe("/.well-known/ai-catalog.json"),
    probe("/.well-known/mcp.json"),
    probe("/.well-known/agent-card.json"),
    probe("/.well-known/api-catalog"),
    probe("/.well-known/ucp", {}, true),
    probe("/.well-known/acp.json"),
    probe("/.well-known/security.txt"),
    probe("/robots.txt"),
  ]);

  probed["/"] = {
    status: homeRes.status,
    contentType: homeRes.contentType,
    linkHeader: homeRes.linkHeader,
  };
  probed["/ (Accept: text/markdown)"] = {
    status: homeMdNeg.status,
    contentType: homeMdNeg.contentType,
    vary: homeMdNeg.vary,
    contentSignal: homeMdNeg.contentSignal,
    contentUsage: homeMdNeg.contentUsage,
  };

  const hasLinkAltHeader =
    homeRes.linkHeader.includes("text/markdown") && homeRes.linkHeader.includes("alternate");
  const hasLinkDescHeader = homeRes.linkHeader.includes("describedby");
  const hasHtmlAlt =
    /<link[^>]+rel=["']alternate["'][^>]+type=["']text\/markdown["']/i.test(homeRes.body) ||
    /<link[^>]+type=["']text\/markdown["'][^>]+rel=["']alternate["']/i.test(homeRes.body);
  const hasHtmlDesc = /<link[^>]+rel=["']describedby["']/i.test(homeRes.body);

  if (!hasLinkAltHeader && !hasHtmlAlt) {
    findings.push({
      severity: "warning",
      check: "live-llms-v2-link-alternate",
      location: `${origin}/`,
      message:
        'Root page neither emits HTTP Link rel="alternate"; type="text/markdown" nor HTML <link rel="alternate" type="text/markdown">.',
    });
  }
  if (!hasLinkDescHeader && !hasHtmlDesc) {
    findings.push({
      severity: "warning",
      check: "live-llms-v2-link-describedby",
      location: `${origin}/`,
      message:
        'Root page neither emits HTTP Link rel="describedby" nor HTML <link rel="describedby" href="/llms.txt">.',
    });
  }
  if (!homeMdNeg.contentType.includes("text/markdown")) {
    findings.push({
      severity: "info",
      check: "live-accept-markdown",
      location: `${origin}/`,
      message:
        "Origin does not negotiate 'Accept: text/markdown' at root URL (optional when static .md page twins are linked).",
    });
  } else if (!homeMdNeg.vary.toLowerCase().includes("accept")) {
    findings.push({
      severity: "warning",
      check: "live-accept-markdown-vary",
      location: `${origin}/`,
      message:
        "Origin serves text/markdown on 'Accept: text/markdown' without 'Vary: Accept', risking CDN cache poisoning.",
    });
  }

  probed["/llms.txt"] = {
    status: llmsRes.status,
    contentType: llmsRes.contentType,
    bytes: llmsRes.bytes,
  };
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
      message: `GET /llms.txt returned HTML (${llmsRes.contentType}) instead of text/markdown or text/plain (fails Chrome Lighthouse llms-txt audit).`,
    });
  } else {
    const parsed = validateLlmsTxtV2(llmsRes.body, `${origin}/llms.txt`);
    llmsAst = parsed.ast;
    findings.push(...parsed.findings);
  }

  const checkLiveWellKnown = (
    pathname,
    res,
    validator,
    expectType = "application/json",
    redirectMode = "allow"
  ) => {
    if (res.status === 404 || res.status === 0) return;
    probed[pathname] = { status: res.status, contentType: res.contentType, cors: res.cors };
    if (redirectMode !== "allow" && res.status >= 300 && res.status < 400) {
      const loc = res.locationHeader;
      let isSameDomainWwwRedirect = false;
      try {
        const srcHost = new URL(origin).hostname.replace(/^www\./, "");
        const dstHost = new URL(loc, origin).hostname.replace(/^www\./, "");
        isSameDomainWwwRedirect = srcHost === dstHost;
      } catch {
        isSameDomainWwwRedirect = false;
      }
      if (redirectMode === "zero") {
        findings.push({
          severity: "error",
          check: "well-known-no-redirect",
          location: `${origin}${pathname}`,
          message: `${pathname} returned HTTP ${res.status} (${loc}); UCP specification forbids 3xx redirects on /.well-known/ucp.`,
        });
      } else {
        findings.push({
          severity: isSameDomainWwwRedirect ? "warning" : "error",
          check: isSameDomainWwwRedirect ? "adcp-canonical-host-redirect" : "adcp-no-redirect",
          location: `${origin}${pathname}`,
          message: isSameDomainWwwRedirect
            ? `${pathname} returned HTTP ${res.status} to canonical host (${loc}). AdCP allows up to 3 apex/www hops on initial fetch, though serving 200 OK directly on bare apex is fastest.`
            : `${pathname} returned cross-host HTTP ${res.status} redirect (${loc}). AdCP forbids cross-domain HTTP redirects (use JSON 'authoritative_location' instead).`,
        });
      }
      return;
    }
    if (!res.ok) return;
    if (res.contentType.includes("text/html")) {
      findings.push({
        severity: "error",
        check: "well-known-html-fallback",
        location: `${origin}${pathname}`,
        message: `${pathname} returned HTML 200 OK (${res.contentType}). Exclude /.well-known/* from SPA fallback and middleware rewrites.`,
      });
      return;
    }
    if (redirectMode === "adcp" && res.bytes > 5 * 1024 * 1024) {
      findings.push({
        severity: "error",
        check: "adcp-size-cap",
        location: `${origin}${pathname}`,
        message: `${pathname} exceeds AdCP 5 MB well-known size cap (${res.bytes} bytes).`,
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

  checkLiveWellKnown(
    "/.well-known/brand.json",
    brandRes,
    (d, _r, loc) => validateBrandJson(d, loc),
    "application/json",
    "adcp"
  );
  checkLiveWellKnown(
    "/.well-known/adagents.json",
    adagentsRes,
    (d, _r, loc) => validateAdagentsJson(d, loc),
    "application/json",
    "adcp"
  );
  checkLiveWellKnown(
    "/.well-known/ai-catalog.json",
    aiCatalogRes,
    (d, _r, loc) => validateAiCatalogJson(d, loc),
    "application/ai-catalog+json"
  );
  checkLiveWellKnown("/.well-known/mcp.json", mcpRes, (d, r, loc) =>
    validateMcpServerCard(d, r, loc, true)
  );
  checkLiveWellKnown(
    "/.well-known/agent-card.json",
    agentCardRes,
    (d, _r, loc) => validateAgentCardJson(d, loc),
    "application/a2a+json"
  );
  checkLiveWellKnown(
    "/.well-known/api-catalog",
    apiCatRes,
    (d, _r, loc) => validateApiCatalogJson(d, loc),
    "application/linkset+json"
  );
  checkLiveWellKnown(
    "/.well-known/ucp",
    ucpRes,
    (d, _r, loc) => validateUcpProfile(d, loc),
    "application/json",
    "zero"
  );
  checkLiveWellKnown("/.well-known/acp.json", acpRes, (d, _r, loc) =>
    validateAcpDiscovery(d, loc)
  );

  if (!brandRes.ok && !(brandRes.status >= 300 && brandRes.status < 400)) {
    findings.push({
      severity: "warning",
      check: "live-adcp-brand-json",
      location: `${origin}/.well-known/brand.json`,
      message: "No /.well-known/brand.json published on origin.",
    });
  }

  probed["/.well-known/security.txt"] = {
    status: secRes.status,
    contentType: secRes.contentType,
  };
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
  if (robotsRes.ok) {
    findings.push(...validateCrawlSignalsText(robotsRes.body, `${origin}/robots.txt`));
    const hasAnySignal =
      robotsRes.body.includes("Content-Signal") ||
      robotsRes.body.includes("Content-Usage") ||
      Boolean(homeRes.contentSignal) ||
      Boolean(homeRes.contentUsage);
    if (!hasAnySignal) {
      findings.push({
        severity: "info",
        check: "live-content-signal",
        location: `${origin}/robots.txt`,
        message:
          "No Content-Usage (IETF aipref) or Content-Signal policy detected in /robots.txt or HTTP response headers.",
      });
    }
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
      console.log(
        `Local Repo Audit: ${report.local.manifest.root} (${report.local.manifest.framework})`
      );
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
        console.log(
          `  ${ep.padEnd(32)} -> HTTP ${meta.status} ${meta.contentType ? `(${meta.contentType})` : ""}`
        );
      }
    }
    console.log("");
    if (allFindings.length === 0) {
      console.log(
        "PASS: Zero findings across llms.txt v2, AdCP v3.2.8, RFC 8615, and WebMCP checks."
      );
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
