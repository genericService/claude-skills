# claude-skills

Portable AI agent skill distribution. Skills are framework-agnostic instruction sets that extend agent capabilities for specialized tasks — usable by both Claude and Gemini.

## Skills

| Skill                          | Description                                                                                                                                                      |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **agentic-web**                | Unified Agentic Web discovery, identity, entity graph, and governance: `llms.txt` v2+, AdCP v3.2+ (`brand.json`, `adagents.json`), JSON-LD 1.1 / `Schema.org` (`schema-dts`), RFC 8615 `.well-known` (`ard.json`, `ai-catalog.json`, `agent-card.json`), `Content-Signal`, WebMCP |
| **llms-txt**                   | `llmstxt.org` v2 (August 2026) `/llms.txt`, `.md` page twins, `Link` relations (`alternate` / `describedby`), and `/llms-full.txt`                               |
| **cloudflare-pages**           | Cloudflare Pages deployment and configuration                                                                                                                    |
| **deep-research**              | Structured deep research methodology                                                                                                                             |
| **design-lookup**              | Design system discovery and reference                                                                                                                            |
| **kitchen-sink-design-system** | Framework-agnostic Kitchen Sink design system workflow — component inventory, tiered checklists, CVA patterns, voice/tone, image reinterpretation, motion tokens |
| **nextjs-tinacms**             | Next.js 16 + React 19 + TinaCMS — scaffolding through production, 247-task day 0–2 checklist                                                                     |
| **omni-image**               | OpenAI image generation, editing, vision, batch processing, and transforms                                                                                       |

## Structure

```
skills/          ← Source (edit here)
dist/            ← Packaged .skill ZIPs (auto-generated on commit)
hooks/pre-commit ← Auto-packages modified skills into dist/
scripts/         ← Repository maintenance scripts (e.g. audit_skills.py)
tests/           ← Tests for repository maintenance scripts
```

## Installing a Skill

### Claude

```bash
# From a project repo:
npx skills add kitchen-sink-design-system
# Or manually:
cp -r skills/<name> /path/to/project/.agent/skills/<name>
```

### Gemini / Antigravity

```bash
./scripts/install-skills.sh
```

*(Note: Do not symlink directly to `~/.gemini/antigravity/skills/` as Gemini reads `~/.gemini/skills/` globally and doing so causes duplicate install warnings.)*

## Authoring a Skill

1. Create `skills/<name>/SKILL.md` with YAML frontmatter:
   ```yaml
   ---
   name: my-skill
   description: What the skill does and when to trigger it.
   ---
   ```
2. Add supporting files in `references/`, `templates/`, `examples/`, `scripts/` as needed
3. **Verify** — Run `python3 scripts/audit_skills.py skills` to ensure compliance (SKILL.md exists, valid frontmatter, no loose files).
4. Commit — the pre-commit hook packages it into `dist/<name>.skill`

## Distribution

`.skill` files in `dist/` are standard ZIP archives. Share them directly or install from the `skills/` source directories.
