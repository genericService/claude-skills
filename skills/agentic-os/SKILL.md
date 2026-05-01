---
name: agentic-os
description: Framework-agnostic persistent memory and self-improvement loops for AI agents. Scaffolds shared state, task queues, and learnings files that can be read/written by Claude, Gemini, and Antigravity. Use this to initialize an Agentic OS layer in any workspace and instruct agents on how to use it.
version: 1.1.0
---

# Agentic OS

This skill establishes a framework-agnostic Agentic Operating System layer in a project workspace. It enables Claude, Gemini, and Antigravity to share persistent operational memory, coordinate via task queues, and continuously improve through structured feedback loops.

## The Core Concept

An Agentic OS solves the "blank slate" problem. Without it, every agent session starts fresh, requiring manual context loading and repeating past mistakes. By centralizing state and learnings into an `.agent/` directory, any agent runtime can pick up exactly where the last one left off and apply compounded knowledge.

## Initialization

To set up the Agentic OS scaffolding in a new project, run:

```bash
bash ~/.agents/skills/agentic-os/scripts/init-os.sh
```

This creates the following structure at the root of the project:
```
.agent/
  ├── state/
  │   ├── last-run.json      # Global log of the last agent actions
  │   ├── tasks.json         # Shared queue of pending/completed tasks
  │   ├── errors.json        # Log of unresolved task failures
  │   └── status.md          # Output of the command-center skill
  ├── learnings/             # Per-skill feedback loops
  │   └── template.json
  └── evals/                 # Per-skill evaluation criteria
      └── template.json
```

## Agent Directives

Whenever you operate in a project that has an `.agent/` directory, you MUST adhere to the following workflow:

### 1. Pre-Task: Load State & Learnings
Before executing a specialized task or skill:
- **Read State**: Check `.agent/state/last-run.json` to understand what was recently completed. Check `.agent/state/tasks.json` if you need to pull a task from the queue.
- **Read Learnings**: If you are about to perform a specific skill (e.g., `write-draft`), check if `.agent/learnings/write-draft.json` exists. If it does, read it and explicitly apply its `rule_change` entries to your approach.
- **Read Evals**: Check if `.agent/evals/<skill>.json` exists to understand the definition of "done".

### 2. Execution & Evaluation (The Learnings Loop)
After generating your output but *before* finalizing:
- If an `eval.json` exists for your task, grade your own output against its criteria. (Use `python3 ~/.agents/skills/agentic-os/scripts/eval.py list --skill <skill>`)
- If you fail any criteria, revise your output.
- Once you pass, log your verification using `python3 ~/.agents/skills/agentic-os/scripts/eval.py verify --skill <skill> --task-id <id> --notes "..."`
- Consider what worked well and what didn't during generation.

### 3. Post-Task: Write State & Learnings
Before you conclude your session or step:
- **Update Learnings**: If you learned something new about how to do this task better in this specific project, use `python3 ~/.agents/skills/agentic-os/scripts/learn.py add --skill <skill> --worked "..." --didnt "..." --rule "..."` to record it.
- **Update State**: Overwrite `.agent/state/last-run.json` with a summary of what you just did, what decisions you made, and what needs to happen next.
- **Update Queue**: If you completed a task from `tasks.json`, mark its status as `completed`.

---

## Data Schemas

### `last-run.json`
Used for operational continuity.
```json
{
  "timestamp": "2026-04-25T12:00:00Z",
  "task_id": "task-123",
  "status": "completed",
  "description": "Built the new Hero component.",
  "assigned_skill": "build-component",
  "project_id": "generic-service",
  "agent_id": "antigravity",
  "user_id": "matthias",
  "outcome": {
    "result": "Success"
  },
  "trace_id": "req-12345",
  "decision_log": "Used standard Tailwind utility classes instead of custom CSS for faster rendering",
  "external_receipts": [
    {
      "action": "Vercel Preview Deployment",
      "receipt_hash": "sha256-1a2b3c..."
    }
  ]
}
```

### `errors.json`
Used by the `command-center` skill to track unresolved failures.
```json
[
  {
    "timestamp": "2026-04-25T12:05:00Z",
    "task_id": "task-124",
    "assigned_skill": "osint",
    "reason": "Target API returned 429 Too Many Requests after 3 retries",
    "trace_id": "req-12346",
    "decision_log": "Attempted to backoff but exceeded max wait time.",
    "resolved": false
  }
]
```

### `learnings.json` (per skill)
Used to permanently correct agent behavior without modifying the base skill prompt.
```json
{
  "skill": "build-component",
  "history": [
    {
      "date": "2026-04-21",
      "what_worked": "Extracting the SVG into a separate file kept the component clean.",
      "what_didnt": "Trying to use Next.js Image for inline SVGs caused layout shifts.",
      "rule_change": "Always put complex SVGs in a separate .tsx file and import as a React component. Do not use next/image for vectors."
    }
  ]
}
```

### `eval.json` (per skill)
Used to define rigid quality gates.
```json
{
  "skill": "build-component",
  "criteria": [
    "Component must be responsive down to 320px",
    "Must not use inline styles",
    "Must be exported as a default export"
  ]
}
```
