---
name: agentic-web
version: 1.0.0
description: >-
  Author, audit, and maintain 2026+ Agentic Web discovery, identity, governance,
  and protocol surfaces across any website or API: llms.txt v2+ (llmstxt.org AST,
  clean .md page twins, Link rel=alternate/describedby, Accept: text/markdown,
  llms-full.txt), Ad Context Protocol AdCP v3.2+ (/.well-known/brand.json,
  /.well-known/adagents.json, JWKS & RFC 9421 signing, MCP/A2A ad workflows),
  RFC 8615 well-known manifests (mcp.json SEP-2127, agent-card.json A2A,
  api-catalog RFC 9727, oauth-protected-resource RFC 9728, security.txt RFC 9116),
  AI crawl signals (robots.txt Content-Signal / IETF aipref, TDMRep, RSL),
  WebMCP (navigator.modelContext), and agentic commerce (UCP, ACP, x402).
  Use whenever making a site AI/agent-ready, generating or fixing llms.txt,
  configuring AdCP brand/publisher manifests, or auditing /.well-known/ endpoints.
---

# Agentic Web Discovery, Identity & Protocol Skill (`llms.txt` v2+, AdCP v3.2+, RFC 8615)

Composable, script-first workflow for making websites, documentation hubs, publishers, brands, and API platforms natively discoverable and verifiable by coding agents, chat/search assistants, MCP clients, and autonomous peer agents.

---

## 1. Composable Vertical Archetypes (Pick Only Applicable Layers)

Never publish fake stub manifests pointing to non-existent endpoints. Select layers based on what the project actually operates:

| Archetype | Mandatory Baseline Layers | Conditional / Domain Layers |
| :--- | :--- | :--- |
| **1. Brand, Agency, Portfolio, or Local Service Site** | `/llms.txt` v2 + `.md` page twins + `Link` relations (`alternate` / `describedby`) + `/.well-known/brand.json` (Variant 5 or 4) + `/.well-known/security.txt` + `robots.txt` (`Content-Signal`) | `/llms-full.txt`; WebMCP (`navigator.modelContext`) for interactive calculators, estimators, or intake tools |
| **2. Developer Docs, SDK, or Open-Source Project** | `/llms.txt` v2 (root or `/docs/llms.txt` subpath) + `.md` twins + `Link` relations + `/llms-full.txt` + `Accept: text/markdown` | `/.well-known/api-catalog` (RFC 9727) if hosting HTTP APIs |
| **3. SaaS App, MCP Provider, or Autonomous Agent Service** | All Archetype 1 baseline layers | `/.well-known/mcp.json` (SEP-2127), `/.well-known/agent-card.json` (A2A), `/.well-known/api-catalog` (RFC 9727), `/.well-known/oauth-protected-resource` (RFC 9728) |
| **4. Media Publisher, Newsletter, CTV, or Signal Provider** | All Archetype 1 baseline layers | `/.well-known/adagents.json` (AdCP v3.2+ property/signal authorization), `/.well-known/jwks.json` (RFC 9421 signing), optional `tdmrep.json` / `rsl.xml` |
| **5. Storefront, Paid API, or Merchant Catalog** | All Archetype 1 baseline layers | `/.well-known/ucp` (Universal Commerce Protocol), ACP checkout feeds, `x402` (`HTTP 402 Payment Required`) |

When crawl/training policy (`ai-train=no` vs `yes`), brand house hierarchy (`Variant 4` vs `Variant 5`), or publisher agent authorization scope is ambiguous, ask 1 to 3 concise multiple-choice questions before writing policy files.

---

## 2. Script-First Audit & Manifest Workflow

Always run the bundled zero-dependency Node 24 CLI (`agentic-web-audit.mjs`) first instead of manually listing directories or guessing schema rules.

### 2.1 Map Repository Structure & Existing Artifacts
```bash
# Emit deterministic JSON manifest of routes, MDX content, .md twins, and .well-known files:
node ~/.agents/skills/agentic-web/scripts/agentic-web-audit.mjs --root . --manifest

# Run full static AST + AdCP v3 + RFC 8615 compliance audit on the repository:
node ~/.agents/skills/agentic-web/scripts/agentic-web-audit.mjs --root . --report-only
```

### 2.2 Probe Live Dev Server or Deployed Origin
After starting the local dev server or deploying, verify real HTTP status codes, `Content-Type`, `Link` headers, CORS, redirect behavior, and `Accept: text/markdown` negotiation:
```bash
node ~/.agents/skills/agentic-web/scripts/agentic-web-audit.mjs --url https://example.com
# Or combine local + live checks in strict CI mode (exits 1 on any error):
node ~/.agents/skills/agentic-web/scripts/agentic-web-audit.mjs --root . --url http://localhost:4321
```

---

## 3. Core Layer Guardrails & Progressive Reference Guides

Load ONLY the reference files needed for your active layers:

### Layer A: `llms.txt` v2+ & Clean Markdown Delivery
Read [`references/llms-txt-v2.md`](./references/llms-txt-v2.md) and starter [`templates/llms-v2.md`](./templates/llms-v2.md).
- **Strict Sequential Grammar**:
  1. Single `# Project or Site Name` H1 (required).
  2. `> Concise 1-2 sentence summary` blockquote (immediately below H1).
  3. Optional preamble paragraphs/lists with **zero headings**.
  4. Zero or more `## Section` H2 headings containing ONLY Markdown link list items (`- [Title](https://domain/page.md): Short description`).
- **Critical Rule**: Never put `###` subheadings, raw CSS hex palettes, or prose paragraphs inside `##` sections of `/llms.txt` (breaks `parse_llms_file` and v2 AST validators). Put structured brand identity in `/.well-known/brand.json` and link to it (or to `/brand.md`) from `/llms.txt`.
- **v2 Link Relations**: Expose `rel="alternate" type="text/markdown"` pointing to each page's `.md` twin (`page.md` or `page.html.md`) and `rel="describedby"` pointing to `/llms.txt` (or subpath `/docs/llms.txt`) via HTML `<link>` tags and/or HTTP `Link:` headers.

### Layer B: AdCP v3.2+ Brand Identity & Supply-Chain Authorization
Read [`references/adcp-v3.md`](./references/adcp-v3.md) and starters [`templates/brand-canonical.json`](./templates/brand-canonical.json), [`templates/brand-house.json`](./templates/brand-house.json), and [`templates/adagents-inline.json`](./templates/adagents-inline.json).
- **`/.well-known/brand.json`**:
  - Use Variant 5 (`Brand Canonical Document`) for standalone brands: requires `id` matching `^[a-z0-9_]+$` (underscores only, never hyphens) and `names` (`[{ "en_US": "Brand Name" }]`), plus `colors`, `fonts`, `logos`, `tone`, and `properties`.
  - Use Variant 4 (`House Portfolio`) when a parent company governs multiple `brands[]` and/or `brand_refs[]`.
  - Reject hallucinated keys such as `brand_name` or `brand_colors`.
- **`/.well-known/adagents.json`**:
  - Every `authorized_agents[]` item requires `url` (`https://`), `authorized_for` (1 to 500 chars), and a valid `authorization_type` discriminator (`property_ids`, `property_tags`, `inline_properties`, `publisher_properties`, `signal_ids`, `signal_tags`).
  - Serve directly with `200 OK` at origin (use JSON `authoritative_location` instead of HTTP `301`/`302` redirects).
- **Upstream AdCP Agent Skills (Bootstrap on Demand)**:
  When building an AdCP buyer, seller, creative, signals, or governance agent (MCP or A2A), install the official `adcontextprotocol/adcp` task skills:
  ```bash
  npx --yes skills add adcontextprotocol/adcp --list
  npx --yes skills add adcontextprotocol/adcp \
    --skill adcp-media-buy \
    --skill adcp-creative \
    --skill adcp-signals \
    --skill adcp-governance -y
  ```

### Layer C: RFC 8615 Well-Known Agent, API & Auth Discovery
Read [`references/rfc8615-well-known.md`](./references/rfc8615-well-known.md) and starters [`templates/mcp-server-card.json`](./templates/mcp-server-card.json), [`templates/agent-card.json`](./templates/agent-card.json), and [`templates/api-catalog.json`](./templates/api-catalog.json).
- **CORS & Media Types**: Serve JSON manifests with `Content-Type: application/json; charset=utf-8` (`application/linkset+json` for `/.well-known/api-catalog`, `text/plain; charset=utf-8` for `/.well-known/security.txt`) and `Access-Control-Allow-Origin: *`.
- **Middleware / Router Exclusion**: Exclude `/.well-known/`, `/llms.txt`, `/llms-full.txt`, and `*.md` from Next.js `proxy.ts` / `middleware.ts` matchers, locale prefixes, and SPA HTML fallback rewrites.
- **`security.txt` Hygiene**: Always set a valid `Contact:` URI and a future ISO 8601 `Expires:` timestamp (6 to 12 months ahead).

### Layer D: Crawl Signals, Rights, WebMCP & Commerce
Read [`references/commerce-and-signals.md`](./references/commerce-and-signals.md).
- **`Content-Signal` & `robots.txt`**: Pair `Allow: /llms.txt` and `Allow: /.well-known/` with explicit `Content-Signal: search=yes, ai-input=yes, ai-train=no` (unless the project chooses `ai-train=yes`).
- **WebMCP (`navigator.modelContext`)**: Feature-detect `navigator.modelContext?.registerTool` to expose deterministic client-side calculators and search/filter actions with `readOnlyHint: true` where appropriate, never auto-submitting destructive or financial mutations without explicit user consent.

---

## 4. Verification Gate Before Completion

Never mark an Agentic Web implementation complete until all three checks pass:
1. `node ~/.agents/skills/agentic-web/scripts/agentic-web-audit.mjs --root .` reports **0 errors**.
2. Project build and test suite succeed (`pnpm build` / `pnpm test`).
3. When a dev server or live URL is reachable, `node ~/.agents/skills/agentic-web/scripts/agentic-web-audit.mjs --url <target>` confirms `200 OK`, accurate `Content-Type` (not HTML fallback), `Link` relations, and CORS headers.
