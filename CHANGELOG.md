# Changelog

## v2026.11.11 (2026-11-11)

- Added `agentic-web` (`1.0.0`) unified composable skill covering `llms.txt` v2+ (`llmstxt.org` August 2026 AST, `.md` page twins, `Link` `rel="alternate"` / `rel="describedby"`, `Accept: text/markdown`), AdCP v3.2+ (`/.well-known/brand.json`, `/.well-known/adagents.json`, RFC 9421 signing, upstream `adcontextprotocol/adcp` skill bootstrap), RFC 8615 discovery (`mcp.json` SEP-2127, `agent-card.json` A2A, `api-catalog` RFC 9727, `oauth-protected-resource` RFC 9728, `security.txt` RFC 9116), `Content-Signal` / IETF `aipref`, WebMCP (`navigator.modelContext`), and commerce (`UCP`, `ACP`, `x402`), complete with zero-dependency Node 24 validator CLI (`scripts/agentic-web-audit.mjs`), modular references, and schema-valid starter templates.
- Upgraded `llms-txt` to `3.0.0` for strict `llmstxt.org` v2 compliance, moving orientation rules into the heading-free preamble and delegating structured brand palettes and voice guardrails to `/.well-known/brand.json` (AdCP v3).
