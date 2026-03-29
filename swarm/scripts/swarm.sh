#!/bin/bash
set -euo pipefail

# ─── swarm.sh ──────────────────────────────────────────────────────────────────
# Launches parallel AI agents in isolated Git worktrees to build features
# and continuously optimize code quality using hard metrics.
#
# Usage:
#   swarm.sh --project /path/to/repo --agents feature,crap,mutate \
#            [--agent claude] [--iterations 10]
# ───────────────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"

PROJECT_ROOT=""
AGENT_LIST="feature,crap,mutate"
MAX_ITERATIONS=10
AGENT_RUNTIME="${AGENT_RUNTIME:-claude}"
PIDS=()

# ─── Parse Arguments ──────────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project)     PROJECT_ROOT="$2"; shift 2 ;;
    --agents)      AGENT_LIST="$2"; shift 2 ;;
    --agent)       AGENT_RUNTIME="$2"; shift 2 ;;
    --iterations)  MAX_ITERATIONS="$2"; shift 2 ;;
    *)
      echo "Usage: $0 --project /path --agents feature,crap,mutate[,accept] [--agent claude|codex] [--iterations N]"
      exit 1
      ;;
  esac
done

if [[ -z "$PROJECT_ROOT" ]]; then
  echo "Usage: $0 --project /path --agents feature,crap,mutate[,accept] [--agent claude|codex] [--iterations N]"
  exit 1
fi

PROJECT_ROOT="$(cd "$PROJECT_ROOT" && pwd)"
SWARM_DIR="$PROJECT_ROOT/.swarm"
RUN_ID="$(date '+%Y-%m-%dT%H-%M')"
RUN_DIR="$SWARM_DIR/runs/$RUN_ID"

# ─── Detect Package Manager ──────────────────────────────────────────────────

detect_pm() {
  local dir="$1"
  if [[ -f "$dir/bun.lockb" || -f "$dir/bun.lock" ]]; then echo "bun"
  elif [[ -f "$dir/pnpm-lock.yaml" ]]; then echo "pnpm"
  elif [[ -f "$dir/yarn.lock" ]]; then echo "yarn"
  else echo "npm"
  fi
}

PM="$(detect_pm "$PROJECT_ROOT")"

pm_install() {
  local dir="$1"
  case "$PM" in
    bun)  (cd "$dir" && bun install --frozen-lockfile 2>/dev/null || bun install) ;;
    pnpm) (cd "$dir" && pnpm install --frozen-lockfile 2>/dev/null || pnpm install) ;;
    yarn) (cd "$dir" && yarn install --frozen-lockfile 2>/dev/null || yarn install) ;;
    npm)  (cd "$dir" && npm ci 2>/dev/null || npm install) ;;
  esac
}

pm_run() {
  echo "$PM run $1"
}

# ─── Detect Commands from package.json ────────────────────────────────────────

detect_cmd() {
  local script_name="$1"
  local pkg="$PROJECT_ROOT/package.json"
  if [[ -f "$pkg" ]] && grep -q "\"$script_name\"" "$pkg" 2>/dev/null; then
    echo "$(pm_run "$script_name")"
  else
    echo ""
  fi
}

# Try multiple script names, return first match
detect_cmd_any() {
  for name in "$@"; do
    local cmd
    cmd="$(detect_cmd "$name")"
    if [[ -n "$cmd" ]]; then
      echo "$cmd"
      return
    fi
  done
  echo ""
}

TEST_CMD="$(detect_cmd_any "test" "test:unit" "vitest")"
TYPECHECK_CMD="$(detect_cmd_any "typecheck" "type-check" "tsc")"
LINT_CMD="$(detect_cmd_any "lint" "biome" "eslint")"
COVERAGE_CMD="$(detect_cmd_any "test:coverage")"
MUTATE_CMD="$(detect_cmd_any "test:mutate:incremental" "test:mutate")"
E2E_CMD="$(detect_cmd_any "test:e2e" "e2e")"

# ─── Setup Directories ───────────────────────────────────────────────────────

mkdir -p "$RUN_DIR/logs"

# Create lessons.md if it doesn't exist (persists across runs)
if [[ ! -f "$SWARM_DIR/lessons.md" ]]; then
  echo "# Swarm Lessons" > "$SWARM_DIR/lessons.md"
  echo "" >> "$SWARM_DIR/lessons.md"
  echo "Patterns and mistakes learned across runs. Agents append here." >> "$SWARM_DIR/lessons.md"
  echo "" >> "$SWARM_DIR/lessons.md"
fi

# Initialize progress.md for this run
echo "# Swarm Progress — $RUN_ID" > "$RUN_DIR/progress.md"
echo "" >> "$RUN_DIR/progress.md"

# ─── Ensure .swarm/ in .gitignore ────────────────────────────────────────────

GITIGNORE="$PROJECT_ROOT/.gitignore"
if [[ -f "$GITIGNORE" ]] && ! grep -q '\.swarm/' "$GITIGNORE" 2>/dev/null; then
  echo "" >> "$GITIGNORE"
  echo "# Swarm agent worktrees and run data" >> "$GITIGNORE"
  echo ".swarm/" >> "$GITIGNORE"
fi

# ─── Cleanup Functions ─────────────────────────────────────────────────────────

clean_worktrees() {
  cd "$PROJECT_ROOT"
  # Remove worktrees
  for agent in feature crap mutate accept; do
    if [[ -d "$SWARM_DIR/$agent" ]]; then
      git worktree remove "$SWARM_DIR/$agent" --force 2>/dev/null || true
    fi
  done
  # Clean up branches
  for branch in swarm/feature swarm/crap swarm/mutate swarm/accept; do
    git branch -D "$branch" 2>/dev/null || true
  done
}

cleanup() {
  echo ""
  echo "════════════════════════════════════════════════════"
  echo "  Shutting down swarm..."
  echo "════════════════════════════════════════════════════"

  # Kill agent processes
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true

  # Generate report
  generate_report

  # Clean worktrees and branches
  clean_worktrees

  echo ""
  echo "Swarm stopped. Report: $RUN_DIR/report.md"
  echo "Progress: $RUN_DIR/progress.md"
  echo "Lessons: $SWARM_DIR/lessons.md"
}
trap cleanup EXIT

# Pre-cleanup zombie worktrees from crashed runs before starting
clean_worktrees

# ─── Report Generator ─────────────────────────────────────────────────────────

generate_report() {
  local report="$RUN_DIR/report.md"
  echo "# Swarm Report — $RUN_ID" > "$report"
  echo "" >> "$report"
  echo "## Run Configuration" >> "$report"
  echo "- Project: $PROJECT_ROOT" >> "$report"
  echo "- Agents: $AGENT_LIST" >> "$report"
  echo "- Runtime: $AGENT_RUNTIME" >> "$report"
  echo "- Package Manager: $PM" >> "$report"
  echo "- Max Iterations: $MAX_ITERATIONS" >> "$report"
  echo "" >> "$report"

  # Count outcomes from progress.md
  local completed blocked
  completed=$(grep -c '✅' "$RUN_DIR/progress.md" 2>/dev/null || echo "0")
  blocked=$(grep -c '⛔' "$RUN_DIR/progress.md" 2>/dev/null || echo "0")
  echo "## Summary" >> "$report"
  echo "- Completed iterations: $completed" >> "$report"
  echo "- Blocked iterations: $blocked" >> "$report"
  echo "" >> "$report"

  # Recent git log
  echo "## Commits" >> "$report"
  echo '```' >> "$report"
  (cd "$PROJECT_ROOT" && git log --oneline -20) >> "$report" 2>/dev/null || true
  echo '```' >> "$report"
  echo "" >> "$report"

  echo "## Full Progress" >> "$report"
  echo "" >> "$report"
  cat "$RUN_DIR/progress.md" >> "$report" 2>/dev/null || true
}

# ─── Agent Runner ─────────────────────────────────────────────────────────────

run_agent() {
  local name="$1"
  local worktree="$2"
  local branch="$3"
  local prompt="$4"
  local logfile="$RUN_DIR/logs/${name}.log"

  echo "[$name] Creating worktree at $worktree on branch $branch"
  cd "$PROJECT_ROOT"
  git worktree add "$worktree" -b "$branch" 2>/dev/null || {
    git worktree add "$worktree" "$branch" 2>/dev/null || true
  }

  # Install deps
  echo "[$name] Installing dependencies ($PM)..."
  pm_install "$worktree" 2>/dev/null || true

  local iteration=0
  while [[ $iteration -lt $MAX_ITERATIONS ]]; do
    iteration=$((iteration + 1))
    echo ""
    echo "[$name] ════════════════════════════════════════════════"
    echo "[$name] Iteration $iteration of $MAX_ITERATIONS — $(date '+%Y-%m-%d %H:%M:%S')"
    echo "[$name] ════════════════════════════════════════════════"

    # Run the agent
    local result
    if [[ "$AGENT_RUNTIME" == "claude" ]]; then
      result="$(cd "$worktree" && env -u CLAUDECODE claude -p --dangerously-skip-permissions "$prompt" 2>&1)" || true
    else
      result="$(cd "$worktree" && codex exec -C "$worktree" --dangerously-bypass-approvals-and-sandbox "$prompt" 2>&1)" || true
    fi

    echo "$result" | tee -a "$logfile"

    # Check signals
    if [[ "$result" == *"<promise>COMPLETE</promise>"* ]]; then
      echo "[$name] All tasks complete after $iteration iteration(s)."
      return 0
    fi

    if [[ "$result" == *"<promise>CLEAN</promise>"* ]]; then
      echo "[$name] Metrics converged. Codebase is clean."
      return 0
    fi

    if [[ "$result" == *"<promise>BLOCKED:"* ]]; then
      echo "[$name] BLOCKED. Check: $logfile"
      echo "[$name] Sleeping 5 minutes before retrying..."
      sleep 300
      continue
    fi

    if [[ "$result" == *"<promise>DECIDE:"* ]]; then
      echo "[$name] NEEDS HUMAN DECISION. Check: $logfile"
      echo "[$name] Sleeping 10 minutes before retrying..."
      sleep 600
      continue
    fi

    # Brief pause between iterations
    sleep 10
  done

  echo "[$name] Completed $MAX_ITERATIONS iterations."
}

# ─── Build Agent Prompts ──────────────────────────────────────────────────────

inject_vars() {
  local prompt="$1"
  prompt="${prompt//\{\{PM\}\}/$PM}"
  prompt="${prompt//\{\{TEST_CMD\}\}/$TEST_CMD}"
  prompt="${prompt//\{\{TYPECHECK_CMD\}\}/$TYPECHECK_CMD}"
  prompt="${prompt//\{\{LINT_CMD\}\}/$LINT_CMD}"
  prompt="${prompt//\{\{COVERAGE_CMD\}\}/$COVERAGE_CMD}"
  prompt="${prompt//\{\{MUTATE_CMD\}\}/$MUTATE_CMD}"
  prompt="${prompt//\{\{E2E_CMD\}\}/$E2E_CMD}"
  prompt="${prompt//\{\{SWARM_DIR\}\}/$SWARM_DIR}"
  prompt="${prompt//\{\{RUN_DIR\}\}/$RUN_DIR}"
  prompt="${prompt//\{\{CRAP_SCRIPT\}\}/$SKILL_DIR/scripts/crap4ts.mjs}"
  echo "$prompt"
}

# Read prompts dynamically from references/agent-prompts.md
PROMPTS_FILE="$SKILL_DIR/references/agent-prompts.md"

extract_prompt() {
  local agent_name="$1"
  if [[ ! -f "$PROMPTS_FILE" ]]; then
    echo "Error: Prompts file not found at $PROMPTS_FILE" >&2
    exit 1
  fi
  # Use awk to extract content between "## <Agent> Agent Prompt" and the next "---"
  awk -v agent="${agent_name} Agent Prompt" '
    $0 ~ "^## " agent { flag=1; next }
    $0 ~ "^---" && flag { flag=0; exit }
    flag { print }
  ' "$PROMPTS_FILE" | grep -v "^#\`\`\`" | sed -e 's/^```//' -e 's/```$//' | sed '/^$/d'
}

FEATURE_PROMPT="$(inject_vars "$(extract_prompt "Feature")")"
CRAP_PROMPT="$(inject_vars "$(extract_prompt "CRAP")")"
MUTATE_PROMPT="$(inject_vars "$(extract_prompt "Mutation")")"
ACCEPT_PROMPT="$(inject_vars "$(extract_prompt "Acceptance")")"

# ─── Launch ───────────────────────────────────────────────────────────────────

echo "╔══════════════════════════════════════════════════════╗"
echo "║                 SWARM DISPATCHER                    ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║  Project:     $PROJECT_ROOT"
echo "║  Agents:      $AGENT_LIST"
echo "║  Runtime:     $AGENT_RUNTIME"
echo "║  Pkg Manager: $PM"
echo "║  Iterations:  $MAX_ITERATIONS per agent"
echo "║  Run ID:      $RUN_ID"
echo "║  Run Dir:     $RUN_DIR"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "Commands detected:"
[[ -n "$TEST_CMD" ]] && echo "  Test:      $TEST_CMD"
[[ -n "$TYPECHECK_CMD" ]] && echo "  Typecheck: $TYPECHECK_CMD"
[[ -n "$LINT_CMD" ]] && echo "  Lint:      $LINT_CMD"
[[ -n "$COVERAGE_CMD" ]] && echo "  Coverage:  $COVERAGE_CMD"
[[ -n "$MUTATE_CMD" ]] && echo "  Mutate:    $MUTATE_CMD"
[[ -n "$E2E_CMD" ]] && echo "  E2E:       $E2E_CMD"
echo ""

IFS=',' read -ra AGENTS <<< "$AGENT_LIST"

for agent in "${AGENTS[@]}"; do
  case "$agent" in
    feature)
      run_agent "FEATURE" "$SWARM_DIR/feature" "swarm/feature" "$FEATURE_PROMPT" &
      PIDS+=($!)
      ;;
    crap)
      if [[ -z "$COVERAGE_CMD" ]]; then
        echo "WARNING: No coverage command detected. CRAP agent will likely BLOCK."
      fi
      run_agent "CRAP" "$SWARM_DIR/crap" "swarm/crap" "$CRAP_PROMPT" &
      PIDS+=($!)
      ;;
    mutate)
      if [[ -z "$MUTATE_CMD" ]]; then
        echo "WARNING: No mutation command detected. Mutation agent will likely BLOCK."
      fi
      run_agent "MUTATE" "$SWARM_DIR/mutate" "swarm/mutate" "$MUTATE_PROMPT" &
      PIDS+=($!)
      ;;
    accept)
      if [[ -z "$E2E_CMD" ]]; then
        echo "WARNING: No E2E command detected. Acceptance agent will likely BLOCK."
      fi
      run_agent "ACCEPT" "$SWARM_DIR/accept" "swarm/accept" "$ACCEPT_PROMPT" &
      PIDS+=($!)
      ;;
    *)
      echo "Unknown agent: $agent (valid: feature, crap, mutate, accept)"
      ;;
  esac
done

echo "Swarm launched with ${#PIDS[@]} agent(s). Press Ctrl+C to stop."
echo "Progress: $RUN_DIR/progress.md"
echo "Logs:     $RUN_DIR/logs/"
echo ""

# Wait for all agents
wait
