#!/bin/bash
set -uo pipefail
# NOTE: no `set -e` — we don't want one failed step to kill the whole mission

# ─── missions.sh ──────────────────────────────────────────────────────────────
# Multi-milestone autonomous development. Decomposes a large goal into
# milestones with validation gates. Workers build via TDD, independent
# validators judge correctness as a black box, fix features close gaps.
#
# Usage:
#   missions.sh --project /path/to/repo \
#     [--plan /path/to/mission-brief.md] \
#     [--max-rounds 4] \
#     [--max-worker-turns 80] \
#     [--agent claude]
# ──────────────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"

PROJECT_ROOT=""
PLAN_FILE=""
MAX_ROUNDS=4
MAX_WORKER_TURNS=80
AGENT_RUNTIME="${AGENT_RUNTIME:-claude}"

# ─── Parse Arguments ─────────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project)           PROJECT_ROOT="$2"; shift 2 ;;
    --plan)              PLAN_FILE="$2"; shift 2 ;;
    --max-rounds)        MAX_ROUNDS="$2"; shift 2 ;;
    --max-worker-turns)  MAX_WORKER_TURNS="$2"; shift 2 ;;
    --agent)             AGENT_RUNTIME="$2"; shift 2 ;;
    *)
      echo "Usage: $0 --project /path [--plan /path/to/brief.md] [--max-rounds 4] [--max-worker-turns 80] [--agent claude]"
      exit 1
      ;;
  esac
done

if [[ -z "$PROJECT_ROOT" ]]; then
  echo "Usage: $0 --project /path [--plan /path/to/brief.md] [--max-rounds 4] [--max-worker-turns 80] [--agent claude]"
  exit 1
fi

PROJECT_ROOT="$(cd "$PROJECT_ROOT" && pwd)"
MISSIONS_DIR="$PROJECT_ROOT/.missions"
RUN_ID="$(date '+%Y-%m-%dT%H-%M')"
RUN_DIR="$MISSIONS_DIR/runs/$RUN_ID"
START_TIME="$(date '+%Y-%m-%d %H:%M')"

# ─── Detect Package Manager ─────────────────────────────────────────────────

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

# ─── Detect Commands ─────────────────────────────────────────────────────────

detect_cmd() {
  local script_name="$1"
  local pkg="$PROJECT_ROOT/package.json"
  if [[ -f "$pkg" ]] && grep -q "\"$script_name\"" "$pkg" 2>/dev/null; then
    echo "$(pm_run "$script_name")"
  else
    echo ""
  fi
}

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

# ─── Detect Platform ────────────────────────────────────────────────────────

detect_platform() {
  if ls "$PROJECT_ROOT"/*.xcodeproj 1>/dev/null 2>&1 || ls "$PROJECT_ROOT"/*.xcworkspace 1>/dev/null 2>&1; then
    echo "ios-swift"
  elif [[ -f "$PROJECT_ROOT/.detoxrc.js" ]] || [[ -f "$PROJECT_ROOT/detox.config.js" ]] || \
       (grep -q '"detox"' "$PROJECT_ROOT/package.json" 2>/dev/null); then
    echo "react-native"
  elif [[ -f "$PROJECT_ROOT/playwright.config.ts" ]] || [[ -f "$PROJECT_ROOT/playwright.config.js" ]] || \
       (grep -q '"playwright"' "$PROJECT_ROOT/package.json" 2>/dev/null); then
    echo "web-playwright"
  else
    echo "web"
  fi
}

PLATFORM="$(detect_platform)"

# ─── Setup Directories ──────────────────────────────────────────────────────

mkdir -p "$RUN_DIR/logs"
mkdir -p "$RUN_DIR/milestones"
mkdir -p "$RUN_DIR/captures"

# Create lessons.md if it doesn't exist (persists across missions)
if [[ ! -f "$MISSIONS_DIR/lessons.md" ]]; then
  cat > "$MISSIONS_DIR/lessons.md" <<'EOF'
# Mission Lessons

Patterns and mistakes learned across missions. Agents append here.
Each entry should help future missions avoid the same problems.

EOF
fi

# Initialize progress.md
cat > "$RUN_DIR/progress.md" <<EOF
# Mission Progress — $RUN_ID

Platform: $PLATFORM
Package Manager: $PM

EOF

# Initialize heartbeat
echo "$(date '+%H:%M:%S') | STARTING | initializing mission | phase: setup" > "$MISSIONS_DIR/HEARTBEAT"

# Initialize knowledge base
if [[ ! -f "$RUN_DIR/knowledge-base.md" ]]; then
  cat > "$RUN_DIR/knowledge-base.md" <<'EOF'
# Knowledge Base

Accumulated context across this mission. Workers and validators read this
at startup. The orchestrator updates it after each validation cycle.

## Architecture decisions

## Patterns established

## Pitfalls discovered

## Validator insights

EOF
fi

# ─── Ensure .missions/ in .gitignore ────────────────────────────────────────

GITIGNORE="$PROJECT_ROOT/.gitignore"
if [[ -f "$GITIGNORE" ]] && ! grep -q '\.missions/' "$GITIGNORE" 2>/dev/null; then
  echo "" >> "$GITIGNORE"
  echo "# Missions agent data" >> "$GITIGNORE"
  echo ".missions/" >> "$GITIGNORE"
elif [[ ! -f "$GITIGNORE" ]]; then
  echo ".missions/" > "$GITIGNORE"
fi

# ─── Worktree Management ────────────────────────────────────────────────────

WORKER_WORKTREE="$MISSIONS_DIR/worker"
WORKER_BRANCH="mission/worker"

create_worker_worktree() {
  cd "$PROJECT_ROOT"
  # Clean up any existing worker worktree
  if [[ -d "$WORKER_WORKTREE" ]]; then
    git worktree remove "$WORKER_WORKTREE" --force 2>/dev/null || true
  fi
  git branch -D "$WORKER_BRANCH" 2>/dev/null || true

  git worktree add "$WORKER_WORKTREE" -b "$WORKER_BRANCH" 2>/dev/null || {
    git worktree add "$WORKER_WORKTREE" "$WORKER_BRANCH" 2>/dev/null || true
  }

  echo "[WORKER] Installing dependencies ($PM)..."
  pm_install "$WORKER_WORKTREE" 2>/dev/null || true
}

merge_worker_to_main() {
  cd "$PROJECT_ROOT"
  echo "[MERGE] Merging worker branch to main..."

  # Run tests on main after merge
  git merge "$WORKER_BRANCH" --no-edit 2>/dev/null
  local merge_status=$?

  if [[ $merge_status -ne 0 ]]; then
    echo "[MERGE] Conflict detected. Attempting auto-resolution..."
    # Try to resolve — if tests pass after merge, accept it
    git add -A 2>/dev/null || true
    git commit --no-edit 2>/dev/null || true
  fi

  # Verify tests pass on main
  if [[ -n "$TEST_CMD" ]]; then
    echo "[MERGE] Running tests on main..."
    (cd "$PROJECT_ROOT" && eval "$TEST_CMD" 2>&1) || {
      echo "[MERGE] WARNING: Tests failed after merge. Reverting."
      git reset --hard HEAD~1 2>/dev/null || true
      return 1
    }
  fi

  # Reset worker branch to current main
  git branch -D "$WORKER_BRANCH" 2>/dev/null || true
  if [[ -d "$WORKER_WORKTREE" ]]; then
    git worktree remove "$WORKER_WORKTREE" --force 2>/dev/null || true
  fi
  create_worker_worktree

  echo "[MERGE] Worker merged and reset."
  return 0
}

clean_worktrees() {
  cd "$PROJECT_ROOT"
  if [[ -d "$WORKER_WORKTREE" ]]; then
    git worktree remove "$WORKER_WORKTREE" --force 2>/dev/null || true
  fi
  git branch -D "$WORKER_BRANCH" 2>/dev/null || true
}

# ─── Agent Runner ────────────────────────────────────────────────────────────

run_agent() {
  local role="$1"     # ORCHESTRATOR, WORKER, SCRUTINY, CONTRACT
  local workdir="$2"  # directory to run in
  local prompt="$3"   # the prompt
  local logfile="$4"  # log output path
  local max_turns="${5:-80}"

  echo "[$role] Starting agent in $workdir"
  echo "[$role] Log: $logfile"

  > "$logfile"

  if [[ "$AGENT_RUNTIME" == "claude" ]]; then
    (cd "$workdir" && env -u CLAUDECODE claude -p --dangerously-skip-permissions \
      --max-turns "$max_turns" \
      <<< "$prompt" 2>&1) \
      | while IFS= read -r line; do printf '[%s] %s\n' "$role" "$line"; done \
      | tee -a "$logfile" || true
  else
    (cd "$workdir" && codex exec -C "$workdir" \
      --dangerously-bypass-approvals-and-sandbox \
      "$prompt" 2>&1) \
      | while IFS= read -r line; do printf '[%s] %s\n' "$role" "$line"; done \
      | tee -a "$logfile" || true
  fi

  cat "$logfile"
}

# ─── Prompt Builders ─────────────────────────────────────────────────────────

build_worker_prompt() {
  local feature_spec="$1"
  local milestone_id="$2"
  local feature_id="$3"

  local guidelines=""
  if [[ -f "$RUN_DIR/guidelines.md" ]]; then
    guidelines="$(cat "$RUN_DIR/guidelines.md")"
  fi

  local knowledge=""
  if [[ -f "$RUN_DIR/knowledge-base.md" ]]; then
    knowledge="$(cat "$RUN_DIR/knowledge-base.md")"
  fi

  local lessons=""
  if [[ -f "$MISSIONS_DIR/lessons.md" ]]; then
    lessons="$(cat "$MISSIONS_DIR/lessons.md")"
  fi

  cat <<PROMPT
@CLAUDE.md

You are a Worker agent in a Missions run. Your job is to implement ONE feature
using strict TDD (red-green-refactor). You do NOT validate your own work —
independent validators will do that after you're done.

PLATFORM: $PLATFORM
PACKAGE MANAGER: $PM
MILESTONE: $milestone_id
FEATURE: $feature_id

COMMANDS:
  Test:      ${TEST_CMD:-not detected}
  Typecheck: ${TYPECHECK_CMD:-not detected}
  Lint:      ${LINT_CMD:-not detected}
  E2E:       ${E2E_CMD:-not detected}
  Mutate:    ${MUTATE_CMD:-not detected}
  Coverage:  ${COVERAGE_CMD:-not detected}

===================================================================
HEARTBEAT (CRITICAL)
===================================================================

Write to $MISSIONS_DIR/HEARTBEAT after EVERY significant action:

  echo "\$(date '+%H:%M:%S') | WORKER: $feature_id | STEP: description | TESTS: pass/total" > $MISSIONS_DIR/HEARTBEAT

Update at LEAST every 5 tool calls.

===================================================================
YOUR FEATURE
===================================================================

$feature_spec

===================================================================
PROJECT GUIDELINES
===================================================================

$guidelines

===================================================================
ACCUMULATED KNOWLEDGE
===================================================================

$knowledge

===================================================================
LESSONS FROM PRIOR MISSIONS
===================================================================

$lessons

===================================================================
TDD DISCIPLINE
===================================================================

1. Write tests FIRST:
   - Integration tests at system boundaries (~70%)
   - Unit tests for complex pure logic (~15%)
   - E2E tests for critical journeys with screenshot capture (~15%)
     Save screenshots to: $RUN_DIR/captures/$feature_id/

2. Run tests -> confirm RED
3. Implement the minimum code to make tests pass
4. Refactor if needed
5. Run full verification:
   ${LINT_CMD:-skip}
   ${TYPECHECK_CMD:-skip}
   ${TEST_CMD:-skip}
6. Commit with descriptive message referencing $feature_id
7. Exit

===================================================================
ANTI-PATTERNS
===================================================================

- Don't mock your own modules. Mock external services only.
- Don't modify existing tests to make new code pass.
- Don't implement beyond your feature's scope.
- Don't add backwards-compatibility shims.
- Parse external data at the boundary (Zod/Codable).
- Don't add error handling for impossible scenarios.
- Don't create helpers/abstractions for one-time operations.

===================================================================
SIGNALS
===================================================================

When done: <promise>COMPLETE</promise>
If blocked: <promise>BLOCKED:reason</promise>
If need human: <promise>DECIDE:question</promise>
PROMPT
}

build_scrutiny_prompt() {
  local milestone_id="$1"
  local diff="$2"

  local knowledge=""
  if [[ -f "$RUN_DIR/knowledge-base.md" ]]; then
    knowledge="$(cat "$RUN_DIR/knowledge-base.md")"
  fi

  cat <<PROMPT
@CLAUDE.md

You are a Scrutiny Validator in a Missions run. Your job is to find bugs,
gaps, and quality issues in recently implemented code. You did NOT write
this code — you are an independent reviewer with fresh context.

PLATFORM: $PLATFORM
PACKAGE MANAGER: $PM
MILESTONE: $milestone_id

COMMANDS:
  Test:      ${TEST_CMD:-not detected}
  Typecheck: ${TYPECHECK_CMD:-not detected}
  Lint:      ${LINT_CMD:-not detected}
  Mutate:    ${MUTATE_CMD:-not detected}
  Coverage:  ${COVERAGE_CMD:-not detected}

===================================================================
HEARTBEAT
===================================================================

  echo "\$(date '+%H:%M:%S') | SCRUTINY: $milestone_id | STEP: description" > $MISSIONS_DIR/HEARTBEAT

===================================================================
WHAT CHANGED (git diff for this milestone)
===================================================================

$diff

===================================================================
ACCUMULATED KNOWLEDGE
===================================================================

$knowledge

===================================================================
YOUR CHECKS
===================================================================

1. CODE QUALITY
   - Naming, structure, separation of concerns
   - Are abstractions justified or premature?
   - Does the code follow project conventions (read CLAUDE.md)?

2. TEST QUALITY
   - Do tests actually test behavior or just implementation details?
   - Are there missing edge cases?
   - Would a mutation survive? (run ${MUTATE_CMD:-skip} on changed files)
   - Is the test distribution right? (mostly integration, not unit mocks)

3. CORRECTNESS
   - Error handling: are error paths tested?
   - Null/empty states: what happens with no data?
   - Concurrent access: any race conditions?
   - Boundary conditions: off-by-one, empty arrays, max values?

4. SECURITY
   - Injection (SQL, XSS, command)
   - Auth bypass
   - Data exposure in responses or logs
   - Missing input validation at system boundaries

5. CROSS-MODEL ADVERSARIAL REVIEW
   Think adversarially: what would a different AI model catch?
   What are YOUR blind spots as a reviewer?

===================================================================
OUTPUT FORMAT
===================================================================

Write your findings to $RUN_DIR/milestones/$milestone_id/issues.md

For each issue:

### ISSUE-<NNN>: <title>
**Severity:** blocking | non-blocking | suggestion
**Location:** file:line
**Description:** What's wrong and why it matters
**Reproduction:** How to trigger it (if applicable)
**Fix direction:** Describe the fix (don't implement it)

At the end, summarize:
- Total issues: N (X blocking, Y non-blocking, Z suggestion)
- Overall assessment: PASS (no blocking issues) | FAIL (blocking issues found)

===================================================================
SIGNALS
===================================================================

When done: <promise>COMPLETE</promise>
If blocked: <promise>BLOCKED:reason</promise>
PROMPT
}

build_contract_prompt() {
  local milestone_id="$1"
  local assertions="$2"

  cat <<PROMPT
@CLAUDE.md

You are a Contract Validator in a Missions run. Your job is to verify
behavioral assertions from the validation contract by exercising the system
the way a real user would. You have NO access to source code reasoning —
you interact only through the UI, API, or test tools.

PLATFORM: $PLATFORM
PACKAGE MANAGER: $PM
MILESTONE: $milestone_id

COMMANDS:
  Test:  ${TEST_CMD:-not detected}
  E2E:   ${E2E_CMD:-not detected}

===================================================================
HEARTBEAT
===================================================================

  echo "\$(date '+%H:%M:%S') | CONTRACT: $milestone_id | STEP: description" > $MISSIONS_DIR/HEARTBEAT

===================================================================
ASSERTIONS TO VERIFY
===================================================================

$assertions

===================================================================
VERIFICATION PROCESS
===================================================================

For EACH assertion:

1. Read the assertion carefully — understand preconditions, steps, evidence
2. Set up preconditions (create test users, seed data, etc.)
3. Execute the steps exactly as described
4. Capture evidence:
   - Screenshots: save to $RUN_DIR/captures/<assertion-id>/
   - Network logs: note status codes and response shapes
   - Console output: capture any errors
5. Determine verdict:
   - PASS: all evidence matches expected behavior
   - FAIL: behavior doesn't match, with reproduction steps

TOOLS AVAILABLE:
- Playwright / browser automation for web UIs
- API testing (curl, fetch) for backend endpoints
- Simulator interaction for mobile apps
- ${E2E_CMD:-skip} for running existing E2E tests

===================================================================
OUTPUT FORMAT
===================================================================

Write results to $RUN_DIR/milestones/$milestone_id/validation-results.md

### VAL-<ID>: <title>
**Verdict:** PASS | FAIL
**Evidence:** [list of screenshots, network logs, console output]
**Notes:** [any observations]
**Reproduction (if FAIL):** [exact steps to reproduce the failure]

At the end, summarize:
- Assertions checked: N
- Passed: N
- Failed: N
- Pass rate: N%

===================================================================
RULES
===================================================================

- Do NOT read source code to determine if assertions pass. Exercise the
  system as a black box.
- Do NOT fix anything. Your job is to report, not to implement.
- If you cannot set up preconditions (missing env, broken deploy),
  mark the assertion as BLOCKED, not FAIL.

===================================================================
SIGNALS
===================================================================

When done: <promise>COMPLETE</promise>
If blocked: <promise>BLOCKED:reason</promise>
PROMPT
}

build_orchestrator_prompt() {
  local phase="$1"  # plan | converge | resume
  local context="$2"

  local mission_brief=""
  if [[ -f "$RUN_DIR/mission-brief.md" ]]; then
    mission_brief="$(cat "$RUN_DIR/mission-brief.md")"
  fi

  local validation_contract=""
  if [[ -f "$RUN_DIR/validation-contract.md" ]]; then
    validation_contract="$(cat "$RUN_DIR/validation-contract.md")"
  fi

  local features=""
  if [[ -f "$RUN_DIR/features.json" ]]; then
    features="$(cat "$RUN_DIR/features.json")"
  fi

  local knowledge=""
  if [[ -f "$RUN_DIR/knowledge-base.md" ]]; then
    knowledge="$(cat "$RUN_DIR/knowledge-base.md")"
  fi

  local progress=""
  if [[ -f "$RUN_DIR/progress.md" ]]; then
    progress="$(cat "$RUN_DIR/progress.md")"
  fi

  cat <<PROMPT
@CLAUDE.md

You are the Orchestrator in a Missions run. You plan, decompose, and steer
execution to completion. You NEVER implement code yourself — you delegate
to Worker agents and judge results through Validator agents.

PHASE: $phase
PLATFORM: $PLATFORM
PACKAGE MANAGER: $PM
RUN DIRECTORY: $RUN_DIR
MAX VALIDATION ROUNDS: $MAX_ROUNDS

COMMANDS:
  Test:      ${TEST_CMD:-not detected}
  Typecheck: ${TYPECHECK_CMD:-not detected}
  Lint:      ${LINT_CMD:-not detected}
  E2E:       ${E2E_CMD:-not detected}
  Mutate:    ${MUTATE_CMD:-not detected}

===================================================================
HEARTBEAT
===================================================================

  echo "\$(date '+%H:%M:%S') | ORCHESTRATOR | STEP: description" > $MISSIONS_DIR/HEARTBEAT

===================================================================
CURRENT STATE
===================================================================

MISSION BRIEF:
$mission_brief

VALIDATION CONTRACT:
$validation_contract

FEATURES:
$features

KNOWLEDGE BASE:
$knowledge

PROGRESS:
$progress

ADDITIONAL CONTEXT:
$context

===================================================================
PHASE: $phase
===================================================================

$(case "$phase" in
  plan)
    cat <<'PLAN_INSTRUCTIONS'
You are in the PLANNING phase. The user has described their goal.
Your job is to produce three artifacts:

1. validation-contract.md — Behavioral assertions that define "done."
   Write these BEFORE thinking about features. Each assertion:
   - Has an ID: VAL-<DOMAIN>-<NNN>
   - Plain-language description of expected behavior
   - Preconditions, steps, tool, evidence required
   - Severity: blocking or non-blocking

2. features.json — Feature decomposition with milestone assignments.
   Every assertion must be claimed by at least one feature.
   Features should be small enough for one worker session (<2 hours).
   Group into milestones ordered by dependency.

3. guidelines.md — Boundaries and procedures for workers.
   Coding standards, patterns to follow, things to avoid.

Write all three files to the run directory.
Also update knowledge-base.md with any architecture decisions made.

When done: <promise>PLAN_COMPLETE</promise>
PLAN_INSTRUCTIONS
    ;;
  converge)
    cat <<'CONVERGE_INSTRUCTIONS'
You are in the CONVERGENCE phase. Validators have run and produced results.

1. Read milestones/<current>/validation-results.md (contract validator output)
2. Read milestones/<current>/issues.md (scrutiny validator output)
3. Assess: are there blocking failures?

If NO blocking issues:
  - Mark the milestone as COMPLETE in progress.md
  - Update knowledge-base.md with learnings from this cycle
  - Output: <promise>MILESTONE_PASS</promise>

If blocking issues exist:
  - Create fix features in milestones/<current>/fix-features.md
  - Each fix feature:
    - ID: FIX-<milestone>-<NNN>
    - Description of what to fix (derived from validator findings)
    - Success criteria
    - Assertion IDs it addresses
  - Do NOT leak validator reasoning into the fix feature description.
    Describe WHAT to fix, not HOW the validator found it.
  - Output: <promise>FIX_NEEDED:N</promise> (where N is number of fix features)

If this is round $MAX_ROUNDS and still failing:
  - Write a clear explanation of what's not converging and why
  - Output: <promise>HALT:milestone not converging after $MAX_ROUNDS rounds</promise>
CONVERGE_INSTRUCTIONS
    ;;
  resume)
    cat <<'RESUME_INSTRUCTIONS'
You are RESUMING a halted mission. Read the current state carefully:
- Which milestones are complete?
- Which milestone was in progress when it halted?
- What was the halt reason?

Produce a summary for the user and suggest next steps.
Output: <promise>RESUME_READY</promise>
RESUME_INSTRUCTIONS
    ;;
esac)

===================================================================
SIGNALS
===================================================================

Plan complete:       <promise>PLAN_COMPLETE</promise>
Milestone passed:    <promise>MILESTONE_PASS</promise>
Fix features needed: <promise>FIX_NEEDED:N</promise>
Mission halted:      <promise>HALT:reason</promise>
Mission complete:    <promise>MISSION_COMPLETE</promise>
Resume ready:        <promise>RESUME_READY</promise>
PROMPT
}

# ─── Codex Cross-Review ─────────────────────────────────────────────────────

run_codex_review() {
  local milestone_id="$1"
  local logfile="$RUN_DIR/logs/codex-${milestone_id}.log"

  echo "[CODEX] Running cross-model review for milestone $milestone_id..."

  if ! command -v codex &>/dev/null; then
    echo "[CODEX] codex not found, skipping cross-review"
    return 0
  fi

  local diff
  diff="$(cd "$PROJECT_ROOT" && git diff HEAD~10..HEAD 2>/dev/null || echo "no diff available")"

  (cd "$PROJECT_ROOT" && codex review --diff "$diff" \
    -c model="gpt-5.4" \
    -c model_reasoning_effort="xhigh" \
    2>&1) | tee "$logfile" || true

  echo "[CODEX] Review complete. Output: $logfile"
}

# ─── Milestone Processor ────────────────────────────────────────────────────

process_milestone() {
  local milestone_id="$1"
  local milestone_dir="$RUN_DIR/milestones/$milestone_id"
  mkdir -p "$milestone_dir"

  echo ""
  echo "╔══════════════════════════════════════════════════════╗"
  echo "║  MILESTONE: $milestone_id"
  echo "╠══════════════════════════════════════════════════════╣"
  echo "║  Phase: IMPLEMENT"
  echo "╚══════════════════════════════════════════════════════╝"
  echo ""

  # Read features for this milestone from features.json
  local features_file="$RUN_DIR/features.json"
  if [[ ! -f "$features_file" ]]; then
    echo "[ERROR] features.json not found at $features_file"
    return 1
  fi

  # Extract feature IDs for this milestone using the orchestrator's output
  # The features are stored as a JSON array; we parse with a simple approach
  local milestone_features_file="$milestone_dir/features.md"
  if [[ ! -f "$milestone_features_file" ]]; then
    echo "[ERROR] No features file for milestone $milestone_id"
    return 1
  fi

  # Process each feature
  local feature_count=0
  local feature_ids=()

  # Read feature IDs from the milestone features file
  while IFS= read -r line; do
    if [[ "$line" =~ ^###[[:space:]]+(F[A-Z0-9-]+) ]]; then
      feature_ids+=("${BASH_REMATCH[1]}")
    fi
  done < "$milestone_features_file"

  for feature_id in "${feature_ids[@]}"; do
    feature_count=$((feature_count + 1))
    echo ""
    echo "────────────────────────────────────────────────────"
    echo "  Feature $feature_count: $feature_id"
    echo "────────────────────────────────────────────────────"

    # Extract feature spec from the features file
    local feature_spec
    feature_spec="$(awk -v fid="### $feature_id" '
      $0 ~ fid { flag=1 }
      flag { print }
      /^### F/ && !($0 ~ fid) && flag { flag=0; exit }
    ' "$milestone_features_file")"

    if [[ -z "$feature_spec" ]]; then
      echo "[WARNING] Could not extract spec for $feature_id, using full file"
      feature_spec="$(cat "$milestone_features_file")"
    fi

    # Ensure worker worktree exists and is up to date
    create_worker_worktree

    # Build and run worker
    local worker_prompt
    worker_prompt="$(build_worker_prompt "$feature_spec" "$milestone_id" "$feature_id")"
    local worker_log="$RUN_DIR/logs/worker-${feature_id}.log"

    echo "$(date '+%H:%M:%S') | WORKER: $feature_id | starting | milestone: $milestone_id" > "$MISSIONS_DIR/HEARTBEAT"

    run_agent "WORKER:$feature_id" "$WORKER_WORKTREE" "$worker_prompt" "$worker_log" "$MAX_WORKER_TURNS"

    local worker_output
    worker_output="$(cat "$worker_log")"

    # Check worker signals
    if echo "$worker_output" | grep -qF "<promise>BLOCKED:"; then
      echo "[WORKER:$feature_id] BLOCKED"
      echo "## [WORKER] $(date '+%H:%M') — $feature_id BLOCKED" >> "$RUN_DIR/progress.md"
      local block_reason
      block_reason="$(echo "$worker_output" | grep -oP '<promise>BLOCKED:\K[^<]+')"
      echo "Reason: $block_reason" >> "$RUN_DIR/progress.md"
      echo "" >> "$RUN_DIR/progress.md"
      continue
    fi

    if echo "$worker_output" | grep -qF "<promise>DECIDE:"; then
      echo "[WORKER:$feature_id] NEEDS HUMAN DECISION"
      echo "## [WORKER] $(date '+%H:%M') — $feature_id NEEDS DECISION" >> "$RUN_DIR/progress.md"
      return 2  # Signal to halt
    fi

    # Merge worker's changes to main
    merge_worker_to_main || {
      echo "[WARNING] Merge failed for $feature_id, continuing..."
      echo "## [WORKER] $(date '+%H:%M') — $feature_id MERGE FAILED" >> "$RUN_DIR/progress.md"
      echo "" >> "$RUN_DIR/progress.md"
    }

    echo "## [WORKER] $(date '+%H:%M') — $feature_id COMPLETE" >> "$RUN_DIR/progress.md"
    echo "" >> "$RUN_DIR/progress.md"

    # Brief pause between features
    sleep 5
  done

  # ─── Validation Phase ────────────────────────────────────────────────────

  local round=0
  while [[ $round -lt $MAX_ROUNDS ]]; do
    round=$((round + 1))

    echo ""
    echo "╔══════════════════════════════════════════════════════╗"
    echo "║  MILESTONE: $milestone_id — VALIDATION ROUND $round"
    echo "╚══════════════════════════════════════════════════════╝"
    echo ""

    echo "$(date '+%H:%M:%S') | VALIDATE: $milestone_id round $round | starting" > "$MISSIONS_DIR/HEARTBEAT"

    # Get the diff for this milestone
    local milestone_diff
    milestone_diff="$(cd "$PROJECT_ROOT" && git diff HEAD~${feature_count}..HEAD 2>/dev/null || echo "diff unavailable")"

    # Get assertions for this milestone
    local milestone_assertions=""
    if [[ -f "$RUN_DIR/validation-contract.md" ]]; then
      milestone_assertions="$(cat "$RUN_DIR/validation-contract.md")"
    fi

    # Run scrutiny validator
    local scrutiny_prompt
    scrutiny_prompt="$(build_scrutiny_prompt "$milestone_id" "$milestone_diff")"
    local scrutiny_log="$RUN_DIR/logs/scrutiny-${milestone_id}-r${round}.log"

    echo "[VALIDATE] Launching scrutiny validator..."
    run_agent "SCRUTINY:${milestone_id}" "$PROJECT_ROOT" "$scrutiny_prompt" "$scrutiny_log" 60 &
    local scrutiny_pid=$!

    # Run contract validator
    local contract_prompt
    contract_prompt="$(build_contract_prompt "$milestone_id" "$milestone_assertions")"
    local contract_log="$RUN_DIR/logs/contract-${milestone_id}-r${round}.log"

    echo "[VALIDATE] Launching contract validator..."
    run_agent "CONTRACT:${milestone_id}" "$PROJECT_ROOT" "$contract_prompt" "$contract_log" 60 &
    local contract_pid=$!

    # Run codex cross-review in parallel
    run_codex_review "$milestone_id" &
    local codex_pid=$!

    # Wait for all validators
    wait "$scrutiny_pid" 2>/dev/null || true
    wait "$contract_pid" 2>/dev/null || true
    wait "$codex_pid" 2>/dev/null || true

    echo ""
    echo "## [VALIDATE] $(date '+%H:%M') — $milestone_id Round $round complete" >> "$RUN_DIR/progress.md"

    # ─── Convergence: Let orchestrator assess results ────────────────────

    echo "$(date '+%H:%M:%S') | ORCHESTRATOR | converging $milestone_id round $round" > "$MISSIONS_DIR/HEARTBEAT"

    local converge_prompt
    converge_prompt="$(build_orchestrator_prompt "converge" "Milestone: $milestone_id, Round: $round of $MAX_ROUNDS")"
    local converge_log="$RUN_DIR/logs/orchestrator-converge-${milestone_id}-r${round}.log"

    run_agent "ORCHESTRATOR" "$PROJECT_ROOT" "$converge_prompt" "$converge_log" 40

    local converge_output
    converge_output="$(cat "$converge_log")"

    # Check orchestrator signals
    if echo "$converge_output" | grep -qF "<promise>MILESTONE_PASS</promise>"; then
      echo ""
      echo "=== MILESTONE $milestone_id PASSED (round $round) ==="
      echo "## [ORCHESTRATOR] $(date '+%H:%M') — $milestone_id PASSED (round $round)" >> "$RUN_DIR/progress.md"
      echo "" >> "$RUN_DIR/progress.md"
      return 0
    fi

    if echo "$converge_output" | grep -qF "<promise>HALT:"; then
      echo ""
      echo "=== MILESTONE $milestone_id HALTED ==="
      local halt_reason
      halt_reason="$(echo "$converge_output" | grep -oP '<promise>HALT:\K[^<]+')"
      echo "Reason: $halt_reason"
      echo "## [ORCHESTRATOR] $(date '+%H:%M') — $milestone_id HALTED: $halt_reason" >> "$RUN_DIR/progress.md"
      echo "" >> "$RUN_DIR/progress.md"
      return 1
    fi

    if echo "$converge_output" | grep -qF "<promise>FIX_NEEDED:"; then
      echo ""
      echo "[CONVERGE] Fix features needed. Processing..."

      # Read fix features from the milestone directory
      local fix_features_file="$milestone_dir/fix-features.md"
      if [[ -f "$fix_features_file" ]]; then
        local fix_ids=()
        while IFS= read -r line; do
          if [[ "$line" =~ ^###[[:space:]]+(FIX-[A-Z0-9-]+) ]]; then
            fix_ids+=("${BASH_REMATCH[1]}")
          fi
        done < "$fix_features_file"

        for fix_id in "${fix_ids[@]}"; do
          echo ""
          echo "  Fix feature: $fix_id"

          local fix_spec
          fix_spec="$(awk -v fid="### $fix_id" '
            $0 ~ fid { flag=1 }
            flag { print }
            /^### FIX-/ && !($0 ~ fid) && flag { flag=0; exit }
          ' "$fix_features_file")"

          create_worker_worktree

          local fix_prompt
          fix_prompt="$(build_worker_prompt "$fix_spec" "$milestone_id" "$fix_id")"
          local fix_log="$RUN_DIR/logs/worker-${fix_id}.log"

          echo "$(date '+%H:%M:%S') | WORKER: $fix_id | fix feature" > "$MISSIONS_DIR/HEARTBEAT"
          run_agent "WORKER:$fix_id" "$WORKER_WORKTREE" "$fix_prompt" "$fix_log" "$MAX_WORKER_TURNS"
          merge_worker_to_main || true

          echo "## [WORKER] $(date '+%H:%M') — $fix_id COMPLETE (fix)" >> "$RUN_DIR/progress.md"
          echo "" >> "$RUN_DIR/progress.md"
        done
      fi
    fi

    # Brief pause between validation rounds
    sleep 10
  done

  echo ""
  echo "=== MILESTONE $milestone_id: Max rounds ($MAX_ROUNDS) reached ==="
  echo "## [ORCHESTRATOR] $(date '+%H:%M') — $milestone_id EXHAUSTED ($MAX_ROUNDS rounds)" >> "$RUN_DIR/progress.md"
  return 1
}

# ─── Report Generator ───────────────────────────────────────────────────────

generate_report() {
  local report="$RUN_DIR/report.md"
  local end_time
  end_time="$(date '+%Y-%m-%d %H:%M')"

  cat > "$report" <<EOF
# Mission Report — $RUN_ID

## Configuration
- Project: $PROJECT_ROOT
- Platform: $PLATFORM
- Runtime: $AGENT_RUNTIME
- Package Manager: $PM
- Max Validation Rounds: $MAX_ROUNDS
- Started: $START_TIME
- Ended: $end_time

## Summary
EOF

  # Count outcomes
  local workers_complete workers_blocked milestones_passed milestones_failed
  workers_complete=$(grep -c 'WORKER.*COMPLETE' "$RUN_DIR/progress.md" 2>/dev/null || echo "0")
  workers_blocked=$(grep -c 'WORKER.*BLOCKED' "$RUN_DIR/progress.md" 2>/dev/null || echo "0")
  milestones_passed=$(grep -c 'MILESTONE.*PASSED\|PASSED' "$RUN_DIR/progress.md" 2>/dev/null || echo "0")
  milestones_failed=$(grep -c 'HALTED\|EXHAUSTED' "$RUN_DIR/progress.md" 2>/dev/null || echo "0")

  cat >> "$report" <<EOF
- Workers completed: $workers_complete
- Workers blocked: $workers_blocked
- Milestones passed: $milestones_passed
- Milestones failed/halted: $milestones_failed

## Commits
\`\`\`
$(cd "$PROJECT_ROOT" && git log --oneline -30 2>/dev/null || echo "no commits")
\`\`\`

## Full Progress
$(cat "$RUN_DIR/progress.md" 2>/dev/null || echo "no progress")

## Knowledge Base
$(cat "$RUN_DIR/knowledge-base.md" 2>/dev/null || echo "no knowledge")
EOF

  echo "Report written to $report"
}

# ─── Cleanup ─────────────────────────────────────────────────────────────────

cleanup() {
  echo ""
  echo "════════════════════════════════════════════════════"
  echo "  Mission ending..."
  echo "════════════════════════════════════════════════════"

  generate_report
  clean_worktrees

  echo ""
  echo "Mission complete."
  echo "  Report:    $RUN_DIR/report.md"
  echo "  Progress:  $RUN_DIR/progress.md"
  echo "  Knowledge: $RUN_DIR/knowledge-base.md"
  echo "  Lessons:   $MISSIONS_DIR/lessons.md"
}
trap cleanup EXIT

# Pre-cleanup zombie worktrees from crashed runs
clean_worktrees

# ─── Launch ──────────────────────────────────────────────────────────────────

echo "╔══════════════════════════════════════════════════════╗"
echo "║              MISSIONS DISPATCHER                    ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║  Project:     $PROJECT_ROOT"
echo "║  Platform:    $PLATFORM"
echo "║  Runtime:     $AGENT_RUNTIME"
echo "║  Pkg Manager: $PM"
echo "║  Max Rounds:  $MAX_ROUNDS"
echo "║  Run ID:      $RUN_ID"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "Commands detected:"
[[ -n "$TEST_CMD" ]] && echo "  Test:      $TEST_CMD"
[[ -n "$TYPECHECK_CMD" ]] && echo "  Typecheck: $TYPECHECK_CMD"
[[ -n "$LINT_CMD" ]] && echo "  Lint:      $LINT_CMD"
[[ -n "$E2E_CMD" ]] && echo "  E2E:       $E2E_CMD"
[[ -n "$MUTATE_CMD" ]] && echo "  Mutate:    $MUTATE_CMD"
[[ -n "$COVERAGE_CMD" ]] && echo "  Coverage:  $COVERAGE_CMD"
echo ""

# ─── Phase 1: Planning ──────────────────────────────────────────────────────

# If a plan file was provided, copy it as the mission brief
if [[ -n "$PLAN_FILE" && -f "$PLAN_FILE" ]]; then
  cp "$PLAN_FILE" "$RUN_DIR/mission-brief.md"
  echo "Loaded mission brief from $PLAN_FILE"
fi

# Check if planning artifacts already exist (resume case)
if [[ -f "$RUN_DIR/features.json" && -f "$RUN_DIR/validation-contract.md" ]]; then
  echo ""
  echo "Planning artifacts found — resuming execution."
  echo ""
else
  echo ""
  echo "════════════════════════════════════════════════════"
  echo "  Phase 1: PLANNING"
  echo "════════════════════════════════════════════════════"
  echo ""

  echo "$(date '+%H:%M:%S') | ORCHESTRATOR | planning phase" > "$MISSIONS_DIR/HEARTBEAT"

  local plan_context=""
  if [[ -f "$RUN_DIR/mission-brief.md" ]]; then
    plan_context="Mission brief provided. Read it and proceed to decomposition."
  else
    plan_context="No mission brief yet. The user will describe the goal interactively."
  fi

  plan_prompt="$(build_orchestrator_prompt "plan" "$plan_context")"
  plan_log="$RUN_DIR/logs/orchestrator-plan.log"

  run_agent "ORCHESTRATOR" "$PROJECT_ROOT" "$plan_prompt" "$plan_log" 120

  plan_output="$(cat "$plan_log")"

  if echo "$plan_output" | grep -qF "<promise>HALT:"; then
    echo ""
    echo "=== Planning halted. Check $plan_log ==="
    exit 1
  fi

  if ! echo "$plan_output" | grep -qF "<promise>PLAN_COMPLETE</promise>"; then
    echo ""
    echo "=== Planning did not complete. Check $plan_log ==="
    echo "=== Artifacts may be partial. Review before continuing. ==="
    exit 1
  fi

  echo ""
  echo "Planning complete. Artifacts:"
  [[ -f "$RUN_DIR/validation-contract.md" ]] && echo "  Validation contract: $RUN_DIR/validation-contract.md"
  [[ -f "$RUN_DIR/features.json" ]] && echo "  Features: $RUN_DIR/features.json"
  [[ -f "$RUN_DIR/guidelines.md" ]] && echo "  Guidelines: $RUN_DIR/guidelines.md"
  echo ""
fi

# ─── Phase 2: Execution ─────────────────────────────────────────────────────

echo ""
echo "════════════════════════════════════════════════════"
echo "  Phase 2: EXECUTION"
echo "════════════════════════════════════════════════════"
echo ""

# Read milestone IDs from features.json
# We expect the orchestrator to have also created milestone feature files
MILESTONE_IDS=()
if [[ -d "$RUN_DIR/milestones" ]]; then
  for mdir in "$RUN_DIR/milestones"/*/; do
    if [[ -d "$mdir" ]]; then
      local mid
      mid="$(basename "$mdir")"
      MILESTONE_IDS+=("$mid")
    fi
  done
fi

# Fallback: scan features.json for milestone IDs
if [[ ${#MILESTONE_IDS[@]} -eq 0 && -f "$RUN_DIR/features.json" ]]; then
  # Simple extraction: look for milestone directory markers
  while IFS= read -r line; do
    if [[ "$line" =~ \"id\":[[:space:]]*\"(M[0-9]+)\" ]]; then
      local mid="${BASH_REMATCH[1]}"
      mkdir -p "$RUN_DIR/milestones/$mid"
      MILESTONE_IDS+=("$mid")
    fi
  done < "$RUN_DIR/features.json"
fi

if [[ ${#MILESTONE_IDS[@]} -eq 0 ]]; then
  echo "[ERROR] No milestones found. Check planning output."
  exit 1
fi

echo "Milestones to process: ${MILESTONE_IDS[*]}"
echo ""

MISSION_STATUS="complete"
for milestone_id in "${MILESTONE_IDS[@]}"; do
  process_milestone "$milestone_id"
  local status=$?

  if [[ $status -eq 1 ]]; then
    echo ""
    echo "=== Mission halted at milestone $milestone_id ==="
    MISSION_STATUS="halted"
    break
  elif [[ $status -eq 2 ]]; then
    echo ""
    echo "=== Mission needs human decision at milestone $milestone_id ==="
    MISSION_STATUS="needs-decision"
    break
  fi
done

# ─── Phase 3: Handoff ───────────────────────────────────────────────────────

echo ""
echo "════════════════════════════════════════════════════"
echo "  Phase 3: HANDOFF"
echo "════════════════════════════════════════════════════"
echo ""
echo "Mission status: $MISSION_STATUS"
echo ""

echo "$(date '+%H:%M:%S') | COMPLETE | mission $MISSION_STATUS" > "$MISSIONS_DIR/HEARTBEAT"
