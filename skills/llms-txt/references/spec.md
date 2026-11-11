# llmstxt.org v2 Specification Summary

Source: [llmstxt.org](https://llmstxt.org/) and [Changes (v2, August 2026)](https://llmstxt.org/changes.md) by Jeremy Howard (Answer.AI).

## Core Concept

`/llms.txt` is a Markdown index file placed at `/llms.txt` (or at any subpath such as `/docs/llms.txt`) giving coding agents and LLM-powered assistants a concise overview and curated links to clean Markdown versions of pages.

## What Changed in v2 (August 2026)

1. **Discoverability via Link Relations (`RFC 8288`)**:
   - `rel="alternate" type="text/markdown"` points from an HTML page to its Markdown twin.
   - `rel="describedby"` points from any page or asset to the `llms.txt` file covering it.
   - Declared via `<link>` elements in HTML `<head>` or HTTP `Link:` response headers.
2. **Flexible `.md` URL Conventions**:
   - Append pattern: `/page.html` -> `/page.html.md` (`/index.html.md` for directory paths).
   - Replace pattern: `/page.html` -> `/page.md` (`/index.md` for directory paths).
3. **Subpath Scoping ("Most Specific Wins")**:
   - `/docs/llms.txt` covers all URLs under `/docs/`. When both `/llms.txt` and `/docs/llms.txt` apply, agents use the most specific file.
4. **Direct Consumption Model**:
   - Agents inspect or search `llms.txt` directly and follow relevant `.md` links on demand.
   - Context-expansion tooling (`llms_txt2ctx`) was retired from the proposal; `## Optional` remains a valid editorial convention for secondary links without mechanical parser semantics.

## Strict Sequential AST Format

1. **Optional UTF-8 BOM**
2. **H1 heading (`# Title`)**: Required; single H1 naming the project or site.
3. **Summary blockquote (`> ...`)**: Concise summary immediately following the H1.
4. **Preamble body**: Zero or more paragraphs or bullet lists providing orientation and technical constraints. **Zero headings allowed before the first H2.**
5. **H2 file-list sections (`## Section`)**: Zero or more sections where every item is a Markdown link list entry:
   ```markdown
   - [Link title](https://example.com/page.md): Concise description of the linked file
   ```

## Relationship to Companion Standards

| Standard | Path | Role |
| :--- | :--- | :--- |
| **`llms.txt` v2** | `/llms.txt` or `/<subpath>/llms.txt` | Curated Markdown index for on-demand agent navigation |
| **AdCP `brand.json`** | `/.well-known/brand.json` | Canonical JSON Schema brand identity, colors, typography, logos, and voice guardrails |
| **AdCP `adagents.json`** | `/.well-known/adagents.json` | Publisher property and sales-agent authorization |
| **MCP Server Card** | `/.well-known/mcp.json` | SEP-2127 remote HTTP MCP tool server discovery |
| **API Catalog** | `/.well-known/api-catalog` | RFC 9727 JSON Linkset pointing to OpenAPI specs and docs |
| **`robots.txt` + `Content-Signal`** | `/robots.txt` | Crawler access and `search` / `ai-input` / `ai-train` preferences |
