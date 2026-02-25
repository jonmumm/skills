#!/bin/bash
set -euo pipefail

# ─── CONFIG (customize these) ─────────────────────────────────────────────────

# Context files: built below from project root (only existing files).
# Prompt: if AGENTS.md is missing, agent runs create-agents-md skill first.

# The prompt sent each iteration. Customize project name, backlog source,
# and feedback commands.
PROMPT='You are working on [PROJECT NAME].

0. If AGENTS.md does NOT exist in the project root, use the create-agents-md skill to create it (fill placeholders from the project), then output <promise>AGENTS_CREATED</promise> and stop. Otherwise continue with step 1.

1. Read .ralph/progress.md for context on what was recently done.
   Read .ralph/lessons.md for patterns and rules to follow.
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
9. Append progress to .ralph/progress.md.
   If anything went wrong or a lesson was learned, append to .ralph/lessons.md.
10. Commit with a descriptive message.

ONLY WORK ON A SINGLE TASK.
If all tasks are done, output <promise>COMPLETE</promise>.

If you cannot proceed (env broken, deps fail, missing credentials, tool broken), output <promise>BLOCKED:brief reason</promise> and stop.
If you need a human decision (architecture choice, unclear requirement), output <promise>DECIDE:question (Option A vs B)</promise> and stop.'

# ─── SCRIPT (no edits needed below) ───────────────────────────────────────────

PROJECT_ROOT=""
ITERATIONS=""
AGENT_RUNTIME="${AGENT_RUNTIME:-codex}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project)
      PROJECT_ROOT="$2"
      shift 2
      ;;
    --iterations)
      ITERATIONS="$2"
      shift 2
      ;;
    --agent)
      AGENT_RUNTIME="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1"
      echo "Usage: $0 --project /abs/path/to/repo --iterations N [--agent codex|claude]"
      exit 1
      ;;
  esac
done

if [[ -z "$PROJECT_ROOT" || -z "$ITERATIONS" ]]; then
  echo "Usage: $0 --project /abs/path/to/repo --iterations N [--agent codex|claude]"
  exit 1
fi

if [[ ! -d "$PROJECT_ROOT" ]]; then
  echo "Project path does not exist: $PROJECT_ROOT"
  exit 1
fi

PROJECT_ROOT="$(cd "$PROJECT_ROOT" && pwd)"
RALPH_DIR="$PROJECT_ROOT/.ralph"
MAX="$ITERATIONS"

mkdir -p "$RALPH_DIR"

# Ensure .ralph/ is in .gitignore so working files are not committed
GITIGNORE="$PROJECT_ROOT/.gitignore"
if [[ -f "$GITIGNORE" ]] && ! grep -q '^\.ralph/$' "$GITIGNORE" 2>/dev/null; then
  echo "" >> "$GITIGNORE"
  echo "# Ralph working files (progress, lessons, dogfood artifacts)" >> "$GITIGNORE"
  echo ".ralph/" >> "$GITIGNORE"
fi

# Build context files from project root (only existing files)
CONTEXT_FILES=""
for f in AGENTS.md .ralph/progress.md .ralph/lessons.md; do
  if [[ -f "$PROJECT_ROOT/$f" ]]; then
    CONTEXT_FILES="$CONTEXT_FILES @$f"
  fi
done
CONTEXT_FILES="${CONTEXT_FILES# }"

if [[ "$AGENT_RUNTIME" == "claude" ]]; then
  AGENT_CMD=(claude -p --dangerously-skip-permissions)
else
  AGENT_CMD=(codex exec -C "$PROJECT_ROOT" --dangerously-bypass-approvals-and-sandbox)
fi

for ((i=1; i<=MAX; i++)); do
  echo ""
  echo "===================================================================="
  echo "-- Ralph iteration $i of $MAX - $(date '+%Y-%m-%d %H:%M:%S')"
  echo "===================================================================="
  echo ""

  if [[ "$AGENT_RUNTIME" == "claude" ]]; then
    result="$(cd "$PROJECT_ROOT" && ${AGENT_CMD[@]} $CONTEXT_FILES "$PROMPT")"
  else
    result="$("${AGENT_CMD[@]}" "$PROMPT")"
  fi

  echo "$result"

  if [[ "$result" == *"<promise>COMPLETE</promise>"* ]]; then
    echo ""
    echo "OK All tasks complete after $i iteration(s)."
    exit 0
  fi
  if [[ "$result" == *"<promise>AGENTS_CREATED</promise>"* ]]; then
    echo ""
    echo "OK AGENTS.md was created. Run this script again to start the task loop."
    exit 0
  fi
  if [[ "$result" =~ \<promise\>BLOCKED:[^\<]*\</promise\> ]]; then
    echo ""
    echo "BLOCKED: Agent needs help. Check output above for reason. Fix and re-run."
    exit 2
  fi
  if [[ "$result" =~ \<promise\>DECIDE:[^\<]*\</promise\> ]]; then
    echo ""
    echo "DECIDE: Agent needs your decision. Check output above. Reply and re-run."
    exit 3
  fi
done

echo ""
echo "WARNING: Reached max iterations ($MAX). Check .ralph/progress.md for status."
