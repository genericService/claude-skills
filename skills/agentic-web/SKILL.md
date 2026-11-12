---
name: agentic-web
version: 2.1.0
description: >-
  Author, audit, and maintain primary-source-compliant Agentic Web discovery,
  entity grounding, identity, governance, and commerce surfaces across any website
  or API: llms.txt v2+ (llmstxt.org AST, AnswerDotAI parser invariants, .md page
  twins, Link rel=alternate/describedby, Accept: text/markdown, Lighthouse
  agentic-browsing), Schema.org JSON-LD 1.1 (@graph + @id entity linking,
  schema-dts, \u003c XSS escaping, NLWeb & brand.json parity), AdCP v3.2.8+
  (/.well-known/brand.json, /.well-known/adagents.json, RFC 9421 sf-binary &
  webhook signing, @adcp/sdk & Python adcp), RFC 8615 manifests (ard.json +
  ai-catalog.json + server-card SEP-2127, MCP 2026-07-28 v2 SDKs, agent-card.json
  A2A v1.0.1, api-catalog RFC 9727, oauth-protected-resource RFC 9728, security.txt
  RFC 9116), crawl rights (IETF aipref Content-Usage + Cloudflare Content-Signal,
  TDMRep, RSL 1.0), W3C WebMCP (document.modelContext), and commerce (UCP, ACP, x402 v2).
  Use whenever making a site AI/agent-ready, generating or fixing llms.txt or JSON-LD,
  configuring AdCP brand/publisher manifests, or auditing /.well-known/ endpoints.
---

# Agentic Web Discovery, Entity Graph & Protocol Skill (`llms.txt` v2+, JSON-LD, AdCP v3.2+, RFC 8615)

Composable, primary-source-verified workflow for making websites, documentation hubs, publishers, brands, and API platforms natively discoverable, grounded, and verifiable by coding agents, search/RAG assistants, MCP clients, and autonomous peer agents.

---

## 1. Composable Vertical Archetypes (Enable Only Real Layers)

Never publish stub manifests pointing to non-existent endpoints. Select layers matching what the project actually operates:

| Archetype | Mandatory Baseline Layers | Conditional / Domain Layers |
| :--- | :--- | :--- |
| **1. Brand, Agency, Portfolio, or Local Service Site** | `/llms.txt` v2 + `.md` page twins + `Link` relations (`alternate` / `describedby`) + SSR `JSON-LD` (`@graph`: `Organization`, `WebSite`, `Service`) + `/.well-known/brand.json` (Variant 5 or 4) + `/.well-known/security.txt` + `robots.txt` (`Content-Usage` + `Content-Signal`) | `/llms-full.txt`; WebMCP (`document.modelContext`) + `SoftwareApplication` JSON-LD for interactive calculators or estimators |
| **2. Developer Docs, SDK, or Open-Source Project** | `/llms.txt` v2 (root or `/docs/llms.txt` subpath) + `.md` twins + `Link` relations + `/llms-full.txt` + `Accept: text/markdown` + SSR `JSON-LD` (`TechArticle`, `SoftwareSourceCode`, `BreadcrumbList`) | `/.well-known/api-catalog` (RFC 9727) when hosting HTTP APIs |
| **3. SaaS App, MCP Provider, or Autonomous Agent Service** | All Archetype 1 baseline layers | `/.well-known/ard.json` (Lighthouse 13.5+ ARD) + `<mcp-url>/server-card` (SEP-2127), `/.well-known/agent-card.json` (A2A v1.0.1), `/.well-known/api-catalog` (RFC 9727), `/.well-known/oauth-protected-resource` (RFC 9728) |
| **4. Media Publisher, Newsletter, CTV, or Signal Provider** | All Archetype 1 baseline layers + `NewsArticle` / `BlogPosting` / `VideoObject` JSON-LD | `/.well-known/adagents.json` (AdCP v3.2.8), `/.well-known/jwks.json` (`adcp_use` RFC 9421 keys), optional `/.well-known/tdmrep.json` / `rsl.xml` |
| **5. Storefront, Paid API, or Merchant Catalog** | All Archetype 1 baseline layers + `Product` / `Offer` JSON-LD | `/.well-known/ucp` (UCP `2026-08-25`), `/.well-known/acp.json` (ACP `2026-04-17`), `x402` v2 (`PAYMENT-REQUIRED` / `PAYMENT-SIGNATURE` / `PAYMENT-RESPONSE`) |

When crawl/training policy (`train-ai=n` vs `y`), brand house hierarchy (`Variant 4` vs `Variant 5`), or publisher agent authorization scope is ambiguous, ask 1 to 3 concise multiple-choice questions before writing policy files.

---

## 2. Script-First Audit & Manifest Workflow

Always run the bundled zero-dependency Node 24 CLI ([`scripts/agentic-web-audit.mjs`](./scripts/agentic-web-audit.mjs)) first instead of manually guessing schema rules:

```bash
# 1. Emit deterministic JSON manifest of routes, MDX content, .md twins, JSON-LD, and .well-known files:
node ~/.agents/skills/agentic-web/scripts/agentic-web-audit.mjs --root . --manifest

# 2. Run static AST + JSON-LD + AdCP v3.2.8 + RFC 8615 + ARD + WebMCP compliance audit:
node ~/.agents/skills/agentic-web/scripts/agentic-web-audit.mjs --root . --report-only

# 3. Probe live dev server or deployed origin (headers, Link, SSR JSON-LD <-> brand.json parity, 3xx):
node ~/.agents/skills/agentic-web/scripts/agentic-web-audit.mjs --root . --url http://localhost:4321
```

---

## 3. Primary-Source Guardrails & Progressive Reference Guides

Load ONLY the reference files needed for your active layers:

### Layer A: `llms.txt` v2+, Parser Invariants & Markdown Twins
Read [`references/llms-txt-v2.md`](./references/llms-txt-v2.md) and starter [`templates/llms-v2.md`](./templates/llms-v2.md).
- **Sequential Grammar & `AnswerDotAI/llms-txt` Rules**: Single `# Project Name` H1 on line 1 (no UTF-8 `\uFEFF` BOM), single-line `> summary` blockquote, optional heading-free preamble, and `## Section` H2 lists using hyphen `- [Title](https://domain/page.md): Short note` bullets only (never `* ` bullets, nested `[brackets]` in titles, `(parens)` in URLs, or `###` subheadings).
- **v2 Link Relations (`RFC 8288`)**: Emit `rel="alternate" type="text/markdown"` (quoted `type` in HTTP `Link:` headers) and `rel="describedby"` pointing to `/llms.txt`.

### Layer B: AdCP v3.2.8+ Brand Identity & Supply-Chain Authorization
Read [`references/adcp-v3.md`](./references/adcp-v3.md) and starters [`templates/brand-canonical.json`](./templates/brand-canonical.json), [`templates/brand-house.json`](./templates/brand-house.json), and [`templates/adagents-inline.json`](./templates/adagents-inline.json).
- **`/.well-known/brand.json`**: Variant 5 (`Brand Canonical Document`) requires `"version": "1.0"`, `"id"` matching `^[a-z0-9_]+$` (underscores only), and non-empty `"names"`. `authoritative_location` targets forbid HTTP `3xx` redirects.
- **`/.well-known/adagents.json`**: Requires `url` (`https://`), `authorized_for` (1 to 500 chars), and `authorization_type` paired with its exact companion array (`"inline_properties"` uses key `"properties"`, never `"inline_properties"`).
- **RFC 9421 Binary Split**: AdCP 3.2 `adcp/request-signing/v1` mandates padded standard Base64 (`sf-binary`) + `content-digest`; `adcp/webhook-signing/v1` uses unpadded Base64URL.

### Layer C: RFC 8615 Agent, ARD, API & Auth Discovery (`MCP v2`, `A2A v1.0.1`)
Read [`references/rfc8615-well-known.md`](./references/rfc8615-well-known.md) and starters [`templates/ard-manifest.json`](./templates/ard-manifest.json), [`templates/ai-catalog.json`](./templates/ai-catalog.json), [`templates/mcp-server-card.json`](./templates/mcp-server-card.json), [`templates/agent-card.json`](./templates/agent-card.json), and [`templates/api-catalog.json`](./templates/api-catalog.json).
- **ARD (`/.well-known/ard.json`) & SEP-2127 (`<mcp-url>/server-card`)**: Chrome Lighthouse 13.5+ `ard-schema` audits `/.well-known/ard.json` (`urn:air:<domain>:<ns>:<name>`, flagging `ai-catalog.json` alone as `legacyWellKnown`), pointing to SEP-2127 `<mcp-url>/server-card` (`application/mcp-server-card+json`, reverse-DNS `name`, plain-text `description <= 100` chars).
- **A2A `v1.0.1` (`/.well-known/agent-card.json`)**: Uses `supportedInterfaces[]` (`JSONRPC` / `HTTP+JSON` / `GRPC` + `protocolVersion: "1.0"`), `securityRequirements`, `capabilities.extendedAgentCard`, and required `skills[].tags`.
- **RFC 9728 & RFC 9116**: Insert `/.well-known/oauth-protected-resource` **between host and path**; keep `security.txt` `Expires:` single-instance and `< 1 year` ahead.

### Layer D: Crawl Rights, W3C WebMCP & Agentic Commerce
Read [`references/commerce-and-signals.md`](./references/commerce-and-signals.md) and starters [`templates/ucp-profile.json`](./templates/ucp-profile.json) and [`templates/acp-discovery.json`](./templates/acp-discovery.json).
- **Dual Crawl Signals**: Emit both IETF `aipref` (`Content-Usage: train-ai=n, ai-use=y, search=y`) and Cloudflare (`Content-Signal: search=yes, ai-input=yes, ai-train=no`).
- **W3C WebMCP (`document.modelContext`)**: Bind tools via `document.modelContext.registerTool(tool, { exposedTo, signal })` with `AbortController` and `annotations: { readOnlyHint: true }` on calculators.
- **Commerce (`UCP`, `ACP`, `x402` v2)**: Serve `/.well-known/ucp` (`2026-08-25`) with zero redirects; use `PAYMENT-REQUIRED`, `PAYMENT-SIGNATURE`, and `PAYMENT-RESPONSE` headers with CAIP-2 IDs in `x402` v2.

### Layer E: Structured Entity Graph (`JSON-LD 1.1` / `Schema.org` + `schema-dts`)
Read [`references/json-ld-entity-graph.md`](./references/json-ld-entity-graph.md) and starter [`templates/json-ld-graph.json`](./templates/json-ld-graph.json).
- **SSR `@graph` + Fragment `@id` Linking**: Server-render `<script type="application/ld+json">` with `"@context": "https://schema.org"` and `"@graph"` using stable `@id` URIs (`#organization`, `#website`, `#person`).
- **XSS Escaping & Parity**: Always serialize with `JSON.stringify(graph).replace(/</g, "\\u003c")` and derive `Organization` (`name`, `url`, `logo`, `description`) from the same source as `/.well-known/brand.json`.

---

## 4. Verified Primary-Source SDK & Validator Matrix

| Protocol | TypeScript / Node 24 (`pnpm`) | Python (`uv`) |
| :--- | :--- | :--- |
| **`llms.txt` v2** | `fumadocs-core`, `vitepress-plugin-llms`, `@lacspace/llms-txt`, CLI `turva-llms-txt-validator` | `llms-txt` (`0.0.7`, `parse_llms_file`) |
| **Schema.org JSON-LD** | `schema-dts` (`>=2.1.0`, zero-runtime `WithContext`, `Graph`, `MergeLeafTypes`) | `rdflib` / Pydantic models |
| **AdCP v3.2.8+** | `@adcp/sdk` (`>=16.7.0`, per-tool `@adcp/sdk/types/<tool>`) | `adcp` (`>=9.6.2`, `adcp-keygen`) |
| **MCP `2026-07-28` (v2)** | `@modelcontextprotocol/server` + `@modelcontextprotocol/client` (`>=2.4.0`, `zod/v4`) | `mcp` (`>=2.3.0`, `MCPServer`) |
| **A2A `v1.0.1`** | `@a2a-js/sdk` (`>=1.3.0`, `AGENT_CARD_PATH`) | `a2a-sdk[http-server]` (`>=1.3.0`) |
| **W3C WebMCP** | `webmcp-types`, `@w3c/webmcp-polyfill`, `@mcp-b/global` (`>=6.2.0`) | N/A (browser WebIDL) |
| **UCP / x402 v2** | `@ucp-js/sdk` (`>=0.5.1`); `@x402/core`, `@x402/next`, `@x402/evm`, `@x402/fetch` (`>=2.30.0`) | `ucp-sdk` (`>=0.5.0`); `x402` (`>=2.27.0`) |

---

## 5. Verification Gate Before Completion

1. `node ~/.agents/skills/agentic-web/scripts/agentic-web-audit.mjs --root .` reports **0 errors**.
2. Project build and test suite succeed (`pnpm build` / `pnpm test`).
3. When a dev server or live URL is reachable, `node ~/.agents/skills/agentic-web/scripts/agentic-web-audit.mjs --url <target>` confirms `200 OK`, accurate media types, `Link` relations, valid SSR JSON-LD (`brand.json` parity), and CORS headers.
