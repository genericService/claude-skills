# Real-World /llms.txt v2 Patterns

Annotated patterns from production sites following the August 2026 `llmstxt.org` v2 specification.

## 1. FastHTML (`fastht.ml/docs/llms.txt`)

**Pattern: Subpath scoping + preamble constraints + `.html.md` twins.**

- Hosted at `/docs/llms.txt` to scope specifically to documentation routes.
- Places critical stack caveats ("Although parts of its API are inspired by FastAPI, it is not compatible with FastAPI syntax") in the **heading-free preamble** right after the `> Summary` blockquote, preserving strict H2 link-list parsing below.
- Every page exposes a clean `.md` twin advertised via `Link` relations.

## 2. AdCP Documentation (`docs.adcontextprotocol.org/llms.txt`)

**Pattern: Versioned multi-tier index (`/_llms/3-2.md`) + `llms-current.md`.**

- Root `/llms.txt` points agents to `llms-current.md` and version-pinned sub-indexes (`3-2.md`, `3-1.md`, `3-0.md`).
- Every linked page resolves directly as clean `.md` (`https://docs.adcontextprotocol.org/dist/docs/3.2.8/...`).

## 3. Generic Service (`genericservice.app/llms.txt`)

**Pattern: Brand-paired v2 index (`llms.txt` + `/notes/llms.txt` + `/.well-known/brand.json`).**

- Keeps concise architectural and voice orientation in the heading-free preamble before `## Core Pages`.
- Links every page to its `.md` twin (`/services.md`, `/health-check.md`, `/pricing.md`) and advertises `rel="alternate" type="text/markdown"` + `rel="describedby"` in HTTP `Link` headers.
- Delegates structured color tokens, font files, vector marks, and voice `dos`/`donts` to `/.well-known/brand.json` (AdCP v3) while linking to `brand.json`, `adagents.json`, and `security.txt` under `## Brand Discovery & RFC 8615 Endpoints`.
- Uses subpath `/notes/llms.txt` to scope engineering Field Notes separately.

## Anti-Patterns to Avoid

- **Putting `###` subheadings or non-link prose inside `##` sections**: Breaks deterministic `parse_llms_file` AST parsers. Put prose notes in the preamble above the first `##`, or inside a linked `.md` / `brand.json` file.
- **Linking only to HTML pages when `.md` twins exist**: Wastes agent tokens on navigation chrome and scripts.
- **Dumping 500+ uncurated sitemap URLs**: Keep `/llms.txt` curated and compact; put exhaustive single-file bundles in `/llms-full.txt`.
