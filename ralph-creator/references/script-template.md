# Script Template

Copy this template and replace all `{{PLACEHOLDERS}}`.

```bash
#!/bin/bash
set -e

# ─── CONFIG ──────────────────────────────────────────────────────────────────

AGENT_CMD="claude -p --dangerously-skip-permissions"

# Context files loaded via @ references.
# Include: spec docs, config, backlog, progress, lessons.
CONTEXT_FILES="@.ralph/backlog.md @.ralph/progress.md @.ralph/lessons.md {{ADDITIONAL_CONTEXT_FILES}}"

PROMPT='{{TASK_DESCRIPTION}}

## 1. Orient

Read the context files above:
- .ralph/backlog.md → task checklist (checked = done, unchecked = todo)
- .ralph/progress.md → what previous iterations accomplished
- .ralph/lessons.md → mistakes to avoid and patterns that work
{{ADDITIONAL_ORIENT_INSTRUCTIONS}}

## 2. Pick Task

Find the FIRST unchecked task (- [ ]) in .ralph/backlog.md.
If all tasks are checked, output <promise>COMPLETE</promise> and stop.

{{PRIORITY_GUIDANCE}}

## 3. Execute

{{EXECUTE_INSTRUCTIONS}}

## 4. Verify

After completing the work, verify before marking done:
{{VERIFY_INSTRUCTIONS}}

Do NOT mark a task done if verification fails. Fix it first.

## 5. Update Tracking

After verification passes:
- Mark the task done: change "- [ ]" to "- [x]" in .ralph/backlog.md
- Append to .ralph/progress.md:
  - Which task was completed
  - Key results or artifacts produced
  - Any issues encountered
- If anything went wrong or you learned something, append to .ralph/lessons.md

## Quality Bar

A task is DONE when:
{{QUALITY_CRITERIA}}

ONLY WORK ON A SINGLE TASK PER ITERATION.
If all tasks are done, output <promise>COMPLETE</promise>.'

# ─── SCRIPT (no edits needed below) ──────────────────────────────────────────

if [ -z "$1" ]; then
  echo "Usage: $0 <iterations>"
  echo "  Runs the {{NAME}} loop for N iterations."
  echo "  Stops early if all tasks are complete."
  exit 1
fi

MAX=$1

for ((i=1; i<=MAX; i++)); do
  echo ""
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║  {{NAME}} iteration $i of $MAX — $(date '+%Y-%m-%d %H:%M:%S')  "
  echo "╚══════════════════════════════════════════════════════════════╝"
  echo ""

  result=$($AGENT_CMD $CONTEXT_FILES "$PROMPT")

  echo "$result"

  if [[ "$result" == *"<promise>COMPLETE</promise>"* ]]; then
    echo ""
    echo "All tasks complete after $i iteration(s)."
    exit 0
  fi
done

echo ""
echo "Reached max iterations ($MAX). Check .ralph/backlog.md for remaining tasks."
```

## Placeholder Reference

| Placeholder | What to fill in |
|-------------|----------------|
| `{{TASK_DESCRIPTION}}` | One-line description of what this ralph loop does |
| `{{ADDITIONAL_CONTEXT_FILES}}` | Extra `@path/to/file` refs for specs, configs, etc. |
| `{{ADDITIONAL_ORIENT_INSTRUCTIONS}}` | Extra files to read and what they contain |
| `{{PRIORITY_GUIDANCE}}` | How to pick tasks when multiple are available |
| `{{EXECUTE_INSTRUCTIONS}}` | Step-by-step domain-specific work instructions |
| `{{VERIFY_INSTRUCTIONS}}` | How to confirm the task is actually done (feedback loop) |
| `{{QUALITY_CRITERIA}}` | Bullet list of measurable "done" conditions |
| `{{NAME}}` | Short name for the loop (used in output headers) |
