#!/usr/bin/env python3

import json
import os
import sys
import uuid
from datetime import datetime, timezone
import subprocess
import argparse

def get_project_root():
    try:
        root = subprocess.check_output(['git', 'rev-parse', '--show-toplevel'], stderr=subprocess.DEVNULL).decode('utf-8').strip()
        return root
    except Exception:
        return os.getcwd()

AGENT_DIR = os.path.join(get_project_root(), '.agent')
STATE_DIR = os.path.join(AGENT_DIR, 'state')
TASKS_FILE = os.path.join(STATE_DIR, 'tasks.json')
LAST_RUN_FILE = os.path.join(STATE_DIR, 'last-run.json')
ERRORS_FILE = os.path.join(STATE_DIR, 'errors.json')

EXIT_NO_TASK = 0           # legacy "no pending tasks" — keep as 0 for back-compat
EXIT_QUEUE_DRAINED = 10    # scoped queue has no ready items left
EXIT_NEEDS_SCOPE = 11      # extensions exist but caller did not pass --scope
EXIT_STALE_IN_PROGRESS = 12 # in_progress items exist from prior session
EXIT_BLOCKED = 13          # caller asked to pop a blocked item
EXIT_INVALID_SCOPE = 14    # --scope path does not resolve to a list-of-dicts

def ensure_dirs():
    os.makedirs(STATE_DIR, exist_ok=True)

def load_tasks():
    if not os.path.exists(TASKS_FILE):
        return {"pending": [], "in_progress": [], "completed": [], "failed": []}
    with open(TASKS_FILE, 'r') as f:
        data = json.load(f)
        if "failed" not in data:
            data["failed"] = []
        return data

def save_tasks(tasks):
    with open(TASKS_FILE, 'w') as f:
        json.dump(tasks, f, indent=2)

def log_error(task, reason, trace_id=None, decision_log=None):
    if not os.path.exists(ERRORS_FILE):
        errors = []
    else:
        try:
            with open(ERRORS_FILE, 'r') as f:
                errors = json.load(f)
        except json.JSONDecodeError:
            errors = []

    error_entry = {
        "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
        "task_id": task.get("id") or task.get("task_id"),
        "assigned_skill": task.get("assigned_skill"),
        "reason": reason,
        "trace_id": trace_id,
        "decision_log": decision_log,
        "resolved": False
    }
    errors.append(error_entry)
    with open(ERRORS_FILE, 'w') as f:
        json.dump(errors, f, indent=2)

def log_last_run(task, status, outcome_details=None, trace_id=None, decision_log=None, scope=None):
    log_entry = {
        "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
        "task_id": task.get("id") or task.get("task_id"),
        "status": status,
        "description": task.get("description"),
        "assigned_skill": task.get("assigned_skill"),
        "project_id": task.get("project_id"),
        "agent_id": task.get("agent_id"),
        "user_id": task.get("user_id"),
        "scope": scope,
        "outcome": outcome_details or {},
        "trace_id": trace_id,
        "decision_log": decision_log
    }
    with open(LAST_RUN_FILE, 'w') as f:
        json.dump(log_entry, f, indent=2)

def list_extension_queues(tasks):
    """Discover dotted paths to *poppable* queues inside `_<name>_extension.*` blocks.

    A queue is a list-of-dicts where every item has a `task_id` key. Metadata
    lists (ag_pushed_branches, ag_uncommitted_*) and blocker lists (blocked_on_*)
    are not poppable and are filtered out so they don't surface as scopes.
    """
    out = []
    for top_key, top_val in tasks.items():
        if not (top_key.startswith("_") and top_key.endswith("_extension")):
            continue
        if not isinstance(top_val, dict):
            continue
        for sub_key, sub_val in top_val.items():
            if sub_key.startswith("blocked_on_"):
                continue
            if not (isinstance(sub_val, list) and sub_val):
                continue
            if not all(isinstance(x, dict) and "task_id" in x for x in sub_val):
                continue
            out.append(f"{top_key}.{sub_key}")
    return out

def resolve_scope(tasks, scope_path):
    """Walk a dotted path. Returns (parent_dict, leaf_key, leaf_list) or None."""
    parts = scope_path.split(".")
    if len(parts) < 2:
        return None
    cursor = tasks
    for p in parts[:-1]:
        if not isinstance(cursor, dict) or p not in cursor:
            return None
        cursor = cursor[p]
    leaf_key = parts[-1]
    if not isinstance(cursor, dict) or leaf_key not in cursor:
        return None
    leaf_list = cursor[leaf_key]
    if not isinstance(leaf_list, list):
        return None
    return cursor, leaf_key, leaf_list

def collect_blocked_ids(tasks):
    """Pull every issue / task_id mentioned in any `blocked_on_*` array of any extension."""
    blocked_issues = set()
    blocked_task_ids = set()
    for top_key, top_val in tasks.items():
        if not (top_key.startswith("_") and top_key.endswith("_extension")):
            continue
        if not isinstance(top_val, dict):
            continue
        for sub_key, sub_val in top_val.items():
            if not sub_key.startswith("blocked_on_"):
                continue
            if not isinstance(sub_val, list):
                continue
            for entry in sub_val:
                if not isinstance(entry, dict):
                    continue
                for n in entry.get("issues") or []:
                    blocked_issues.add(n)
                if entry.get("issue") is not None:
                    blocked_issues.add(entry["issue"])
                if entry.get("task_id"):
                    blocked_task_ids.add(entry["task_id"])
    return blocked_issues, blocked_task_ids

def warn_stale_in_progress(tasks):
    stale = tasks.get("in_progress", [])
    if not stale:
        return False
    print("Stale in_progress items from a prior session:", file=sys.stderr)
    for t in stale:
        tid = t.get("id") or t.get("task_id") or "?"
        desc = t.get("description") or ""
        print(f"  - {tid}: {desc}", file=sys.stderr)
    print("\nResolve with one of:", file=sys.stderr)
    print("  heartbeat clear-stale     # move all back to pending", file=sys.stderr)
    print("  heartbeat pop --accept-stale   # adopt and proceed", file=sys.stderr)
    return True

def add_task(priority, assigned_skill, description, project_id=None, agent_id=None, user_id=None):
    ensure_dirs()
    tasks = load_tasks()
    task = {
        "id": f"task-{str(uuid.uuid4())[:8]}",
        "priority": priority,
        "description": description,
        "assigned_skill": assigned_skill,
        "project_id": project_id,
        "agent_id": agent_id,
        "user_id": user_id,
        "created_at": datetime.now(timezone.utc).isoformat() + "Z",
        "completed_at": None
    }
    tasks["pending"].append(task)
    priority_map = {"high": 0, "medium": 1, "low": 2}
    tasks["pending"].sort(key=lambda x: priority_map.get(x.get("priority", "medium"), 1))
    save_tasks(tasks)
    print(f"Added task {task['id']}")
    return task

def pop_task(scope=None, accept_stale=False):
    """Pop next task. Honors `_*_extension` queues, blocker lists, and stale in_progress.

    Modes:
      - scope=None, no extensions present  → legacy: pop pending[0]
      - scope=None, extensions present     → refuse with EXIT_NEEDS_SCOPE
      - scope=path                         → pop first ready item from the resolved queue,
                                             skipping anything in any `blocked_on_*` array
    """
    ensure_dirs()
    tasks = load_tasks()

    if not accept_stale and warn_stale_in_progress(tasks):
        sys.exit(EXIT_STALE_IN_PROGRESS)

    extensions = list_extension_queues(tasks)

    if scope is None:
        if extensions:
            print("This project has explicit batch queues. Pass --scope to pop from one:", file=sys.stderr)
            for path in extensions:
                print(f"  --scope {path}", file=sys.stderr)
            print("\nDo not pop from `pending` while a scoped queue is active.", file=sys.stderr)
            sys.exit(EXIT_NEEDS_SCOPE)
        if not tasks.get("pending"):
            print("No pending tasks.")
            return None
        task = tasks["pending"].pop(0)
        tasks["in_progress"].append(task)
        save_tasks(tasks)
        print(json.dumps(task, indent=2))
        return task

    resolved = resolve_scope(tasks, scope)
    if resolved is None:
        print(f"--scope {scope!r} did not resolve to a list-of-dicts in tasks.json.", file=sys.stderr)
        if extensions:
            print("Available scoped queues:", file=sys.stderr)
            for path in extensions:
                print(f"  {path}", file=sys.stderr)
        sys.exit(EXIT_INVALID_SCOPE)

    parent_dict, leaf_key, queue = resolved
    blocked_issues, blocked_task_ids = collect_blocked_ids(tasks)

    next_idx = None
    for i, item in enumerate(queue):
        status = item.get("status", "ready")
        if status != "ready":
            continue
        gh = item.get("gh_issue")
        tid = item.get("task_id")
        if gh in blocked_issues or tid in blocked_task_ids:
            print(
                f"Skipping {tid or f'#{gh}'}: appears in a blocked_on_* list. "
                "Resolve the blocker before popping.",
                file=sys.stderr,
            )
            continue
        next_idx = i
        break

    if next_idx is None:
        print(f"Queue {scope} is drained. No ready items left.", file=sys.stderr)
        print("Per AGENTS.md § Agentic OS Operating Discipline rule 4:", file=sys.stderr)
        print("  - Fill the matching evidence-report.md", file=sys.stderr)
        print("  - Update .agent/state/last-run.json", file=sys.stderr)
        print("  - STOP. Do not look for more work in `pending`.", file=sys.stderr)
        sys.exit(EXIT_QUEUE_DRAINED)

    item = queue[next_idx]
    item["status"] = "in_progress"
    item["started_at"] = datetime.now(timezone.utc).isoformat() + "Z"
    save_tasks(tasks)
    print(json.dumps({"scope": scope, "index": next_idx, "item": item}, indent=2))
    return item

def complete_task(task_id, status="completed", outcome=None, trace_id=None, decision_log=None, scope=None):
    ensure_dirs()
    tasks = load_tasks()

    if scope:
        resolved = resolve_scope(tasks, scope)
        if resolved is None:
            print(f"--scope {scope!r} did not resolve.", file=sys.stderr)
            sys.exit(EXIT_INVALID_SCOPE)
        _, _, queue = resolved
        for item in queue:
            if item.get("task_id") == task_id or item.get("id") == task_id:
                item["status"] = status
                item["completed_at"] = datetime.now(timezone.utc).isoformat() + "Z"
                if outcome:
                    item["outcome"] = outcome
                save_tasks(tasks)
                log_last_run(item, status, outcome, trace_id, decision_log, scope=scope)
                if status == "failed":
                    log_error(item, (outcome or {}).get("reason", "Unknown"), trace_id, decision_log)
                print(f"Marked {task_id} as {status} in {scope}.")
                return
        print(f"Task {task_id} not found in scope {scope}.", file=sys.stderr)
        return

    task_idx = None
    for i, t in enumerate(tasks.get("in_progress", [])):
        if t.get("id") == task_id:
            task_idx = i
            break

    if task_idx is None:
        print(f"Task {task_id} not found in in_progress.")
        return

    task = tasks["in_progress"].pop(task_idx)
    task["completed_at"] = datetime.now(timezone.utc).isoformat() + "Z"

    if status == "completed":
        tasks["completed"].append(task)
    else:
        tasks["failed"].append(task)
        reason = outcome.get("reason", "Unknown failure") if outcome else "Unknown failure"
        log_error(task, reason, trace_id, decision_log)

    save_tasks(tasks)
    log_last_run(task, status, outcome, trace_id, decision_log)
    print(f"Marked task {task_id} as {status}.")

def list_tasks(scope=None):
    ensure_dirs()
    tasks = load_tasks()
    if scope:
        resolved = resolve_scope(tasks, scope)
        if resolved is None:
            print(f"--scope {scope!r} did not resolve.", file=sys.stderr)
            sys.exit(EXIT_INVALID_SCOPE)
        _, _, queue = resolved
        print(json.dumps(queue, indent=2))
        return
    print(json.dumps(tasks, indent=2))

def list_scopes_cmd():
    ensure_dirs()
    tasks = load_tasks()
    scopes = list_extension_queues(tasks)
    if not scopes:
        print("No `_*_extension.*` queues in tasks.json.")
        return
    for s in scopes:
        resolved = resolve_scope(tasks, s)
        if not resolved:
            continue
        _, _, queue = resolved
        ready = sum(1 for x in queue if x.get("status", "ready") == "ready")
        in_prog = sum(1 for x in queue if x.get("status") == "in_progress")
        done = sum(1 for x in queue if x.get("status") == "completed")
        print(f"{s}  ({ready} ready / {in_prog} in_progress / {done} completed / {len(queue)} total)")

def clear_stale_cmd():
    ensure_dirs()
    tasks = load_tasks()
    stale = tasks.get("in_progress", [])
    if not stale:
        print("No in_progress items to clear.")
        return
    moved = []
    for t in stale:
        moved.append(t.get("id") or t.get("task_id") or "?")
    tasks["pending"] = stale + tasks.get("pending", [])
    tasks["in_progress"] = []
    save_tasks(tasks)
    print(f"Moved {len(moved)} item(s) back to pending: {', '.join(moved)}")

def main():
    parser = argparse.ArgumentParser(description="Heartbeat Orchestrator - Task Queue Manager")
    subparsers = parser.add_subparsers(dest="command", required=True)

    add_parser = subparsers.add_parser("add", help="Add a new task to the legacy `pending` queue")
    add_parser.add_argument("--priority", choices=["high", "medium", "low"], default="medium")
    add_parser.add_argument("--skill", required=True, help="Assigned skill")
    add_parser.add_argument("--project-id", help="Optional project ID for memory scoping")
    add_parser.add_argument("--agent-id", help="Optional agent ID for memory scoping")
    add_parser.add_argument("--user-id", help="Optional user ID for memory scoping")
    add_parser.add_argument("description", help="Task description")

    pop_parser = subparsers.add_parser("pop", help="Pop the next task. Honors --scope, blocker lists, and stale in_progress.")
    pop_parser.add_argument("--scope", help="Dotted path to a queue, e.g. _round3_extension.ag_implementation_queue")
    pop_parser.add_argument("--accept-stale", action="store_true", help="Adopt prior-session in_progress items instead of refusing")

    complete_parser = subparsers.add_parser("complete", help="Mark a task as completed")
    complete_parser.add_argument("task_id", help="Task ID (uuid `task-XXXX` for legacy, or queue item `task_id` when --scope is given)")
    complete_parser.add_argument("--scope", help="Dotted path to scope queue (matches what `pop --scope` used)")
    complete_parser.add_argument("--outcome", help="Optional outcome details (JSON string)")
    complete_parser.add_argument("--trace-id", help="Optional trace ID for observability")
    complete_parser.add_argument("--decision-log", help="Optional decision log for observability")

    fail_parser = subparsers.add_parser("fail", help="Mark a task as failed")
    fail_parser.add_argument("task_id", help="Task ID")
    fail_parser.add_argument("--scope", help="Dotted path to scope queue")
    fail_parser.add_argument("--reason", help="Optional failure reason")
    fail_parser.add_argument("--trace-id", help="Optional trace ID for observability")
    fail_parser.add_argument("--decision-log", help="Optional decision log for observability")

    list_parser = subparsers.add_parser("list", help="List tasks (whole tasks.json by default, or just a scoped queue)")
    list_parser.add_argument("--scope", help="Dotted path to a queue")

    subparsers.add_parser("scopes", help="List `_*_extension.*` queues with ready/in_progress/completed counts")

    subparsers.add_parser("clear-stale", help="Move any `in_progress` items back to `pending` (recovery from crashed sessions)")

    args = parser.parse_args()

    if args.command == "add":
        add_task(args.priority, args.skill, args.description, args.project_id, args.agent_id, args.user_id)
    elif args.command == "pop":
        pop_task(scope=args.scope, accept_stale=args.accept_stale)
    elif args.command == "complete":
        outcome = None
        if args.outcome:
            try:
                outcome = json.loads(args.outcome)
            except Exception:
                outcome = {"result": args.outcome}
        complete_task(args.task_id, "completed", outcome, args.trace_id, args.decision_log, scope=args.scope)
    elif args.command == "fail":
        outcome = {"reason": args.reason} if args.reason else {}
        complete_task(args.task_id, "failed", outcome, args.trace_id, args.decision_log, scope=args.scope)
    elif args.command == "list":
        list_tasks(scope=args.scope)
    elif args.command == "scopes":
        list_scopes_cmd()
    elif args.command == "clear-stale":
        clear_stale_cmd()

if __name__ == "__main__":
    main()
