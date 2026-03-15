#!/bin/bash
set -uo pipefail
# NOTE: no `set -e` — we don't want one failed iteration to kill the loop

# ─── nightshift.sh ────────────────────────────────────────────────────────────
# Autonomous sequential development loop. Works through specs/bugs one at a
# time with acceptance-test-first development.
#
# Usage:
#   nightshift.sh --project /path/to/repo [--duration "4 hours"] \
#                 [--iterations 20] [--agent claude]
# ──────────────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"

PROJECT_ROOT=""
DURATION=""
MAX_ITERATIONS="${MAX_ITERATIONS:-20}"
AGENT_RUNTIME="${AGENT_RUNTIME:-claude}"
CODEX_REVIEWER="${CODEX_REVIEWER:-false}"

# ─── Parse Arguments ──────────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project)     PROJECT_ROOT="$2"; shift 2 ;;
    --duration)    DURATION="$2"; shift 2 ;;
    --iterations)  MAX_ITERATIONS="$2"; shift 2 ;;
    --agent)       AGENT_RUNTIME="$2"; shift 2 ;;
    --with-codex)  CODEX_REVIEWER="true"; shift ;;
    *)
      echo "Usage: $0 --project /path [--duration '4 hours'] [--iterations N] [--agent claude] [--with-codex]"
      exit 1
      ;;
  esac
done

if [[ -z "$PROJECT_ROOT" ]]; then
  echo "Usage: $0 --project /path [--duration '4 hours'] [--iterations N] [--agent claude] [--with-codex]"
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

# ─── Setup Directories ───────────────────────────────────────────────────────

mkdir -p "$RUN_DIR/logs"

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

# Initialize progress.md for this run
cat > "$RUN_DIR/progress.md" <<EOF
# Nightshift Progress — $RUN_ID

Platform: $PLATFORM
Duration hint: ${DURATION:-none}

EOF

# ─── Ensure .nightshift/ in .gitignore ────────────────────────────────────────

GITIGNORE="$PROJECT_ROOT/.gitignore"
if [[ -f "$GITIGNORE" ]] && ! grep -q '\.nightshift/' "$GITIGNORE" 2>/dev/null; then
  echo "" >> "$GITIGNORE"
  echo "# Nightshift agent data" >> "$GITIGNORE"
  echo ".nightshift/" >> "$GITIGNORE"
elif [[ ! -f "$GITIGNORE" ]]; then
  echo ".nightshift/" > "$GITIGNORE"
fi

# ─── Codex Reviewer ──────────────────────────────────────────────────────────

start_codex_reviewer() {
  if [[ "$CODEX_REVIEWER" != "true" ]]; then
    return
  fi

  echo "Starting Codex reviewer agent..."

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
  local personas_ref="$SKILL_DIR/references/review-personas.md"

  cat <<PROMPT
@CLAUDE.md

You are the Nightshift agent. You work autonomously through the project's
specs and bugs backlog, one task at a time, with acceptance-test-first development.

PLATFORM: $PLATFORM
PACKAGE MANAGER: $PM
DURATION: ${DURATION:-unlimited (work until backlog is empty)}
RUN DIRECTORY: $RUN_DIR

COMMANDS:
  Test:      ${TEST_CMD:-not detected}
  Typecheck: ${TYPECHECK_CMD:-not detected}
  Lint:      ${LINT_CMD:-not detected}
  E2E:       ${E2E_CMD:-not detected}
  Mutate:    ${MUTATE_CMD:-not detected}
  Coverage:  ${COVERAGE_CMD:-not detected}

LESSONS FROM PRIOR RUNS: Read $NIGHTSHIFT_DIR/lessons.md before starting.

$(if [[ "$CODEX_REVIEWER" == "true" ]]; then
  echo "CODEX REVIEWER: Another agent is reviewing your commits. Check"
  echo "$NIGHTSHIFT_DIR/CODEX_REVIEW.md periodically for feedback and"
  echo "incorporate it into subsequent work."
fi)

═══════════════════════════════════════════════════════════════════════
STEP 0: PREP
═══════════════════════════════════════════════════════════════════════

1. Read $NIGHTSHIFT_DIR/lessons.md for context from prior runs.
2. Check for uncommitted changes:
   - If there are changes that look like work-in-progress, commit them:
     "wip: save uncommitted work before nightshift"
   - If there are changes that look accidental, stash them:
     git stash push -m "nightshift-prep-$RUN_ID"
3. Run the full test suite (${TEST_CMD:-skip if no test command}).
   Fix any failures before proceeding. If you cannot fix a failure,
   log it to $RUN_DIR/progress.md and continue.
4. Run E2E tests if available (${E2E_CMD:-skip if no e2e command}).
   Fix any failures. Log any you cannot fix.

═══════════════════════════════════════════════════════════════════════
STEP 1: PICK TASK
═══════════════════════════════════════════════════════════════════════

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

═══════════════════════════════════════════════════════════════════════
STEP 2: LOAD CONTEXT
═══════════════════════════════════════════════════════════════════════

1. Read the spec/bug description thoroughly.
2. Read CLAUDE.md's knowledge base table — load docs relevant to this task.
   Follow progressive disclosure: only load the docs you need, not all of them.
3. If docs/acceptance/ has a .feature file matching this spec, read it for
   Gherkin acceptance criteria.
4. Check AGENTS.md (if it exists) for additional documentation pointers.
5. Read relevant source code and existing tests.
6. Read $RUN_DIR/progress.md for what's been done this run.

═══════════════════════════════════════════════════════════════════════
STEP 3: WRITE ACCEPTANCE TESTS (MOST IMPORTANT STEP)
═══════════════════════════════════════════════════════════════════════

This is the most critical step. Read the acceptance testing reference:
$acceptance_ref

1. Extract every user-visible behavior from the spec.
2. Write one acceptance test per behavior using the project's E2E framework:
   - Web: Playwright (semantic selectors, real user flows)
   - iOS Swift: XCUITest (accessibility identifiers, waitForExistence)
   - React Native: Detox (testID props, waitFor with timeout)
3. Run the acceptance tests. They MUST fail (red). If any pass, the
   feature already exists or the test is wrong.
4. If the test framework isn't set up, set it up. This is a blocking
   requirement — do not skip acceptance tests.

═══════════════════════════════════════════════════════════════════════
STEP 4: WRITE UNIT/INTEGRATION TESTS
═══════════════════════════════════════════════════════════════════════

For key business logic in the spec, write unit tests (TDD style):
1. Write failing test (red)
2. Implement minimal code (green)
3. Refactor

These complement acceptance tests. Acceptance tests prove the feature
works for users. Unit tests prove the logic is correct.

═══════════════════════════════════════════════════════════════════════
STEP 5: IMPLEMENT
═══════════════════════════════════════════════════════════════════════

1. Implement the feature to make all tests pass.
2. Follow the project's conventions (read CLAUDE.md).
3. Keep it simple. Don't over-engineer.
4. All interactive UI elements must have testID/accessibilityIdentifier.

═══════════════════════════════════════════════════════════════════════
STEP 6: VERIFY
═══════════════════════════════════════════════════════════════════════

Run ALL feedback commands and fix any issues:

1. ${TEST_CMD:-skip} (unit tests — must pass)
2. ${TYPECHECK_CMD:-skip} (type safety — must be clean)
3. ${LINT_CMD:-skip} (code style — must be clean)
4. ${E2E_CMD:-skip} (acceptance + regression — must pass)

ALL must be green before proceeding. Iterate until they are.

═══════════════════════════════════════════════════════════════════════
STEP 7: REVIEW (sub-agents)
═══════════════════════════════════════════════════════════════════════

Read $personas_ref for the full persona prompts.

Spawn 5 sub-agent reviewers. Pass each:
- The git diff (git diff HEAD~1)
- The spec being implemented
- The docs they own

Reviewers:
1. User Advocate — does this match the spec from the user's perspective?
2. Architect — does this fit the system?
3. Domain Expert — is the domain logic correct?
4. Code Quality — is this clean and well-tested?
5. Platform Expert — any platform-specific gotchas?

If any reviewer returns REQUEST_CHANGES:
- Fix the issues
- Re-run feedback commands (Step 6)
- Re-run ALL reviewers
- Loop until all approve

═══════════════════════════════════════════════════════════════════════
STEP 8: FULL REGRESSION
═══════════════════════════════════════════════════════════════════════

Run the ENTIRE test suite one final time:
- ${TEST_CMD:-skip}
- ${E2E_CMD:-skip}

This catches any regressions from the implementation. Fix any failures.

═══════════════════════════════════════════════════════════════════════
STEP 9: HARDEN (if time allows)
═══════════════════════════════════════════════════════════════════════

If mutation testing is available and time allows:
1. Run ${MUTATE_CMD:-skip} on files touched by this task
2. Kill survivors by adding targeted tests
3. Target: ≥ 95% mutation score on touched files

If coverage tooling is available:
1. Run ${COVERAGE_CMD:-skip}
2. Check CRAP scores on modified functions
3. Refactor any function with CRAP > 30

These are valuable but NEVER skip acceptance tests to do mutation testing.

═══════════════════════════════════════════════════════════════════════
STEP 10: COMMIT
═══════════════════════════════════════════════════════════════════════

Commit with a detailed message designed for human review:

Subject: feat|fix(scope): short description
Body:
- What was implemented and why
- What spec/bug this addresses
- Key design decisions
- What the acceptance tests verify
- Anything the reviewer should pay attention to

Mark the task as done:
- If from BUGS.md: check it off (- [x])
- If a spec file: add a "Status: DONE — nightshift $RUN_ID" line at the top

Update docs if the project has a "Keeping docs current" section in CLAUDE.md:
- If you changed a feature's behavior → update the relevant product spec
- If you added a feature → add/update the .feature file in docs/acceptance/
- If you made a structural decision → note it for a future ADR

═══════════════════════════════════════════════════════════════════════
STEP 11: LOG
═══════════════════════════════════════════════════════════════════════

1. Append to $RUN_DIR/progress.md:
   ## [NIGHTSHIFT] HH:MM — SPEC/BUG: title ✅
   Files: [files] · Acceptance: +N · Unit: +N · Commit: [sha]

2. If you noticed anything unrelated (bugs, code smells, broken things),
   append to $NIGHTSHIFT_DIR/NOTICED.md with details.

3. If you learned something useful for future runs, append to
   $NIGHTSHIFT_DIR/lessons.md.

═══════════════════════════════════════════════════════════════════════
STEP 12: NEXT TASK OR WRAP UP
═══════════════════════════════════════════════════════════════════════

If there are more tasks AND time remains: loop back to STEP 1.
If backlog is empty OR time is up: proceed to STEP 13.

═══════════════════════════════════════════════════════════════════════
STEP 13: MORNING BRIEFING
═══════════════════════════════════════════════════════════════════════

Write $NIGHTSHIFT_DIR/MORNING.md following the template in:
$SKILL_DIR/references/morning-briefing.md

Also append to $NIGHTSHIFT_DIR/CHANGELOG.md:

## $RUN_ID
- [list of changes, one line each]

Then output: <promise>COMPLETE</promise>

═══════════════════════════════════════════════════════════════════════
SIGNALS
═══════════════════════════════════════════════════════════════════════

- All tasks done: <promise>COMPLETE</promise>
- Cannot proceed: <promise>BLOCKED:reason</promise>
- Need human: <promise>DECIDE:question</promise>
PROMPT
}

AGENT_PROMPT="$(build_prompt)"

# ─── Cleanup ──────────────────────────────────────────────────────────────────

cleanup() {
  echo ""
  echo "════════════════════════════════════════════════════"
  echo "  Nightshift ending..."
  echo "════════════════════════════════════════════════════"

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
  if [[ "$CODEX_REVIEWER" == "true" ]]; then
    echo "  Codex reviews:    $NIGHTSHIFT_DIR/CODEX_REVIEW.md"
  fi
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
echo "║  Codex:       $CODEX_REVIEWER"
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

# Start Codex reviewer if requested
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

  echo "$OUTPUT" | tee -a "$RUN_DIR/logs/nightshift.log"

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
