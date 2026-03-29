#!/bin/bash
set -uo pipefail
# NOTE: no `set -e` — we don't want one failed iteration to kill the loop

# ─── nightshift.sh ────────────────────────────────────────────────────────────
# Autonomous sequential development loop. Works through specs/bugs one at a
# time with testing-trophy TDD, progressive commits, and a layered eval stack.
#
# Usage:
#   nightshift.sh --project /path/to/repo [--duration "4 hours"] \
#                 [--iterations 20] [--agent claude] [--skip-grill] [--exploratory]
# ──────────────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"

PROJECT_ROOT=""
DURATION=""
MAX_ITERATIONS="${MAX_ITERATIONS:-20}"
AGENT_RUNTIME="${AGENT_RUNTIME:-claude}"
CODEX_REVIEWER="${CODEX_REVIEWER:-false}"
SKIP_GRILL="${SKIP_GRILL:-false}"
EXPLORATORY="${EXPLORATORY:-false}"

# ─── Parse Arguments ──────────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project)      PROJECT_ROOT="$2"; shift 2 ;;
    --duration)     DURATION="$2"; shift 2 ;;
    --iterations)   MAX_ITERATIONS="$2"; shift 2 ;;
    --agent)        AGENT_RUNTIME="$2"; shift 2 ;;
    --with-codex)   CODEX_REVIEWER="true"; shift ;;
    --skip-grill)   SKIP_GRILL="true"; shift ;;
    --exploratory)  EXPLORATORY="true"; shift ;;
    *)
      echo "Usage: $0 --project /path [--duration '4 hours'] [--iterations N] [--agent claude] [--skip-grill] [--exploratory]"
      exit 1
      ;;
  esac
done

if [[ -z "$PROJECT_ROOT" ]]; then
  echo "Usage: $0 --project /path [--duration '4 hours'] [--iterations N] [--agent claude] [--skip-grill] [--exploratory]"
  exit 1
fi

PROJECT_ROOT="$(cd "$PROJECT_ROOT" && pwd)"
NIGHTSHIFT_DIR="$PROJECT_ROOT/.nightshift"
RUN_ID="$(date '+%Y-%m-%dT%H-%M')"
RUN_DIR="$NIGHTSHIFT_DIR/runs/$RUN_ID"
START_TIME="$(date '+%Y-%m-%d %H:%M')"
CODEX_PID=""

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
E2E_CMD="$(detect_cmd_any "test:e2e" "e2e")"
MUTATE_CMD="$(detect_cmd_any "test:mutate:incremental" "test:mutate")"
COVERAGE_CMD="$(detect_cmd_any "test:coverage")"

# ─── Detect Platform ─────────────────────────────────────────────────────────

detect_platform() {
  if ls "$PROJECT_ROOT"/*.xcodeproj 1>/dev/null 2>&1 || ls "$PROJECT_ROOT"/*.xcworkspace 1>/dev/null 2>&1; then
    echo "ios-swift"
  elif [[ -f "$PROJECT_ROOT/.detoxrc.js" ]] || [[ -f "$PROJECT_ROOT/detox.config.js" ]] || \
       (grep -q '"detox"' "$PROJECT_ROOT/package.json" 2>/dev/null); then
    echo "react-native"
  elif [[ -f "$PROJECT_ROOT/playwright.config.ts" ]] || [[ -f "$PROJECT_ROOT/playwright.config.js" ]] || \
       (grep -q '"playwright"' "$PROJECT_ROOT/package.json" 2>/dev/null); then
    echo "web-playwright"
  elif [[ -f "$PROJECT_ROOT/cypress.config.ts" ]] || [[ -f "$PROJECT_ROOT/cypress.config.js" ]]; then
    echo "web-cypress"
  else
    echo "unknown"
  fi
}

PLATFORM="$(detect_platform)"

# ─── Setup Directories ──────────────────────────────────────────────��────────

mkdir -p "$RUN_DIR/logs"
mkdir -p "$NIGHTSHIFT_DIR/eval-surface/judges"
mkdir -p "$NIGHTSHIFT_DIR/captures"

# Create lessons.md if it doesn't exist (persists across runs)
if [[ ! -f "$NIGHTSHIFT_DIR/lessons.md" ]]; then
  cat > "$NIGHTSHIFT_DIR/lessons.md" <<'EOF'
# Nightshift Lessons

Patterns and mistakes learned across runs. The agent appends here.
Each entry should help future runs avoid the same mistakes.

EOF
fi

# Create NOTICED.md if it doesn't exist
if [[ ! -f "$NIGHTSHIFT_DIR/NOTICED.md" ]]; then
  cat > "$NIGHTSHIFT_DIR/NOTICED.md" <<'EOF'
# Noticed

Unrelated issues observed during nightshift runs. Human should review and
either fix these or file tickets.

EOF
fi

# Create eval-gaps.md if it doesn't exist
if [[ ! -f "$NIGHTSHIFT_DIR/eval-gaps.md" ]]; then
  cat > "$NIGHTSHIFT_DIR/eval-gaps.md" <<'EOF'
# Eval Gaps

Gaps discovered by codex review or LLM judges that existing evals didn't catch.
Each entry recommends whether to add a hook, test, or judge.
Review these during preflight to iterate on the eval surface.

EOF
fi

# Initialize progress.md for this run
cat > "$RUN_DIR/progress.md" <<EOF
# Nightshift Progress — $RUN_ID

Platform: $PLATFORM
Duration hint: ${DURATION:-none}

EOF

# Initialize heartbeat file
echo "$(date '+%H:%M:%S') | STARTING | waiting for first task | TESTS: pending" > "$NIGHTSHIFT_DIR/HEARTBEAT"

# ─── Ensure .nightshift/ in .gitignore ────────────────────────────────────────

GITIGNORE="$PROJECT_ROOT/.gitignore"
if [[ -f "$GITIGNORE" ]] && ! grep -q '\.nightshift/' "$GITIGNORE" 2>/dev/null; then
  echo "" >> "$GITIGNORE"
  echo "# Nightshift agent data" >> "$GITIGNORE"
  echo ".nightshift/" >> "$GITIGNORE"
elif [[ ! -f "$GITIGNORE" ]]; then
  echo ".nightshift/" > "$GITIGNORE"
fi

# ─── Codex Reviewer (legacy — kept for --with-codex backward compat) ─��──────

start_codex_reviewer() {
  if [[ "$CODEX_REVIEWER" != "true" ]]; then
    return
  fi

  echo "Starting Codex reviewer agent (legacy background mode)..."

  local codex_prompt
  codex_prompt="$(cat <<'CODEX_PROMPT'
You are an expert code reviewer watching another AI agent work. Your job is to
review each new commit as it lands and provide feedback.

LOOP:
1. Sleep for 5 minutes
2. Check git log for new commits since your last check
3. For each new commit:
   a. Read the diff: git show <sha>
   b. Read the spec it references (check commit message for spec path,
      then look in docs/product-specs/, .plans/, or specs/)
   c. Write a review to .nightshift/CODEX_REVIEW.md with:
      - Commit SHA and title
      - What's good
      - What concerns you (be specific, cite lines)
      - Suggested improvements
4. If no new commits for 30 minutes, stop
5. If all specs are implemented, stop

FORMAT for .nightshift/CODEX_REVIEW.md:
---
## Review: <sha short> — <title>
**Verdict**: APPROVE | CONCERNS | NEEDS_CHANGES
**Good**: <what's well done>
**Concerns**: <specific issues with file:line references>
**Suggestions**: <concrete improvements>
---

Be rigorous but constructive. Focus on:
- Does the acceptance test actually test what the spec says?
- Is the implementation correct, or does it just make tests pass?
- Any security, performance, or UX issues?
- Any code that a human reviewer would flag?
CODEX_PROMPT
)"

  (cd "$PROJECT_ROOT" && codex exec --dangerously-bypass-approvals-and-sandbox "$codex_prompt" > "$RUN_DIR/logs/codex-reviewer.log" 2>&1) &
  CODEX_PID=$!
  echo "Codex reviewer started (PID: $CODEX_PID)"
}

stop_codex_reviewer() {
  if [[ -n "$CODEX_PID" ]]; then
    kill "$CODEX_PID" 2>/dev/null || true
    wait "$CODEX_PID" 2>/dev/null || true
    echo "Codex reviewer stopped."
  fi
}

# ─── Build Agent Prompt ──────────────────────────────────────────────────────

build_prompt() {
  local acceptance_ref="$SKILL_DIR/references/acceptance-testing.md"

  # Build exploratory section
  local exploratory_section=""
  if [[ "$EXPLORATORY" == "true" ]]; then
    exploratory_section="EXPLORATORY MODE IS ON. After the eval stack passes, do a freeform
smoke test by driving the live application:

  Web:          Use Chrome MCP to navigate the app, poke around
  iOS:          Use xcrun simctl to screenshot and inspect
  React Native: Use simulator/device for freeform navigation

This is unstructured — look for visual glitches, broken images,
layout issues, flows that feel wrong. Log findings to NOTICED.md."
  else
    exploratory_section="EXPLORATORY MODE IS OFF. Skip this step.
To enable: re-run with --exploratory flag."
  fi

  cat <<PROMPT
@CLAUDE.md

You are the Nightshift agent. You work autonomously through the project's
specs and bugs backlog, one task at a time. You follow the testing trophy
(integration-heavy), use progressive commits, and run a layered eval stack.

PLATFORM: $PLATFORM
PACKAGE MANAGER: $PM
DURATION: ${DURATION:-unlimited (work until backlog is empty)}
RUN DIRECTORY: $RUN_DIR
SKIP GRILL: $SKIP_GRILL
EXPLORATORY: $EXPLORATORY

COMMANDS:
  Test:      ${TEST_CMD:-not detected}
  Typecheck: ${TYPECHECK_CMD:-not detected}
  Lint:      ${LINT_CMD:-not detected}
  E2E:       ${E2E_CMD:-not detected}
  Mutate:    ${MUTATE_CMD:-not detected}
  Coverage:  ${COVERAGE_CMD:-not detected}

LESSONS FROM PRIOR RUNS: Read $NIGHTSHIFT_DIR/lessons.md before starting.
EVAL SURFACE: Check $NIGHTSHIFT_DIR/eval-surface/ for judge prompts and criteria.
EVAL GAPS: Check $NIGHTSHIFT_DIR/eval-gaps.md for known gaps to address.

===================================================================
HEARTBEAT (CRITICAL — DO THIS THROUGHOUT)
===================================================================

You MUST write to $NIGHTSHIFT_DIR/HEARTBEAT after EVERY significant action.
This is how the human monitors your progress. Write a single line:

  echo "TIMESTAMP | SPEC: name | STEP: description | TESTS: pass/total" > $NIGHTSHIFT_DIR/HEARTBEAT

Examples:
  echo "$(date '+%H:%M:%S') | SPEC: match-session-websocket | STEP: reading spec | TESTS: 49/52" > $NIGHTSHIFT_DIR/HEARTBEAT
  echo "$(date '+%H:%M:%S') | SPEC: match-session-websocket | STEP: writing integration tests | TESTS: 49/52" > $NIGHTSHIFT_DIR/HEARTBEAT
  echo "$(date '+%H:%M:%S') | SPEC: match-session-websocket | STEP: implementing WebSocket handler | TESTS: 49/52" > $NIGHTSHIFT_DIR/HEARTBEAT
  echo "$(date '+%H:%M:%S') | SPEC: match-session-websocket | STEP: running eval stack | TESTS: 55/58" > $NIGHTSHIFT_DIR/HEARTBEAT
  echo "$(date '+%H:%M:%S') | SPEC: match-session-websocket | STEP: committing | TESTS: 58/58" > $NIGHTSHIFT_DIR/HEARTBEAT

Update the heartbeat at LEAST every 5 tool calls. If you forget, the human
will think you're stuck. This is the #1 most important visibility mechanism.

Also update $RUN_DIR/progress.md IMMEDIATELY when you start a spec (not just
when you finish it):

  ## [NIGHTSHIFT] HH:MM — SPEC: name (IN PROGRESS)
  Step 1: Reading spec... done
  Step 2: Writing tests...

Then update each step as you complete it. Mark "(DONE)" when finished.

===================================================================
STEP 0: PREP
===================================================================

1. Read $NIGHTSHIFT_DIR/lessons.md for context from prior runs.
2. Read $NIGHTSHIFT_DIR/eval-surface/ for existing judge prompts and eval criteria.
   If empty, note that eval surface needs to be built during first task.
3. Read $NIGHTSHIFT_DIR/eval-gaps.md for gaps from prior runs. If any are
   actionable, create the recommended hooks/tests/judges before starting.
4. Check for uncommitted changes:
   - If there are changes that look like work-in-progress, commit them:
     "wip: save uncommitted work before nightshift"
   - If there are changes that look accidental, stash them:
     git stash push -m "nightshift-prep-$RUN_ID"
5. Run the full test suite (${TEST_CMD:-skip if no test command}).
   Fix any failures before proceeding. If you cannot fix a failure,
   log it to $RUN_DIR/progress.md and continue.
6. Run E2E tests if available (${E2E_CMD:-skip if no e2e command}).
   Fix any failures. Log any you cannot fix.

===================================================================
STEP 1: PICK TASK
===================================================================

Priority order:
1. BUGS FIRST. Check for a bugs file in this order:
   - docs/BUGS.md
   - .plans/BUGS.md
   - specs/BUGS.md
   - BUGS.md (project root)
   If found, pick the first unchecked bug (- [ ]).

2. If no bugs remain, find non-draft spec files. Discover spec locations by:
   a. Reading CLAUDE.md — look for a "Knowledge Base" or "Key files" table.
      The table links to docs like docs/product-specs/*.md, docs/SPEC.md,
      .plans/*.md, spec/SPEC.md, etc.
   b. Scanning standard locations in order:
      - docs/product-specs/ (non-draft-* .md files)
      - docs/exec-plans/ (non-draft-* .md files)
      - .plans/ (non-draft-* .md files)
      - docs/SPEC.md or spec/SPEC.md (monolithic spec)
      - specs/ (fallback, non-draft-* .md files)
   c. Pick the oldest non-draft spec by filename or by priority hints.

3. If docs/acceptance/ has .feature files matching the spec, load them
   as Gherkin acceptance criteria to drive test writing.

4. If no bugs and no specs remain, output <promise>COMPLETE</promise>

When picking a task, consider the DURATION hint. If there's limited
time remaining, pick a smaller task. Reserve ~15 minutes at the end
for the morning briefing.

===================================================================
STEP 2: LOAD CONTEXT
===================================================================

1. Read the spec/bug description thoroughly.
2. Read CLAUDE.md's knowledge base table — load docs relevant to this task.
   Follow progressive disclosure: only load the docs you need, not all of them.
3. If docs/acceptance/ has a .feature file matching this spec, read it for
   Gherkin acceptance criteria.
4. Check AGENTS.md (if it exists) for additional documentation pointers.
5. Read relevant source code and existing tests.
6. Read $RUN_DIR/progress.md for what's been done this run.
7. Read judge prompts from $NIGHTSHIFT_DIR/eval-surface/judges/ for this task's
   subjective criteria (visual quality, UX copy, spec compliance, etc.).

===================================================================
STEP 3: WRITE TESTS (TESTING TROPHY)
===================================================================

Follow the testing trophy: integration-heavy, not E2E-heavy.
Read $acceptance_ref for E2E patterns.

1. INTEGRATION TESTS FIRST (~70% of test effort):
   - Web: Storybook play functions (real components, real DOM, real interactions)
   - Workers: vitest-pool-workers with real D1/KV/R2 bindings
   - iOS: XCTest UI tests (real app, real navigation)
   - React Native: Detox (real device/simulator interaction)
   Write tests that exercise real behavior through real boundaries.
   Don't mock what you own. Mock only external services (Stripe, push providers).

2. UNIT TESTS for complex pure logic (~15%):
   - Scoring functions, parsers, state machine transitions, algorithms
   - Only when the logic is genuinely complex
   - If tempted to mock your own modules, write an integration test instead

3. E2E TESTS for critical user journeys (~15%):
   - Only the 1-3 most important user flows per spec
   - MUST include screenshot capture at key checkpoints:
     Web:    page.screenshot({ path: '$NIGHTSHIFT_DIR/captures/<task>/<checkpoint>.png' })
     iOS:    XCTAttachment(screenshot: app.screenshot())
     Detox:  device.takeScreenshot('<checkpoint>')
   - These screenshots feed the LLM judges in Step 5

4. Run all tests. They MUST fail (red). If any pass, the feature already
   exists or the test is wrong.

===================================================================
STEP 4: IMPLEMENT WITH PROGRESSIVE COMMITS
===================================================================

1. Implement the feature to make all tests pass.
2. Follow the project's conventions (read CLAUDE.md).
3. Keep it simple. Don't over-engineer.
4. All interactive UI elements must have testID/accessibilityIdentifier.

PROGRESSIVE COMMITS: Don't wait until the end to commit. Commit each
compiling milestone as you go:
  wip(scope): add data model and schema
  wip(scope): implement core logic, integration tests green
  wip(scope): wire up UI, storybook play functions green
  wip(scope): e2e journey passing with screenshots

This reduces blast radius if an iteration crashes mid-task. Each wip
commit should compile and have some tests passing.

TDD within each slice: red -> green -> refactor -> commit.

===================================================================
STEP 5: RUN EVAL STACK
===================================================================

Run the eval stack in tier order. ALL blocking tiers must pass.

TIER 1 — STATIC (fast, blocking):
  ${LINT_CMD:-skip} (code style)
  ${TYPECHECK_CMD:-skip} (type safety)
  Fix any issues before proceeding.

TIER 2 — INTEGRATION TESTS (medium, blocking):
  ${TEST_CMD:-skip}
  These are the bulk of your tests. All must pass.

TIER 3 — E2E TESTS + SCREENSHOT CAPTURE (slow, blocking):
  ${E2E_CMD:-skip}
  Verify screenshots were saved to $NIGHTSHIFT_DIR/captures/
  All must pass. Screenshots are consumed by Tier 4.

TIER 4 — LLM JUDGES (slow, blocking):
  Read judge prompts from $NIGHTSHIFT_DIR/eval-surface/judges/.
  If no judge prompts exist, evaluate against the spec directly.
  For each judge, spawn a sub-agent with:
    - The judge prompt (criteria to evaluate)
    - Screenshots from $NIGHTSHIFT_DIR/captures/<task>/
    - The spec being implemented
    - The git diff

  Launch all judges in parallel:
    Agent("Judge: Visual Quality", "[prompt + screenshots + spec]")
    Agent("Judge: UX Copy", "[prompt + screenshots + spec]")
    Agent("Judge: Spec Compliance", "[prompt + screenshots + spec]")

  Each judge returns:
    <eval>PASS</eval>           — criterion met
    <eval>FAIL: reason</eval>   — must fix before proceeding
    <eval>SCORE: N</eval>       �� numeric (threshold in judge prompt)

  If any judge returns FAIL: fix the issue, re-run from Tier 1.

TIER 5 — CODEX REVIEW (advisory):
  Run codex as a cross-model audit: "what did our evals miss?"

  codex review --uncommitted \
    -c model="gpt-5.4" \
    -c model_reasoning_effort="xhigh" \
    2>&1 | tee $RUN_DIR/codex-review.md

  Fix real issues. Note false positives. Log legitimate eval gaps to
  $NIGHTSHIFT_DIR/eval-gaps.md for iteration during handoff.

REVIEW GATE — skip Tiers 4-5 when ALL of these are true:
  - Diff is small (under ~20 lines)
  - Change is mechanical (typo, config, formatting)
  - No logic, control flow, or UI changes

===================================================================
STEP 6: EXPLORATORY SMOKE TEST (optional)
===================================================================

$exploratory_section

===================================================================
STEP 7: HARDEN (if time allows)
===================================================================

If mutation testing is available and time allows:
1. Run ${MUTATE_CMD:-skip} on files touched by this task
2. Kill survivors by adding targeted tests
3. Target: >= 95% mutation score on touched files

If coverage tooling is available:
1. Run ${COVERAGE_CMD:-skip}
2. Check CRAP scores on modified functions
3. Refactor any function with CRAP > 30

These are valuable but NEVER skip integration tests to do mutation testing.

===================================================================
STEP 8: FINAL COMMIT
===================================================================

Create a final commit with a detailed message for human review.
(Progressive wip commits from Step 4 are already in history.)

Subject: feat|fix(scope): short description
Body:
- What was implemented and why
- What spec/bug this addresses
- Key design decisions
- Test distribution: N integration, N unit, N E2E
- Eval results: judges passed/failed, codex findings
- Anything the reviewer should pay attention to

Mark the task as done:
- If from BUGS.md: check it off (- [x])
- If a spec file: add a "Status: DONE — nightshift $RUN_ID" line at the top

Update docs if the project has a "Keeping docs current" section in CLAUDE.md.

===================================================================
STEP 9: LOG
===================================================================

1. Append to $RUN_DIR/progress.md:
   ## [NIGHTSHIFT] HH:MM — SPEC/BUG: title
   Files: [files] | Integration: +N | Unit: +N | E2E: +N | Commits: [shas]
   Eval: static ok | tests ok | judges ok | codex: N findings

2. If you noticed anything unrelated (bugs, code smells, broken things),
   append to $NIGHTSHIFT_DIR/NOTICED.md with details.

3. If you learned something useful for future runs, append to
   $NIGHTSHIFT_DIR/lessons.md.

4. If codex review found eval gaps, append to $NIGHTSHIFT_DIR/eval-gaps.md:
   ## <task-name> — <date>
   - <gap description> — recommended: <hook|test|judge>

===================================================================
STEP 10: NEXT TASK OR WRAP UP
===================================================================

If there are more tasks AND time remains: loop back to STEP 1.
If backlog is empty OR time is up: proceed to STEP 11.

===================================================================
STEP 11: MORNING BRIEFING
===================================================================

Write $NIGHTSHIFT_DIR/MORNING.md following the template in:
$SKILL_DIR/references/morning-briefing.md

Include in the briefing:
- Eval results per task (which tiers passed/failed, judge scores)
- Eval gaps discovered (from $NIGHTSHIFT_DIR/eval-gaps.md)
- Recommended eval surface improvements for next run

Also append to $NIGHTSHIFT_DIR/CHANGELOG.md:

## $RUN_ID
- [list of changes, one line each]

Then output: <promise>COMPLETE</promise>

===================================================================
SIGNALS
===================================================================

- All tasks done: <promise>COMPLETE</promise>
- Cannot proceed: <promise>BLOCKED:reason</promise>
- Need human: <promise>DECIDE:question</promise>
PROMPT
}

AGENT_PROMPT="$(build_prompt)"

# ─── Cleanup ──────────────────────────────────────────────────────────────────

cleanup() {
  echo ""
  echo "========================================================"
  echo "  Nightshift ending..."
  echo "========================================================"

  stop_codex_reviewer

  END_TIME="$(date '+%Y-%m-%d %H:%M')"
  echo "" >> "$RUN_DIR/progress.md"
  echo "---" >> "$RUN_DIR/progress.md"
  echo "Started: $START_TIME · Ended: $END_TIME" >> "$RUN_DIR/progress.md"

  echo ""
  echo "Nightshift complete."
  echo "  Morning briefing: $NIGHTSHIFT_DIR/MORNING.md"
  echo "  Progress:         $RUN_DIR/progress.md"
  echo "  Noticed:          $NIGHTSHIFT_DIR/NOTICED.md"
  echo "  Lessons:          $NIGHTSHIFT_DIR/lessons.md"
  echo "  Eval gaps:        $NIGHTSHIFT_DIR/eval-gaps.md"
  echo "  Captures:         $NIGHTSHIFT_DIR/captures/"
}
trap cleanup EXIT

# ─── Launch ───────────────────────────────────────────────────────────────────

echo "╔══════════════════════════════════════════════════════╗"
echo "║              NIGHTSHIFT DISPATCHER                  ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║  Project:     $PROJECT_ROOT"
echo "║  Platform:    $PLATFORM"
echo "║  Runtime:     $AGENT_RUNTIME"
echo "║  Pkg Manager: $PM"
echo "║  Duration:    ${DURATION:-unlimited}"
echo "║  Iterations:  $MAX_ITERATIONS"
echo "║  Run ID:      $RUN_ID"
echo "║  Skip Grill:  $SKIP_GRILL"
echo "║  Exploratory: $EXPLORATORY"
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

# Start legacy Codex reviewer if requested (deprecated — codex is now in eval stack)
start_codex_reviewer

# ─── Main Loop ────────────────────────────────────────────────────────────────

ITERATION=0
FAILURES=0
SIGIL_COMPLETE="<promise>COMPLETE</promise>"

while [[ "$ITERATION" -lt "$MAX_ITERATIONS" ]]; do
  ITERATION=$((ITERATION + 1))
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Nightshift Iteration $ITERATION / $MAX_ITERATIONS"
  echo "  $(date '+%Y-%m-%d %H:%M:%S')"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""

  PROMPT_FILE=$(mktemp)
  echo "$AGENT_PROMPT" > "$PROMPT_FILE"

  OUTPUT=""
  if [[ "$AGENT_RUNTIME" == "claude" ]]; then
    OUTPUT="$(cd "$PROJECT_ROOT" && env -u CLAUDECODE claude -p --dangerously-skip-permissions \
      --max-turns 80 \
      < "$PROMPT_FILE" 2>&1)" || true
  else
    OUTPUT="$(cd "$PROJECT_ROOT" && codex exec -C "$PROJECT_ROOT" \
      --dangerously-bypass-approvals-and-sandbox \
      "$(cat "$PROMPT_FILE")" 2>&1)" || true
  fi
  rm -f "$PROMPT_FILE"

  echo "$OUTPUT" >> "$RUN_DIR/logs/nightshift.log"

  # Show iteration summary from progress.md and heartbeat
  echo ""
  if [[ -f "$NIGHTSHIFT_DIR/HEARTBEAT" ]]; then
    echo "  HEARTBEAT: $(cat "$NIGHTSHIFT_DIR/HEARTBEAT")"
  fi
  # Show last progress entry (the latest ## header and its content)
  if [[ -f "$RUN_DIR/progress.md" ]]; then
    local last_entry
    last_entry="$(awk '/^## \[NIGHTSHIFT\]/{found=$0; content=""} found{content=content"\n"$0} END{print content}' "$RUN_DIR/progress.md" | tail -5)"
    if [[ -n "$last_entry" ]]; then
      echo "  PROGRESS:"
      echo "$last_entry" | sed 's/^/    /'
    fi
  fi
  echo ""

  # Check signals
  if echo "$OUTPUT" | grep -qF "$SIGIL_COMPLETE"; then
    echo ""
    echo "=== Nightshift complete! All tasks done. ==="
    break
  fi

  if echo "$OUTPUT" | grep -qF "<promise>BLOCKED:"; then
    echo ""
    echo "=== BLOCKED. Check logs. Sleeping 5 minutes before retry. ==="
    sleep 300
    continue
  fi

  if echo "$OUTPUT" | grep -qF "<promise>DECIDE:"; then
    echo ""
    echo "=== NEEDS HUMAN DECISION. Check logs. Sleeping 10 minutes. ==="
    sleep 600
    continue
  fi

  # Track empty output failures
  if [[ -z "$OUTPUT" ]]; then
    FAILURES=$((FAILURES + 1))
    echo "WARNING: Empty output (failure #$FAILURES)"
    if [[ "$FAILURES" -ge 3 ]]; then
      echo "ERROR: 3 consecutive failures, stopping"
      break
    fi
  else
    FAILURES=0
  fi

  # Brief pause between iterations
  sleep 10
done

echo ""
echo "=== Nightshift finished after $ITERATION iteration(s) ==="
