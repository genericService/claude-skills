# llms.txt v2+ Specification & Implementation Guide

Authoritative reference for `/llms.txt` v2 (released August 2026 at https://llmstxt.org/) and forward-compatible Markdown delivery patterns for coding agents, search/chat agents, and automated validators (including Chrome Lighthouse agentic browsing audits and `agent-ready.dev`).

---

## 1. What Changed in v2 (August 2026) and Why It Matters

1. **Standardized Discoverability via Link Relations (`RFC 8288`)**:
   - `rel="alternate" type="text/markdown"` points from an HTML page to its clean Markdown equivalent.
   - `rel="describedby"` points from any HTML page, Markdown page, or asset to the `/llms.txt` (or subpath `llms.txt`) covering it.
   - Exposed via HTML `<link>` elements in `<head>`, HTTP `Link:` response headers, or both.
2. **Dual Markdown URL Conventions**:
   - **Append pattern**: `/docs/page.html` -> `/docs/page.html.md` (and `/docs/` -> `/docs/index.html.md`).
   - **Replace pattern**: `/docs/page.html` -> `/docs/page.md` (and `/docs/` -> `/docs/index.md` or `/docs.md` for clean route segments).
   - Pick one convention per site and apply it consistently across routes and `<link rel="alternate">` hrefs.
3. **Subpath Scoping ("Most Specific Wins")**:
   - `/llms.txt` at the origin root covers the entire site.
   - `/docs/llms.txt` covers everything under `/docs/`.
   - When both `/llms.txt` and `/docs/llms.txt` exist, agents resolving `/docs/api/auth` MUST use `/docs/llms.txt` because it is the most specific ancestor path.
   - Enables multi-product monorepos and subpath hosts (such as GitHub Pages project sites) that do not control origin-root `/.well-known/`.
4. **Direct Agent Consumption Model (Deprecation of `llms_txt2ctx`)**:
   - Agents read or search `llms.txt` directly, then fetch only the linked `.md` documents relevant to the current task.
   - `## Optional` remains a valid editorial section for lower-priority or background links that an agent may skip under tight token budgets, though it no longer triggers mechanical context-expansion exclusion.
5. **Companion `Accept: text/markdown` Content Negotiation**:
   - Alongside static `.md` URL twins, edge networks (such as Cloudflare Markdown for Agents) and Next.js middleware/proxies increasingly serve Markdown directly at the canonical URL when a client sends `Accept: text/markdown`.
   - Always pair `Accept: text/markdown` responses with `Vary: Accept`, `Content-Type: text/markdown; charset=utf-8`, and optional `x-markdown-tokens` + `Content-Signal` headers.

---

## 2. Strict Sequential AST Grammar

Unlike free-form README files, `llms.txt` is parsed both by LLMs and by deterministic parsers (`parse_llms_file` in Python `llms-txt`, regex/AST validators, and Lighthouse). The file MUST follow this exact top-to-bottom sequence:

1. **Optional UTF-8 BOM**
2. **H1 Title (`# Site or Project Name`)**: **Required.** Exactly one H1 at the top of the document.
3. **Summary Blockquote (`> ...`)**: **Recommended.** Concise 1 to 2 sentence summary containing the core context needed to interpret the rest of the file.
4. **Preamble Body (Zero Headings Allowed)**: **Optional.** Zero or more paragraphs, bullet lists, or code spans giving critical orientation notes (for example, stack constraints or architectural invariants). **Never place `###` or `##` headings inside the preamble.**
5. **File-List Sections (`## Section Name`)**: Zero or more H2 sections. Every H2 section MUST contain a Markdown list of links matching this exact item grammar:
   ```markdown
   - [Link Title](https://example.com/path.md): Concise description of what the linked file contains
   ```
   or without the optional `: description` suffix:
   ```markdown
   - [Link Title](https://example.com/path.md)
   ```

### Common Grammar Defects Caught by Validators

| Defect | Why It Fails | Fix |
| :--- | :--- | :--- |
| Adding `### Visual Identity` or prose paragraphs inside `##` sections | Breaks deterministic file-list parsers (`parse_llms_file`) that expect every `##` section to contain link items | Move brand colors, fonts, and voice rules into `/.well-known/brand.json` (AdCP v3) and/or a dedicated `/brand.md` file linked from `## Brand & Governance` |
| Linking only to heavy HTML routes (`https://acme.com/pricing`) | Forces agents to strip nav/footer/JS noise and fails v2 `.md` twin guidance | Point links in `llms.txt` to clean Markdown URLs (`https://acme.com/pricing.md`) or raw `.md`/`.py`/`.json` specs |
| Dumping entire site copy into `/llms.txt` | Blows context windows and defeats selective link traversal | Keep `/llms.txt` compact (typically under 2,000 tokens); place single-file concatenations in `/llms-full.txt` if desired |
| Using bare relative paths without leading `/` or full origin | Ambiguous when `llms.txt` is ingested out-of-band or mirrored | Prefer full `https://` canonical URLs in `llms.txt` |

---

## 3. Link Relations: HTML `<head>` & HTTP `Link:` Headers

### 3.1 HTML `<head>` Tags
On every public HTML page (for example, `/services`), emit both discovery links:

```html
<link rel="alternate" type="text/markdown" href="https://example.com/services.md" title="Markdown version" />
<link rel="describedby" href="https://example.com/llms.txt" type="text/markdown" />
```

### 3.2 HTTP `Link:` Response Header (Recommended for HTML, `.md`, and APIs)
HTTP headers work on HTML pages, `.md` twins, PDFs, and JSON responses without touching page templates:

```http
Link: </services.md>; rel="alternate"; type="text/markdown", </llms.txt>; rel="describedby"
```

When serving `/services.md` itself, omit the self-referential `rel="alternate"` and keep `Link: </llms.txt>; rel="describedby"`.

---

## 4. Next.js (App Router) & Cloudflare Implementation Patterns

### 4.1 Next.js Metadata API (`app/layout.tsx` & Page Metadata)
Wire `alternates.types` for `text/markdown` and attach HTTP `Link` headers in `next.config.ts` or `proxy.ts` / `middleware.ts`:

```tsx
// In a page's generateMetadata({ params }):
export async function generateMetadata(): Promise<Metadata> {
  return {
    alternates: {
      canonical: "https://example.com/services",
      types: {
        "text/markdown": "https://example.com/services.md",
      },
    },
  };
}
```

### 4.2 Serving Clean `.md` Twins & `Accept: text/markdown` in Next.js
Two clean architectures avoid duplicating content:
1. **Build-Time Static Twin Generator (`scripts/build-llms.mjs`)**: Reads MDX/content sources and writes `public/llms.txt`, `public/llms-full.txt`, `public/index.md`, and `public/<route>.md` before `next build`. Zero serverless runtime compute and instant CDN edge caching.
2. **Dynamic Route Handler + Header Negotiation**: Route `/[...slug].md/route.ts` (or rewrite `/:path*.md` -> `/api/md/:path*` in `next.config.ts`) plus `Accept: text/markdown` inspection in `proxy.ts` / `middleware.ts` returning `Content-Type: text/markdown; charset=utf-8` and `Vary: Accept`.

### 4.3 Middleware / Proxy Exclusion Guard (Critical)
Ensure auth guards, locale redirects, and catch-all dynamic routes NEVER intercept `/llms.txt`, `/llms-full.txt`, `/.well-known/*`, or `*.md`:

```ts
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|llms\\.txt|llms-full\\.txt|\\.well-known/|.*\\.md$).*)",
  ],
};
```

### 4.4 Cloudflare Pages / Edge `_headers`
For static or Cloudflare-fronted deployments, attach headers declaratively in `public/_headers`:

```text
/llms.txt
  Content-Type: text/markdown; charset=utf-8
  Cache-Control: public, max-age=3600
  Access-Control-Allow-Origin: *

/*.md
  Content-Type: text/markdown; charset=utf-8
  Cache-Control: public, max-age=3600
  Link: </llms.txt>; rel="describedby"
  Access-Control-Allow-Origin: *
```
