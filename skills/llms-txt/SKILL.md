---
name: llms-txt
version: 3.1.0
description: "Primary-source llms.txt v2+ generator and validator (llmstxt.org August 2026 spec + AnswerDotAI/llms-txt parser rules + Chrome Lighthouse agentic-browsing). Crawls repo structure and generates strict v2-compliant /llms.txt, clean .md page twins, RFC 8288 Link relations (rel=alternate/describedby), and /llms-full.txt."
---

# LLMs.txt v2+ Generator (`llmstxt.org` + `AnswerDotAI/llms-txt`)

Generate and validate `/llms.txt`, subpath `llms.txt` indexes, `.md` page twins, `RFC 8288` `Link` relations, and `/llms-full.txt` following the [llmstxt.org v2 specification](https://llmstxt.org/) (August 2026), the official `AnswerDotAI/llms-txt` (`0.0.7`) reference parser, and Chrome Lighthouse `agentic-browsing` audits.

> **Full-Stack Agentic Discovery (`agentic-web`)**: Whenever a project also needs AdCP v3.2.8+ (`/.well-known/brand.json`, `/.well-known/adagents.json`), RFC 8615 manifests (`ai-catalog.json` + `<mcp-url>/server-card` SEP-2127, `agent-card.json` A2A v1.0.1, `api-catalog` RFC 9727, `oauth-protected-resource` RFC 9728, `security.txt` RFC 9116), `Content-Usage` / `Content-Signal`, or WebMCP (`document.modelContext`), activate `agentic-web` (`skills/agentic-web/SKILL.md`).

## Usage

1. **Run the deterministic manifest & AST scanner:**
   ```bash
   # Node 24 full v2 + RFC 8615 scanner/validator (preferred when agentic-web is installed):
   node ~/.agents/skills/agentic-web/scripts/agentic-web-audit.mjs --root . --manifest llms-manifest.json
   # Or Python fallback manifest crawler:
   python3 ~/.agents/skills/llms-txt/scripts/generate_llms_manifest.py --root "." --out "llms_manifest.json"
   ```

2. **Draft `/llms.txt` Obeying Both v2 AST & `AnswerDotAI/llms-txt` Parser Rules:**
   1. `# Project or Site Name` on line 1 (single H1 required; **never prepend UTF-8 `\uFEFF` BOM**, which breaks Python `parse_llms_file`).
   2. `> Concise single-line summary` immediately below H1 (keep on **one line**; multiline blockquotes fail `^> (?P<summary>.+?$)$`).
   3. Optional orientation preamble (paragraphs and lists with **zero headings**).
   4. `## Section Name` H2 file-list sections containing ONLY **hyphen-bullet** Markdown links:
      `- [Page Title](https://domain.com/page.md): Concise note`
      - **Never** use `* ` or `+ ` bullets (`parse_link` matches `-` only and crashes `parse_llms_file` with `AttributeError`).
      - **Never** place `[brackets]` inside `[Page Title]` or unencoded `(parens)` inside `(url)` (percent-encode as `%28` / `%29`).
      - Keep `/llms.txt` >= 50 chars (Chrome Lighthouse `llms-txt` pass threshold) and <= 50 KiB (`turva-llms-txt-validator --strict`).
   5. Optional `## Optional` H2 section for secondary resources (`llms_txt2ctx` context expansion is deprecated in v2).

3. **Expose Clean `.md` Twins & `RFC 8288` Link Relations:**
   - Serve clean Markdown equivalents using either the replace pattern (`/docs/auth.md`, `/index.md`) or append pattern (`/docs/auth.html.md`, `/index.html.md`), with subpath scoping (`most specific ancestor llms.txt wins`).
   - Emit discovery links via HTML `<head>` tags and/or HTTP `Link:` headers (`type="text/markdown"` MUST be quoted in HTTP `Link:` headers because `/` is invalid in HTTP tokens):
     ```http
     Link: </docs/auth.md>; rel="alternate"; type="text/markdown", </llms.txt>; rel="describedby"
     ```
   - Ensure catch-all SPA/Next.js routes NEVER return `200 OK` HTML at `/llms.txt` (scores `0` FAIL in Chrome Lighthouse, whereas `404` is `notApplicable`).

4. **Verified Framework SDKs (Avoid npm Hallucinations):**
   - `llms-txt` (`0.0.7`) is PyPI-only (`uv add llms-txt`); `llms-txt` and `llms-txt-js` do **not** exist on npm.
   - Verified npm packages: `fumadocs-core` (`llms(source)`), `vitepress-plugin-llms`, `starlight-llms-txt`, `docusaurus-plugin-llms`, `@lacspace/llms-txt`, and CLI `turva-llms-txt-validator`.
