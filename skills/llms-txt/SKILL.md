---
name: llms-txt
version: 3.0.0
description: "Script-First llms.txt v2+ generator (llmstxt.org August 2026 spec). Crawls repo structure and generates strict v2-compliant /llms.txt, clean .md page twins, Link relations (rel=alternate/describedby), and /llms-full.txt. Pairs with agentic-web for AdCP /.well-known/brand.json and RFC 8615 discovery."
---

# LLMs.txt v2+ Generator

Generate and validate `/llms.txt`, subpath `llms.txt` indexes, `.md` page twins, `Link` relations, and `/llms-full.txt` following the official [llmstxt.org v2 specification](https://llmstxt.org/) (August 2026).

> **Full-Stack Agentic Discovery (`agentic-web`)**: Whenever a project also needs AdCP v3 (`/.well-known/brand.json`, `/.well-known/adagents.json`), RFC 8615 manifests (`mcp.json`, `agent-card.json`, `api-catalog`, `oauth-protected-resource`, `security.txt`), `Content-Signal` headers, or WebMCP, activate the `agentic-web` skill (`skills/agentic-web/SKILL.md`).

## Usage

When asked to "generate llms.txt", "upgrade llms.txt to v2", or "make pages readable as Markdown for agents":

1. **Run the deterministic manifest scanner:**
   ```bash
   # Node 24 full v2 + RFC 8615 scanner/validator (preferred when agentic-web is installed):
   node ~/.agents/skills/agentic-web/scripts/agentic-web-audit.mjs --root . --manifest llms-manifest.json
   # Or Python fallback manifest crawler:
   python3 ~/.agents/skills/llms-txt/scripts/generate_llms_manifest.py --root "." --out "llms_manifest.json"
   ```

2. **Draft `/llms.txt` Using the Strict v2 Sequential AST:**
   1. `# Project or Site Name` (single H1, required)
   2. `> Concise 1-2 sentence summary` (blockquote immediately below H1)
   3. Optional orientation preamble (paragraphs and bullet lists with **zero headings**)
   4. `## Section Name` H2 file-list sections containing ONLY Markdown link items:
      `- [Page Title](https://domain.com/page.md): Concise note`
   5. Optional `## Optional` H2 section for secondary resources (editorial convention in v2; `llms_txt2ctx` context expansion is deprecated).

3. **Expose Clean `.md` Twins & v2 Link Relations:**
   - Serve clean Markdown equivalents using either the replace pattern (`/docs/auth.md`, `/index.md`) or append pattern (`/docs/auth.html.md`, `/index.html.md`).
   - Emit standard discovery links via HTML `<head>` tags and/or HTTP `Link:` headers:
     ```http
     Link: </docs/auth.md>; rel="alternate"; type="text/markdown", </llms.txt>; rel="describedby"
     ```

4. **Offload Structured Brand Governance to `/.well-known/brand.json`:**
   - Never place `### Visual Identity` subheadings or raw prose paragraphs inside `##` sections of `/llms.txt` (violates v2 file-list parser grammar). Place short stack/voice invariants in the heading-free preamble above the first `##`, and publish full palette/font/logo/voice governance at `/.well-known/brand.json` (AdCP v3) or a linked `/brand.md` document.
