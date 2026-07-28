---
name: osint
version: 1.3.0
description: Open-source intelligence on people, companies, domains, and B2B accounts. Use when the user wants to investigate, vet, research, or build a dossier on a target — phrases like "OSINT", "due diligence", "background check", "research this person", "look into [company/domain]", "vet this prospect/vendor", "what does X do", "is this account worth pursuing", "find me a contact at", "who's the buyer for", or any open-source investigation task. Disambiguates identities before reporting and grades every claim by independent source count.
---

# OSINT

Open-source intelligence gathering with disambiguation discipline, confidence grading, and tiered depth. Public sources only. No breach data. No social engineering. Scope-respecting.

This skill is the orchestrator. You do the thinking. Tools and scripts are workers — they fetch, you decide.

---

## How to use this skill

1. **Classify the target.** Person, company, domain/IP, B2B account, due-diligence subject, or threat entity. If ambiguous, ask the user.
2. **Pick a depth.** Quick (≤5 min, web search only) → Standard (15–30 min, multi-tool) → Deep (full dossier, may take an hour). Default to Standard unless the user signals otherwise.
3. **Run the gates** below — every investigation, every time.
4. **Route to a workflow.** See the routing table.
5. **Produce the output contract** — a markdown dossier plus a `findings.json` sidecar.

---

## The Four Gates

Run these in order. Skipping any of them is how OSINT goes wrong.

### Gate 1 — Scope & Authorization

Before a single query, confirm:

- **Lawful basis.** Public information about a public-facing target (executive, company, public domain) is fine. Private individuals investigated for stalking, harassment, or unauthorized vetting are **not**. If the request smells like that, decline and say why.
- **No prohibited methods.** No paid breach databases. No social engineering. No accessing accounts you don't own. No bypassing paywalls or platform ToS. No active probing of infrastructure (port scans, vuln scans) without explicit authorization.
- **Scope statement.** Write one sentence: *"I am researching [target] for [purpose] using [public sources]."* If you can't write that sentence cleanly, stop.

See `references/ethics-and-scope.md` for full rules and the decline-it list.

### Gate 2 — Disambiguation

The single biggest OSINT failure mode is conflating two people (or two companies) with the same name. Before reporting **anything** about a target:

1. Identify all plausible candidates that match the name/handle.
2. Pick a **discriminator** — employer, location, age range, domain, industry, photo.
3. Confirm the discriminator from a primary source (LinkedIn, corporate bio, company website, official registry).
4. State which candidate you're tracking and which ones you're explicitly **not**.

If you can't disambiguate, say so. Don't guess.

See `references/disambiguation.md` for the full protocol.

### Gate 3 — Source Independence

A "fact" repeated by ten content-farm sites that all copied one LinkedIn bio is **one source**, not ten. Before grading a finding:

- Trace each claim to a primary source (the entity itself, an authoritative registry, a first-hand account).
- Two sources owned by the same parent, or two articles citing each other, count as one.
- Self-published claims (the target's own LinkedIn, bio, website) are useful for *what they claim* but not independent confirmation of the underlying fact.

### Gate 4 — Confidence Grading

Every finding gets a letter grade in the dossier:

- **A** — Three or more independent sources, including at least one primary or authoritative.
- **B** — Two independent sources.
- **C** — One source, or multiple non-independent sources.
- **D** — Inferred, likely-but-unconfirmed, or single self-published source.

If a finding can only get a D, either drop it or label it as inference.

See `references/confidence-grading.md` for the rubric and edge cases.

---

## Routing table

Match the user's intent to a workflow. If unclear, ask.

| User intent / phrasing | Workflow |
|---|---|
| "Research this person", "background check on", "who is X" | `workflows/person.md` |
| "Look into this company", "what does X do", "is X legit" | `workflows/company.md` |
| "B2B account intel", "is this prospect worth pursuing", "find the buyer at", "what's their stack", "who's their MSP" | `workflows/b2b-account.md` |
| "Check this domain/IP", "tech footprint", "what's running on", "subdomains of" | `workflows/domain.md` |
| "Due diligence", "investment-grade research", "vet this vendor/partner" | `workflows/due-diligence.md` |

For multi-target investigations (e.g., a person at a company), run the relevant workflows in sequence and merge the outputs.

---

## Phase model

Pick a depth at the start. Tell the user the depth and the rough budget so they can adjust.

### Quick (≤5 min, web_search only)

- 3–5 targeted searches.
- Read 1–2 primary sources.
- Output: 2–3 paragraph summary + 3–5 cited findings + confidence grades.
- Use for: triage, "do I care about this", before-a-meeting prep.

### Standard (15–30 min, multi-tool)

- 8–15 targeted searches across general web, LinkedIn, corporate registries.
- Read 5–10 primary sources, including the target's own properties.
- Cross-check at least three claims for source independence.
- Output: full dossier per `templates/dossier.md` + `findings.json` sidecar.
- Use for: most B2B account work, prospect research, person research.

### Deep (60+ min, all available tools)

- Iterative search with progressive narrowing.
- DNS/WHOIS/cert transparency for domain targets.
- Multiple platforms cross-referenced.
- Historical data (Wayback) where it changes the picture.
- Output: full dossier, findings.json, plus a one-page executive summary.
- Use for: due diligence, investment decisions, big-account work.

If you're going to exceed the budget you stated, stop and tell the user before continuing.

---

## Output contract

Every Standard or Deep investigation produces two artifacts:

1. **`<target-slug>-dossier.md`** — human-readable, follows `templates/dossier.md`. Section headers, confidence grades on every claim, source URLs collected at the bottom.
2. **`<target-slug>-findings.json`** — machine-readable, follows `templates/findings.schema.json`. Each finding has `claim`, `confidence`, `sources[]`, `category`, `extracted_at`.

For Quick investigations, the markdown summary is enough. JSON is optional.

Save outputs to a folder named `osint/<target-slug>/` in the working directory unless the user specifies otherwise.

---

## Tool usage

**Required minimum:** web search + ability to fetch URLs. The skill works with just these.

**Strongly helpful (graceful degradation):**
- LinkedIn search (via web search operators or scraper)
- WHOIS / DNS / certificate transparency for domain work
- GitHub search (free API tier is plenty)
- Wayback Machine (`web.archive.org`) for historical
- Apify or Bright Data actors for social platform extraction (if API keys present)

### X data via Apify

Use these maintained Actors when public X data materially answers the scope:

| Need | Actor |
|---|---|
| Posts, searches, replies, quotes, threads, or account timelines | [`xquik/x-tweet-scraper`](https://apify.com/xquik/x-tweet-scraper) |
| Followers, following, verified followers, lists, communities, or audience overlap | [`xquik/x-follower-scraper`](https://apify.com/xquik/x-follower-scraper) |

Keep every run bounded. For content research, start with:

```json
{
  "mode": "search",
  "searchTerms": ["from:target_handle topic"],
  "maxItems": 50,
  "outputVariant": "rich",
  "outputPreset": "nested",
  "fieldStyle": "camelCase"
}
```

For relationship research, start with:

```json
{
  "twitterHandles": ["target_handle"],
  "relation": "followers",
  "maxItems": 50,
  "maxItemsPerTarget": 50,
  "outputMode": "compact",
  "includeTargetMetadata": true
}
```

Check current pricing on each Store page before running. Set a platform charge
limit when the client supports one. Treat public connections as leads, not proof
of a personal or commercial relationship. Never target protected accounts.

Xquik is an independent third-party service. Not affiliated with X Corp. "Twitter" and "X" are trademarks of X Corp.

**Search operator reference:** `references/search-operators.md` — Google dorks, LinkedIn X-ray, GitHub search syntax, Wayback usage.

**API key check** (do this once at the start of any Standard or Deep investigation, silently):

```bash
[ -n "$GITHUB_TOKEN" ]   && echo "github: yes"   || echo "github: no"
[ -n "$BRAVE_API_KEY" ]  && echo "brave: yes"    || echo "brave: no"
[ -n "$APIFY_TOKEN" ]    && echo "apify: yes"    || echo "apify: no"
[ -n "$SHODAN_API_KEY" ] && echo "shodan: yes"   || echo "shodan: no"
```

If a key is missing, fall back to web search. Never tell the user "I can't do this" without first trying the fallback.

---

## Anti-patterns to avoid

- **Don't open with the dossier.** State the depth, scope, and disambiguation result first; produce the dossier at the end.
- **Don't manufacture confidence.** A C-grade finding labeled C is useful. A C-grade finding labeled A poisons the rest of the report.
- **Don't pad with noise.** Five well-sourced findings beat fifty drive-by mentions.
- **Don't assume the most prominent match is the right one.** The CEO is famous; the IT director you're actually trying to reach is not.
- **Don't write speculative biography.** If a source doesn't say it, you don't either.
- **Don't keep mining after the question is answered.** Quick means quick.

---

## Agentic OS Integration

If the current project root contains an `.agent/` directory, this skill MUST participate in the Agentic OS shared-memory model.

At the end of your execution, check for `.agent/state/last-run.json`. If it exists, append or update the file using its required schema to log your run. Ensure you capture your runtime (`agent_id`), `assigned_skill`, a concise `description`, `decision_log`, and `outcome`. Use `python3 ~/.agents/skills/heartbeat/scripts/heartbeat.py complete <task_id> ...` if completing a task from the queue.

## Optional: PAI / OpenCode integration

If running inside PAI or PAI-OpenCode, the following are honored automatically:

- User customizations at `~/.opencode/skills/PAI/USER/SKILLCUSTOMIZATIONS/OSINT/PREFERENCES.md` override defaults.
- Apify actors via `~/.opencode/skills/Apify/` are used when present.
- Memory/context loading from `~/.opencode/skills/PAI/SKILL.md` runs first if the file exists.

If those paths don't exist, ignore them. The skill is fully functional standalone.

---

## Quick-start example

User: *"Look into Jason Gurash at Avenir Senior Living for me — B2B prospect, infrastructure consulting angle."*

Your turn 1 (don't dossier yet):

> Setting up a B2B account intel investigation. Routing to `workflows/b2b-account.md`. Depth: Standard (~20 min). Disambiguation target: Jason Gurash, VP Operations, Avenir Senior Living. I'll confirm that match before reporting any details about him personally. Scope: public sources for sales discovery — corporate site, LinkedIn, news, tech footprint. I'll skip personal-life angles since they're not relevant to the consulting use case. Starting now.

Then run the workflow. Then produce the dossier with grades.
