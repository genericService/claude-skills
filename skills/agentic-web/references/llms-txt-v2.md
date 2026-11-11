# llms.txt v2+ Specification, Parser Internals & SDK Guide

Primary-source engineering reference for `/llms.txt` v2 (https://llmstxt.org/, August 2026), the official `AnswerDotAI/llms-txt` reference parser, Chrome Lighthouse `agentic-browsing` audits, Cloudflare Markdown for Agents, and framework SDKs.

---

## 1. Specification Summary (`llmstxt.org` v2, August 2026)

1. **Discoverability via `RFC 8288` Link Relations**:
   - `rel="alternate"` with `type="text/markdown"` points from an HTML page to its clean Markdown twin.
   - `rel="describedby"` points from any HTML page, Markdown page, or asset to the `/llms.txt` (or subpath `llms.txt`) covering it.
   - Exposed via HTML `<link>` tags in `<head>`, HTTP `Link:` response headers, or both.
2. **Dual Markdown URL Conventions**:
   - **Append convention**: `/docs/page.html` -> `/docs/page.html.md` and `/docs/` -> `/docs/index.html.md` (explicitly supported on URLs with no file extension).
   - **Replace convention**: `/docs/page.html` -> `/docs/page.md` and `/docs/` -> `/docs/index.md` (or `/docs.md` for clean route segments).
   - Choose one convention per site and apply it consistently across routes and `rel="alternate"` targets.
3. **Subpath Scoping ("Most Specific Ancestor Wins")**:
   - `/llms.txt` at the origin root covers the entire site.
   - `/docs/llms.txt` covers everything under `/docs/`.
   - When both `/llms.txt` and `/docs/llms.txt` exist, an agent resolving `/docs/api/auth` MUST use `/docs/llms.txt` because it is the most specific ancestor path.
   - Subpath scoping supports multi-product monorepos and subpath hosts (such as GitHub Pages project sites) that lack origin-root `/.well-known/` access.
4. **Direct Agent Consumption (`llms_txt2ctx` Deprecated in v2)**:
   - Agents read or search `llms.txt` directly, then selectively fetch only the `.md` URLs relevant to the active task.
   - `## Optional` remains a valid H2 section convention for secondary resources that agents may skip under tight context budgets.

---

## 2. Sequential AST Grammar & Official Reference Parser Traps

`llms.txt` must follow a strict top-to-bottom sequence so both LLMs and deterministic parsers (`AnswerDotAI/llms-txt` `parse_llms_file` and `llmstxt-js.html`) parse it without throwing exceptions:

1. **H1 Title (`# Project or Site Name`)**: **Required.** Must be line 1 (do NOT prepend a UTF-8 `\uFEFF` BOM; Python's `start.strip()` leaves `\uFEFF` intact and causes `parse_llms_file` to fail matching `^# `).
2. **Single-Line Summary Blockquote (`> Concise summary...`)**: **Recommended.** Place immediately after the H1, separated by blank lines. Keep the summary on a **single line**: the reference regex `^> (?P<summary>.+?$)$` matches one line only, causing line 2+ of a wrapped blockquote to fail matching or spill into preamble `info`.
3. **Preamble Body (Zero Headings Allowed)**: **Optional.** Paragraphs, lists, or inline code providing high-signal architectural or stack invariants. Never include `###` or `##` headings in the preamble.
4. **H2 File-List Sections (`## Section Name`)**: Zero or more H2 sections. Every non-empty line inside an H2 section MUST match the official reference regex:
   ```regex
   -\s*\[(?P<title>[^\]]+)\]\((?P<url>[^\)]+)\)(?::\s*(?P<desc>.*))?
   ```
   Canonical line format:
   ```markdown
   - [Link Title](https://example.com/path.md): Concise description of the file
   ```

### Critical Parser Compatibility Rules (`AnswerDotAI/llms-txt@0.0.7`)

| Defect | Reference Parser Outcome | Required Practice |
| :--- | :--- | :--- |
| Using `* [Title](url)` or `+ [Title](url)` bullets | `parse_link` (`-\s*\[...`) returns `None` and crashes `parse_llms_file` with `AttributeError` | Always use hyphen bullets (`- [Title](url)`) |
| Nested brackets in title (`- [API [v2]](url)`) | `[^\]]+` stops at inner `]`, breaking the link match | Write `- [API v2](url)` without square brackets inside titles |
| Literal parentheses in URL (`https://.../Foo_(bar).md`) | `[^\)]+` truncates URL at first `)` | Percent-encode parentheses as `%28` and `%29` |
| `### Subheading`, prose, or code fences inside `##` sections | Crashes `parse_llms_file` and fails AST validators | Move structured brand/voice metadata to `/.well-known/brand.json` or a linked `/brand.md` twin |
| File size > 50 KiB (~12,500 tokens) | Fails strict validators (`turva-llms-txt-validator --strict`) and bloats initial agent reads | Keep `/llms.txt` compact (< 50 KiB, ideally < 4,000 tokens); place full concatenations in `/llms-full.txt` |

---

## 3. Link Relations (`RFC 8288`) & Content Negotiation

### 3.1 HTML `<head>` Discovery Links
Emit both `<link>` tags on every public HTML page (for example, `https://example.com/services`):

```html
<link rel="alternate" type="text/markdown" href="https://example.com/services.md" title="Markdown" />
<link rel="describedby" href="https://example.com/llms.txt" type="text/markdown" />
```

### 3.2 HTTP `Link:` Header Syntax (`RFC 8288`)
Always quote `type="text/markdown"` in HTTP `Link:` headers because `/` is a separator in `RFC 8288` / `RFC 9110` parameter tokens:

```http
Link: </services.md>; rel="alternate"; type="text/markdown", </llms.txt>; rel="describedby"
```

When serving `/services.md` itself, omit self-referential `rel="alternate"` and return only `Link: </llms.txt>; rel="describedby"`.

### 3.3 Cloudflare Markdown for Agents (`Accept: text/markdown`)
Per Cloudflare's official streaming Markdown for Agents specification:
- **Trigger**: Client sends `Accept: text/markdown` (or `Accept: text/markdown, text/html;q=0.8`) and origin returns `200 OK` with `Content-Type: text/html` or `application/xhtml+xml` (up to **6 MiB** decompressed; skipped on `206`, redirects, errors, and attachment downloads).
- **Response Headers Emitted by Cloudflare**:
  - `Content-Type: text/markdown; charset=utf-8`
  - `Vary: Accept` (appended to existing `Vary`)
  - `Content-Signal: ai-train=yes, search=yes, ai-input=yes` (emitted by default unless the origin already sets `Content-Signal`; override at origin if `ai-train=no` is desired!).
  - Note: Cloudflare removed `Content-Length` and `x-markdown-tokens` response headers when switching to streaming HTML-to-Markdown conversion (token counts are reported in GraphQL `markdownForAgentsAdaptiveGroups` and Cloudflare Traces). Self-hosted Next.js or Worker routes serving buffered Markdown may still include `x-markdown-tokens` if desired.
- **API Enablement**:
  ```bash
  curl -sS -X PATCH "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/settings/content_converter" \
    -H "Authorization: Bearer ${CF_API_TOKEN}" \
    -H "Content-Type: application/json" \
    --data '{"value":"on"}'
  ```

---

## 4. Chrome Lighthouse `agentic-browsing` Category

Google Chrome Lighthouse (`lighthouse-core/config/agentic-browsing-config.js`) defines 7 equal-weight (`weight: 1`) audits for agent readiness:
1. `agent-accessibility-tree`
2. `webmcp-form-coverage`
3. `webmcp-registered-tools`
4. `webmcp-schema-validity`
5. `cumulative-layout-shift`
6. `llms-txt`
7. `ard-schema` (`rel="ard"`, `/.well-known/ard.json`, or `robots.txt` `Agentmap:`)

### Exact `llms-txt` Lighthouse Pass/Fail Rules
- **Fetch target**: Always requests origin-root `${origin}/llms.txt` (does not check subpath `/docs/llms.txt`).
- **Missing vs Broken**:
  - HTTP `404`, `401`, or `403` -> `notApplicable: true` (excluded from category denominator, zero penalty).
  - SPA soft-404 returning `200 OK` HTML (`<!DOCTYPE html>...`) -> **`score: 0` (FAIL)** because it lacks `# Title` and Markdown links! Never let a catch-all route return HTML at `/llms.txt`.
- **Pass criteria (`score: 1`)**: HTTP `200`, `content.trim().length >= 50`, matches `/^\s*#\s+.+/m` (at least one `# ` H1), and matches `/\[.+\]\(.+\)/` (at least one `[title](url)` link).

---

## 5. Official & Ecosystem SDKs and CLI Validators

> **Package Registry Guardrail**: Neither `llms-txt` nor `llms-txt-js` exists on **npm**. `llms-txt` is a **PyPI-only** package (`AnswerDotAI/llms-txt`). Use the verified npm packages below for TypeScript/JavaScript projects.

### 5.1 Python Official Reference SDK (`llms-txt==0.0.7` on PyPI)
```bash
uv add llms-txt
# CLI context expansion (legacy v1 XML/Markdown context builder) & HTML preview:
uvx --from llms-txt llms_txt2ctx public/llms.txt --optional False > public/llms-full.txt
```
```python
from pathlib import Path
from llms_txt import parse_llms_file, create_ctx

parsed = parse_llms_file(Path("public/llms.txt").read_text(encoding="utf-8"))
# Returns: {'title': str, 'summary': str | None, 'info': str, 'sections': dict[str, list[dict]]}
full_ctx_xml = create_ctx(Path("public/llms.txt").read_text(encoding="utf-8"), optional=False)
```

### 5.2 TypeScript / Framework Packages (npm)

| Framework / Use Case | Verified npm Package | Install & Key Exports |
| :--- | :--- | :--- |
| **Next.js / Fumadocs** | `fumadocs-core` (`>=16.19.0`) | `pnpm add fumadocs-core`<br>`llms(source).index()` (`fumadocs-core/source/llms`), `isMarkdownPreferred(req)` & `rewritePath` (`fumadocs-core/negotiation`), `remarkLLMs` (`fumadocs-core/mdx-plugins/remark-llms`) |
| **VitePress** | `vitepress-plugin-llms` (`>=1.15.0`) | `pnpm add -D vitepress-plugin-llms`<br>Generates `/llms.txt`, `/llms-full.txt`, `.md` page twins, and auto-injects v2 `<link rel="alternate" type="text/markdown">` + `<link rel="describedby" href="/llms.txt">` |
| **Astro Starlight** | `starlight-llms-txt` (`>=0.12.0`) | `pnpm add starlight-llms-txt`<br>Astro integration generating `/llms.txt`, `/llms-small.txt`, `/llms-full.txt`, and `/**/_llms-txt/*.txt` section splits |
| **Docusaurus** | `docusaurus-plugin-llms` (`>=0.6.1`) | `pnpm add -D docusaurus-plugin-llms`<br>Configure `generateLLMsTxt: true, generateLLMsFullTxt: true, generateMarkdownFiles: true` |
| **Generic Node / Express** | `@lacspace/llms-txt` (`>=1.5.0`) | `pnpm add @lacspace/llms-txt`<br>Exports `generateLlmsTxt(config)` (escapes `[` / `]` in titles), `parseLlmsTxt(raw)`, and `llmsTxt(config)` middleware |
| **Live v2 Validator CLI** | `turva-llms-txt-validator` (`>=0.7.2`) | `pnpm dlx turva-llms-txt-validator https://example.com --strict --format json`<br>Validates v2 AST, `<= 50 KiB` cap, link reachability, and v2 `Link` headers |

### 5.3 Next.js App Router Implementation Pattern (`fumadocs-core` or Custom Static Twins)

```ts
// proxy.ts (or middleware.ts) - Negotiate Accept: text/markdown while excluding static discovery paths
import { NextRequest, NextResponse } from "next/server";

export function proxy(req: NextRequest): NextResponse {
  const accept = req.headers.get("accept") ?? "";
  const { pathname } = req.nextUrl;

  if (
    accept.includes("text/markdown") &&
    !pathname.endsWith(".md") &&
    !pathname.startsWith("/api/") &&
    !pathname.startsWith("/.well-known/") &&
    pathname !== "/llms.txt" &&
    pathname !== "/llms-full.txt"
  ) {
    const mdPath = pathname === "/" ? "/index.md" : `${pathname.replace(/\/$/, "")}.md`;
    const url = req.nextUrl.clone();
    url.pathname = mdPath;
    const res = NextResponse.rewrite(url);
    res.headers.set("Vary", "Accept");
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|llms\\.txt|llms-full\\.txt|\\.well-known/|.*\\.md$).*)",
  ],
};
```

```tsx
// app/(site)/services/page.tsx - Emit <link rel="alternate" type="text/markdown"> via Metadata API
import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: {
    canonical: "https://example.com/services",
    types: {
      "text/markdown": "https://example.com/services.md",
    },
  },
};
```

### 5.4 Static / Cloudflare `_headers` Pattern

```text
/llms.txt
  Content-Type: text/markdown; charset=utf-8
  Cache-Control: public, max-age=3600
  Content-Signal: search=yes, ai-input=yes, ai-train=no
  Content-Usage: train-ai=n, ai-use=y, search=y
  Access-Control-Allow-Origin: *

/*.md
  Content-Type: text/markdown; charset=utf-8
  Cache-Control: public, max-age=3600
  Link: </llms.txt>; rel="describedby"
  Content-Signal: search=yes, ai-input=yes, ai-train=no
  Content-Usage: train-ai=n, ai-use=y, search=y
  Access-Control-Allow-Origin: *
```
