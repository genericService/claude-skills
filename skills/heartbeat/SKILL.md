---
name: heartbeat
version: 1.2.0
description: "Agentic OS Orchestrator. Process and execute tasks from the shared .agent/state/tasks.json queue. Use when the user asks to 'check the queue', 'process tasks', or run the heartbeat."
---

# Heartbeat Orchestrator

The Heartbeat skill acts as the background processor for the Agentic OS. It reads the `.agent/state/tasks.json` queue, identifies pending tasks, routes them to the appropriate skills, and updates the task status upon completion.

## How it works

Use the `heartbeat.py` script in this skill's `scripts/` directory to manage the queue:

1. **Discover scoped queues**: Run `heartbeat.py scopes` first if you don't know what to work on. It lists every poppable queue under `_<batch>_extension.<queue>` paths with ready/in-progress/completed counts.
2. **Pop Task**: Run `heartbeat.py pop` (legacy mode) or `heartbeat.py pop --scope _round3_extension.ag_implementation_queue` (scoped mode) to get the next task. **If `_*_extension` queues exist in `tasks.json`, pop without `--scope` will refuse with exit 11** — pass the matching `--scope`.
3. **Execute**: Read the task details and use the appropriate skill (e.g., `osint`, `deep-research`) to fulfill the task.
4. **Resilience & Retry**: If a task fails unexpectedly, autonomous agents MUST attempt to retry the task logic up to **two** times before formally failing.
5. **Complete/Fail**: Run `heartbeat.py complete <task_id> --scope <path> --outcome '{"result": "..."}'` (scoped) or `heartbeat.py complete <task_id> --outcome '...'` (legacy). Failing logs to `.agent/state/errors.json`.

Path varies by agent:
- Gemini / Antigravity: `python3 ~/.gemini/skills/heartbeat/scripts/heartbeat.py …`
- Claude: `python3 ~/.claude/skills/heartbeat/scripts/heartbeat.py …`

(Both paths resolve through symlinks to the same canonical script in `~/github/claude-skills`, so behavior is identical.)

## Scoped queues (added in 1.2.0)

When `tasks.json` contains a batch metadata block like `_round3_extension`, treat each list-of-dicts under it where every item has a `task_id` field as a *scoped queue*. The script enforces three rules from the project's AGENTS.md § Agentic OS Operating Discipline:

- **Honor explicit queues**: `pop` without `--scope` refuses (exit 11) when scoped queues exist. The broader `pending` list is off-limits while a scoped queue is active.
- **Skip blocked items**: any queue item whose `gh_issue` or `task_id` appears in any sibling `blocked_on_*` array is skipped automatically. The script tells you what was skipped and why.
- **Stop on drained queue**: when no `ready` items remain in the scoped queue, exit 10 with a reminder to fill the evidence report and stop, not trawl `pending`.

Example:

```bash
heartbeat.py scopes
# _round3_extension.ag_implementation_queue  (3 ready / 0 in_progress / 0 completed / 3 total)

heartbeat.py pop --scope _round3_extension.ag_implementation_queue
# pops the first ready item, marks status=in_progress in place

heartbeat.py complete round3-edit-item-33-southern-qualifier \
  --scope _round3_extension.ag_implementation_queue \
  --outcome '{"pr": 502, "merged": true}'
```

## Stale `in_progress` handling (added in 1.2.0)

If `tasks.json` has items in `in_progress` from a prior session that crashed or handed off, `pop` refuses with exit 12 and prints the stale items. Resolve with one of:

```bash
heartbeat.py clear-stale          # move them all back to pending
heartbeat.py pop --accept-stale --scope <path>   # adopt and proceed
```

This prevents a fresh agent from silently inheriting another session's half-finished work — a documented failure mode.

## Exit codes

| Code | Meaning |
|------|---------|
| 0    | Normal pop / no pending tasks (legacy back-compat) |
| 10   | Scoped queue is drained — fill evidence report and stop |
| 11   | Scopes exist but `--scope` was not passed — pick one |
| 12   | Stale `in_progress` items present — clear or `--accept-stale` |
| 13   | Caller asked to pop a blocked item directly (reserved) |
| 14   | `--scope` path did not resolve to a list-of-dicts |

Wrappers (heartbeat-runner shells, AG launch scripts) should branch on these — exit 10 means stop, exit 11/12 mean the operator needs to make a decision, exit 14 is a config bug.

## Task Format

`tasks.json` legacy shape (still supported):

```json
{
  "pending": [
    {
      "id": "task-123",
      "priority": "high",
      "description": "Deep research the current state of local LLM orchestration.",
      "assigned_skill": "deep-research",
      "project_id": "claude-skills",
      "agent_id": "antigravity",
      "user_id": "matthias",
      "created_at": "2026-04-25T12:00:00Z",
      "completed_at": null
    }
  ],
  "in_progress": [],
  "completed": [],
  "failed": []
}
```

Scoped-queue shape (alongside the legacy fields):

```json
{
  "pending": [...],
  "in_progress": [],
  "completed": [],
  "failed": [],
  "_round3_extension": {
    "ag_implementation_queue": [
      {
        "order": 1,
        "task_id": "round3-edit-item-33-southern-qualifier",
        "gh_issue": 496,
        "estimate": "frontmatter only on 2 providers; ~10 min",
        "risk": "minimal"
      }
    ],
    "blocked_on_client": [
      { "items": "Spanish PDFs", "issues": [390, 391], "blocker": "translator pending" }
    ]
  }
}
```

The script treats anything under `_*_extension` whose items all have `task_id` as a poppable queue. Keys starting with `blocked_on_` are filter inputs, not queues. Metadata lists like `ag_pushed_branches` (where items don't have `task_id`) are ignored by `scopes` discovery.

## Execution

When invoked (or automatically on agent startup), the Heartbeat should process one task at a time to maintain stability and context length, unless explicitly asked to drain the queue. **In a project with scoped queues, agents must pass `--scope` and respect the drained-queue stop signal — picking outside-queue work without authorization is the documented failure mode this version was written to prevent.**

## Agentic OS Integration

As a core OS component, this skill MUST log its own execution to `.agent/state/last-run.json`, noting which task was processed and what the outcome was. The 1.2.0 last-run schema adds a `scope` field so wrappers can tell scoped from legacy invocations.
