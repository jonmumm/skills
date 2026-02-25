#!/bin/bash
set -euo pipefail

# Ralph Dogfooding loop template
#
# Usage:
#   ./ralph-dogfooding.sh --project /abs/path/to/repo --iterations 5 [--url https://staging.example.com]
#
# Example:
#   ./ralph-dogfooding.sh --project /Users/me/src/my-app --iterations 5 --url https://staging.example.com

PROJECT_ROOT=""
ITERATIONS=""
TARGET_URL="https://staging.example.com"
LINEAR_TEAM_KEY="${LINEAR_TEAM_KEY:-THE}"

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
    --url)
      TARGET_URL="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1"
      echo "Usage: $0 --project /abs/path/to/repo --iterations N [--url https://staging.example.com]"
      exit 1
      ;;
  esac
done

if [[ -z "$PROJECT_ROOT" || -z "$ITERATIONS" ]]; then
  echo "Usage: $0 --project /abs/path/to/repo --iterations N [--url https://staging.example.com]"
  exit 1
fi

if [[ ! -d "$PROJECT_ROOT" ]]; then
  echo "Project path does not exist: $PROJECT_ROOT"
  exit 1
fi

PROJECT_ROOT="$(cd "$PROJECT_ROOT" && pwd)"
RALPH_DIR="$PROJECT_ROOT/.ralph"
PROGRESS_FILE="$RALPH_DIR/dogfood-progress.md"
ARTIFACTS_ROOT="$RALPH_DIR/dogfood-artifacts"
AGENT_CMD=(codex exec -C "$PROJECT_ROOT" --dangerously-bypass-approvals-and-sandbox)

mkdir -p "$RALPH_DIR"

# Ensure .ralph/ is in .gitignore so working files are not committed
GITIGNORE="$PROJECT_ROOT/.gitignore"
if [[ -f "$GITIGNORE" ]] && ! grep -q '^\.ralph/$' "$GITIGNORE" 2>/dev/null; then
  echo "" >> "$GITIGNORE"
  echo "# Ralph working files (progress, lessons, dogfood artifacts)" >> "$GITIGNORE"
  echo ".ralph/" >> "$GITIGNORE"
fi

build_prompt() {
  local iter="$1"
  echo "You are running dogfooding for project root: $PROJECT_ROOT.

Target URL: $TARGET_URL
Linear Team: $LINEAR_TEAM_KEY
Current iteration: $iter (save artifacts under $ARTIFACTS_ROOT/iteration-$iter/).

0. If AGENTS.md does NOT exist in the project root, use the create-agents-md skill to create it, then output <promise>AGENTS_CREATED</promise> and stop. Otherwise continue with step 1.

1. Read AGENTS.md, .ralph/lessons.md, and .ralph/dogfood-progress.md.
2. Use the linear-cli skill to list non-complete issues in team $LINEAR_TEAM_KEY (dedupe first).
3. Dogfood core paths: /, /login, /onboarding/setup, /onboarding/checkout, /profile-select.
4. Capture evidence:
   - Save screenshots under: $ARTIFACTS_ROOT/iteration-$iter/THE-<id-or-new>/
   - Capture short video where supported; otherwise capture screenshot sequence.
5. For each confirmed bug:
   - Create/update Linear issue with reproducible steps and expected vs actual.
   - Use the linear-cli skill; include artifact paths in issue body or comments; attach files via CLI if supported.
6. Append concise entry to .ralph/dogfood-progress.md with tested routes, issue IDs, and artifact paths.
7. If there are no new findings and no issue updates, output <promise>NO_NEW_FINDINGS</promise>.

If you cannot proceed (browser/tool broken, auth failed, env issue), output <promise>BLOCKED:brief reason</promise> and stop.
If you need a human decision, output <promise>DECIDE:question</promise> and stop.
"
}
MAX="$ITERATIONS"
mkdir -p "$ARTIFACTS_ROOT"

if [ ! -f "$PROGRESS_FILE" ]; then
  cat > "$PROGRESS_FILE" <<'MD'
# Dogfood Progress

Autonomous dogfooding log. One entry per iteration.
MD
fi

for ((i=1; i<=MAX; i++)); do
  mkdir -p "$ARTIFACTS_ROOT/iteration-$i"

  echo ""
  echo "===================================================================="
  echo "-- Ralph dogfooding iteration $i of $MAX - $(date '+%Y-%m-%d %H:%M:%S')"
  echo "===================================================================="
  echo ""

  result="$("${AGENT_CMD[@]}" "$(build_prompt "$i")")"
  echo "$result"

  if [[ "$result" == *"<promise>NO_NEW_FINDINGS</promise>"* ]]; then
    echo ""
    echo "OK No new findings after $i iteration(s)."
    exit 0
  fi
  if [[ "$result" == *"<promise>AGENTS_CREATED</promise>"* ]]; then
    echo ""
    echo "OK AGENTS.md was created. Run this script again to start dogfooding."
    exit 0
  fi
  if [[ "$result" =~ \<promise\>BLOCKED:[^\<]*\</promise\> ]]; then
    echo ""
    echo "BLOCKED: Agent needs help. Check output above. Fix and re-run."
    exit 2
  fi
  if [[ "$result" =~ \<promise\>DECIDE:[^\<]*\</promise\> ]]; then
    echo ""
    echo "DECIDE: Agent needs your decision. Check output above. Reply and re-run."
    exit 3
  fi
done

echo ""
echo "WARNING: Reached max iterations ($MAX). Review $PROGRESS_FILE and Linear."
