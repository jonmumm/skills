#!/bin/bash
set -e

# ─── CONFIG (customize these) ─────────────────────────────────────────────────

# Agent runtime command. Examples:
#   "codex --approval-mode full-auto -q"          (Codex, full auto — default)
#   "claude -p --dangerously-skip-permissions"   (Claude Code, full auto)
#   "claude -p --permission-mode acceptEdits"     (Claude Code, semi auto)
AGENT_CMD="codex --approval-mode full-auto -q"

# Context files to pass to the agent (space-separated, @-prefixed)
CONTEXT_FILES="@AGENTS.md @progress.md @lessons.md"

# The prompt sent each iteration. Customize project name, backlog source,
# and feedback commands.
PROMPT='You are working on [PROJECT NAME].

1. Read progress.md for context on what was recently done.
   Read lessons.md for patterns and rules to follow.
2. Check [BACKLOG SOURCE] for the highest-priority unfinished task.
   Prioritize: architectural work > integrations > unknowns > features > polish.
3. Mark the task in-progress.
4. Implement using TDD red-green-refactor (one test at a time).
5. Run ALL feedback loops:
   - [TYPECHECK COMMAND]
   - [LINT COMMAND]
   - [TEST COMMAND]
6. Verify: pause and ask "Would a staff engineer approve this?"
   - Is the change as simple as possible?
   - Does it only touch what is necessary?
   - Is it a root-cause fix, not a workaround?
   If not, refactor before proceeding.
7. Run mutation testing: [MUTATION COMMAND]
   Kill any survivors on files you changed.
   Repeat until mutation score >= 95% on touched files.
8. Mark the task done.
9. Append progress to progress.md.
   If anything went wrong or a lesson was learned, append to lessons.md.
10. Commit with a descriptive message.

ONLY WORK ON A SINGLE TASK.
If all tasks are done, output <promise>COMPLETE</promise>.'

# ─── SCRIPT (no edits needed below) ───────────────────────────────────────────

if [ -z "$1" ]; then
  echo "Usage: $0 <iterations>"
  echo "  Runs the Ralph TDD loop for N iterations (one task per iteration)."
  echo "  Typically run AFK. Stops early if the agent outputs <promise>COMPLETE</promise>."
  exit 1
fi

MAX=$1

for ((i=1; i<=MAX; i++)); do
  echo ""
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║  Ralph iteration $i of $MAX — $(date '+%Y-%m-%d %H:%M:%S')  "
  echo "╚══════════════════════════════════════════════════════════════╝"
  echo ""

  result=$($AGENT_CMD $CONTEXT_FILES "$PROMPT")

  echo "$result"

  if [[ "$result" == *"<promise>COMPLETE</promise>"* ]]; then
    echo ""
    echo "✓ All tasks complete after $i iteration(s)."
    exit 0
  fi
done

echo ""
echo "⚠ Reached max iterations ($MAX). Check progress.md for status."
