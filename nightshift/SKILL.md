---
name: nightshift
description: >
  Autonomous AFK development loop. Sequentially works through a specs/bugs backlog:
  prep → pick task → load spec → acceptance-test-first → implement → review personas →
  commit → morning briefing. Emphasis on real user-facing tests (Playwright, XCUITest,
  Detox). Use when going AFK — lunch, gym, overnight, weekend. Optionally provide
  duration so the agent can scope work accordingly.
---

# Nightshift

Autonomous sequential development loop for AFK sessions. Works through your
specs and bugs backlog one task at a time, fully completing each before moving
on. Prioritizes acceptance testing — every feature must be verified from the
user's perspective before it ships.

## When to use Nightshift vs Swarm

| | Nightshift | Swarm |
|---|---|---|
| **Goal** | Ship spec'd features, fix bugs | Harden codebase quality |
| **Agents** | 1 sequential, no worktrees | 4 parallel in worktrees |
| **Testing focus** | Acceptance-first (E2E) | Coverage + mutation + CRAP |
| **Review** | Persona-based critique | Metric-driven quality agents |
| **Best for** | "Build these features while I'm away" | "Make the codebase healthier" |

Use **Nightshift** when you have specs ready and want features shipped.
Use **Swarm** when the codebase needs quality hardening across the board.
They compose well: run Nightshift to ship features, then Swarm to harden.

## Prerequisites

### Configuration (optional)

Nightshift can persist project-specific settings in a config file so you don't have to answer the same setup questions every run.

**Location:** `${CLAUDE_PLUGIN_DATA}/nightshift/config.json` (stable across skill upgrades)

```json
{
  "defaultBranch": "main",
  "backlogPath": "docs/BUGS.md",
  "specPath": "docs/product-specs/",
  "duration": "8 hours",
  "testFramework": "playwright",
  "simulatorDevice": "iPhone 16",
  "deployAfterMerge": false,
  "feedbackCommands": {
    "test": "pnpm test",
    "typecheck": "pnpm typecheck",
    "lint": "pnpm lint",
    "e2e": "pnpm test:e2e"
  }
}
```

If the config file doesn't exist, the skill runs the interactive setup (Phase 1) and offers to save the answers. On subsequent runs, it loads the config and confirms: "Using saved config — press Enter to continue or type 'reset' to reconfigure."

### Project documentation structure

Nightshift follows your existing docs/ convention. It discovers specs using the
project's CLAUDE.md knowledge base table, then looks in standard locations:

```
docs/                              ← or .plans/ (both supported)
  product-specs/
    user-login.md                  ← agent will pick this up
    push-notifications.md          ← agent will pick this up
    draft-checkout.md              ← agent ignores draft-* files
  acceptance/
    index.md                       ← TOC of .feature files
    user-login.feature             ← Gherkin acceptance criteria
  exec-plans/                      ← active execution plans
  adrs/                            ← architectural decision records
  lessons.md                       ← cross-run learnings
  BUGS.md                          ← optional bug backlog
```

**Spec discovery order:**
1. Read CLAUDE.md knowledge base table for doc locations
2. Look in `docs/product-specs/` (or `docs/specs/`, `.plans/`)
3. Look for standalone `SPEC.md` or `spec/SPEC.md`
4. Fall back to any `*.md` in `docs/` that looks like a spec

Name files `draft-*` while you're still writing them. The agent only works
on non-draft specs. Remove the `draft-` prefix when the spec is ready.

### Bugs (optional)

Bugs are always worked before feature specs. The agent checks for bugs in
this priority order:

1. `docs/BUGS.md` — a checklist of known bugs
2. Linear issues — if the project uses Linear (detected from CLAUDE.md)
3. `specs/BUGS.md` or `.plans/BUGS.md` — alternative locations

Format for `BUGS.md`:

```markdown
# Bugs

- [ ] Login button unresponsive on iPad landscape — see screenshot in docs/assets/
- [ ] Push notification sound plays twice on iOS 18
- [x] Already fixed bug (agent skips these)
```

### Gherkin acceptance specs (optional but recommended)

If the project has `docs/acceptance/*.feature` files, the agent uses them
as the source of truth for acceptance test behavior. These Gherkin specs
pair with the E2E tests (Playwright/XCUITest/Detox) that nightshift writes.

When a spec references acceptance criteria, the agent checks for a matching
`.feature` file and uses it to drive test writing.

### Acceptance test infrastructure

Nightshift requires a working E2E test setup. The agent writes acceptance
tests FIRST (before implementation), runs them to confirm red, implements,
then confirms green. Without a working test harness, the loop will block.

| Platform | Framework | Detection |
|----------|-----------|-----------|
| **Web** | Playwright | `test:e2e` or `e2e` in package.json, or `playwright.config.*` |
| **iOS (Swift)** | XCUITest | `*.xcodeproj` or `*.xcworkspace` with UI test targets |
| **React Native** | Detox | `detox` in package.json deps, `.detoxrc.js` or `detox.config.js` |

The agent auto-detects which framework to use based on the project.

## Git rules

**NEVER commit `.nightshift/` to git.** It is local working state, not project documentation.
During prep, ensure `.nightshift/` is in the project's `.gitignore`. If no `.gitignore` exists,
create one. All deliverables (docs, ADRs, code, tests) go in `docs/` and `src/` — not `.nightshift/`.

When committing nightshift results, only stage: `src/`, `docs/`, project config files, and `.gitignore`.

## Gotchas

- **Never commit `.nightshift/` to git.** It is local working state. Ensure it's in `.gitignore` before starting.
- **Verify E2E tests actually EXECUTE, not just compile.** A common failure mode: Detox tests are written but never ran in a simulator. The agent must boot the simulator and run the tests — not just check that the test files parse.
- **Check the deployed URL after merging.** Code merged to main doesn't mean it's deployed. Verify CI/CD actually ran the deploy step.
- **Don't assume test pass = feature works.** If tests don't cover the actual user flow end-to-end, they can pass while the feature is broken. Prefer Playwright/Detox acceptance tests over unit tests for verification.
- **Simulator conflicts with parallel runs.** If running nightshift while a swarm is also using simulators, they'll fight over the default simulator. Use named simulators (see expo-testing skill).
- **Duration estimates are just estimates.** Don't start a large spec 30 minutes before the estimated return. Reserve wrap-up time for the morning briefing.
- **Read `lessons.md` before starting.** Previous runs captured failure patterns. Ignoring them means repeating mistakes.

## On-Demand Hooks

Nightshift registers session-scoped hooks that activate when the skill is invoked and last for the duration of the session. These prevent common AFK mistakes.

### Registered hooks

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "command": "echo \"$TOOL_INPUT\" | grep -qE '(rm -rf|git push --force|git reset --hard|DROP TABLE|kubectl delete)' && echo 'BLOCK: Destructive command blocked during nightshift. Use explicit confirmation.' || true"
      },
      {
        "matcher": "Bash",
        "command": "echo \"$TOOL_INPUT\" | grep -qE 'git add \\.' && echo 'BLOCK: Use specific file paths instead of git add . during nightshift to avoid committing .nightshift/ files.' || true"
      }
    ]
  }
}
```

These hooks:
- **Block destructive commands** (rm -rf, force-push, hard reset, DROP TABLE) during unattended runs
- **Block `git add .`** to prevent accidentally committing `.nightshift/` working state

## Workflow

```
Phase 1: PREP (interactive, ~2 minutes)
  ├── Discover spec locations from CLAUDE.md + docs/ structure
  ├── Detect platform + test framework
  ├── Confirm feedback commands (test, typecheck, lint, e2e)
  ├── Ensure .nightshift/ is in .gitignore
  ├── Optional: user provides duration estimate
  └── User confirms → agent takes over

Phase 2: LOOP (AFK, autonomous)
  ├── 0. Clean working tree (stash or commit uncommitted work)
  ├── 1. Run full test suite — fix any failures before starting new work
  ├── 2. Pick next task: BUGS.md first, then oldest non-draft spec from docs/
  ├── 3. Load spec + relevant project docs
  ├── 4. Write acceptance tests FIRST (Playwright/XCUITest/Detox)
  ├── 5. Run acceptance tests → confirm RED
  ├── 6. Write unit/integration tests for key logic
  ├── 7. Implement (TDD red-green-refactor for units, then acceptance green)
  ├── 8. Run all feedback commands (test, typecheck, lint)
  ├── 9. Run review in PARALLEL (5 persona sub-agents + codex review)
  ├── 10. Fix issues from ALL reviewers, re-run feedback commands
  ├── 11. Run full test suite (regression check)
  ├── 12. Commit with detailed message for human review
  ├── 13. Capture unrelated observations → NOTICED.md
  ├── 14. Loop to step 2 for next task
  └── 15. Write morning briefing when done or time's up

Phase 3: HANDOFF (waiting for human)
  └── Morning briefing in .nightshift/MORNING.md
```

## Duration Awareness

If the user provides a duration ("I'll be gone 2 hours", "overnight",
"back Monday"), the agent uses it to:

- **Scope work**: Don't start a large spec if there's only 30 minutes left
- **Reserve wrap-up time**: Stop picking new tasks ~15 minutes before the
  estimated return to write the morning briefing and ensure clean state
- **Prioritize**: With limited time, pick the highest-impact task

Duration is optional. Without it, the agent works until the backlog is empty.

## Directory Structure

```
.nightshift/
  MORNING.md              ← Morning briefing for human review
  NOTICED.md              ← Unrelated issues the agent observed
  CHANGELOG.md            ← Cumulative changelog entries
  lessons.md              ← Persists across runs (agent-written)
  runs/
    2026-03-15T22-00/
      progress.md         ← Task-by-task log for this run
      logs/
        nightshift.log    ← Full agent output
```

## Acceptance Testing Strategy

The agent writes acceptance tests BEFORE implementation. These tests exercise
the feature from the user's perspective — not unit-level mocks.

### Web (Playwright)

```typescript
// specs says: "user can reset password via email link"
test('password reset flow', async ({ page }) => {
  await page.goto('/login');
  await page.click('text=Forgot password?');
  await page.fill('[name=email]', 'user@example.com');
  await page.click('text=Send reset link');
  await expect(page.locator('.success-message')).toContainText('Check your email');
});
```

### iOS (XCUITest)

```swift
// specs says: "user can add item to cart from product detail"
func testAddToCartFromProductDetail() throws {
  let app = XCUIApplication()
  app.launch()
  app.cells["product-hiking-boots"].tap()
  app.buttons["Add to Cart"].tap()
  XCTAssertTrue(app.badges["cart-badge"].exists)
  XCTAssertEqual(app.badges["cart-badge"].label, "1")
}
```

### React Native (Detox)

```typescript
// specs says: "child can tap Play and hear the character speak"
it('should start a voice session when Play is tapped', async () => {
  await element(by.id('play-button')).tap();
  await expect(element(by.id('session-screen'))).toBeVisible();
  await expect(element(by.id('character-avatar'))).toBeVisible();
  await waitFor(element(by.id('debug-state-overlay')))
    .toHaveText(expect.stringContaining('state:greeting'))
    .withTimeout(5000);
});
```

The agent reads the spec to understand what the user should experience, then
writes tests that verify exactly that. Implementation follows the tests.

## Review Personas + Codex Review

After implementation, the agent runs ALL reviewers in parallel:

- 5 Claude persona sub-agents (each critiques the diff from their perspective)
- 1 Codex review (cross-agent review from a different model)

| Reviewer | Focus | Owns |
|----------|-------|------|
| **User Advocate** | "Does this actually work from a user's perspective?" | Specs, acceptance tests |
| **Architect** | "Does this fit the system? Any coupling concerns?" | Architecture docs, AGENTS.md |
| **Domain Expert** | "Is the domain logic correct? Edge cases?" | Domain-specific docs |
| **Code Quality** | "Is this clean, simple, well-tested?" | CLAUDE.md conventions |
| **Platform Expert** | "Any platform-specific gotchas?" | Platform docs, gotchas |
| **Codex (cross-agent)** | Fresh-eyes review from a different model | Correctness, security, missed edge cases |

### Running Codex review

Launch `codex review` in parallel with the 5 persona sub-agents:

```bash
codex review --uncommitted \
  -c model="gpt-5.4" \
  -c model_reasoning_effort="xhigh" \
  2>&1 | tee .nightshift/codex-review.md
```

After all 6 reviewers return, read `.nightshift/codex-review.md` and synthesize
findings alongside the persona results. Codex findings follow the same triage:
fix real issues, note false positives (Codex lacks CLAUDE.md context), flag
anything needing human input.

### Convergence

Each persona returns: APPROVE, REQUEST_CHANGES (with specifics), or FLAG
(noticed something worth mentioning but not blocking). The agent iterates
until all persona reviewers approve. Codex findings are addressed but don't
block — they're treated as an additional signal, not a gate.

See [references/review-personas.md](references/review-personas.md) for full
persona prompts. See the [codex-review skill](../codex-review/SKILL.md) for
CLI details and gotchas.

## Morning Briefing

`.nightshift/MORNING.md` is written for YOU, the human. It's designed to be
read in 2 minutes over coffee:

```markdown
# Morning Briefing — 2026-03-15

## Summary
Completed 3 tasks. 1 bug fix, 2 features. All tests green.

## What was done
1. **BUG: Push notification plays twice** — Fixed race condition in
   notification handler. Added Detox test. Commit: a1b2c3d
2. **SPEC: User login flow** — Email/password login with validation.
   Playwright tests cover happy path + error states. Commit: e4f5g6h
3. **SPEC: Password reset** — Email-based reset flow. Playwright tests
   cover full flow. Commit: i7j8k9l

## What needs your attention
- Password reset email template is placeholder — needs real copy
- Login error messages may need UX review (currently generic)

## What I noticed (unrelated)
- The checkout page has a broken image on mobile (see NOTICED.md)
- `utils/format.ts` has a function with CRAP score 45

## Test results
- Unit: 142 passing
- E2E: 28 passing (3 new)
- Typecheck: clean
- Lint: clean
```

## Post-AFK Recovery

When a new session starts in a project that has a `.nightshift/` directory with a recent `MORNING.md`, automatically present the briefing.

### Auto-detection

At session start, check:
1. Does `.nightshift/MORNING.md` exist?
2. Was it written within the last 24 hours? (check file mtime)
3. Has the user already seen it in this session?

If yes to 1 and 2, and no to 3, present the briefing immediately:

```
Good morning! Nightshift ran last night. Here's the briefing:

[contents of MORNING.md]

Ready to review commits? Run `git log --oneline -10` to see what was done.
```

### Recovery commands

When the user asks "where are we?" or "how did it go?", check these in order:

1. `.nightshift/MORNING.md` — the human-readable summary
2. `.nightshift/runs/<latest>/progress.md` — detailed task-by-task log
3. `.nightshift/NOTICED.md` — unrelated issues observed
4. `.nightshift/CHANGELOG.md` — cumulative changelog
5. `git log --oneline -20` — what was committed
6. `git diff HEAD~5..HEAD --stat` — scope of changes

Present the morning briefing first, then offer to dive deeper into any area.

### What to preserve during compaction

If the context window is being compacted mid-recovery, preserve:
- File paths being discussed
- Test results (pass/fail counts)
- Any failed or blocked tasks
- Architecture decisions made during the run
- Contents of progress.md

## Launching

### Interactive setup (recommended)

Tell Claude Code: "Let's set up nightshift" or "/nightshift"

The skill will:
1. Read CLAUDE.md to discover docs structure and spec locations
2. Detect platform and test framework
3. Confirm feedback commands
4. Ask for duration estimate (optional)
5. Launch the loop

### Direct script execution

```bash
chmod +x ~/src/skills/nightshift/scripts/nightshift.sh

env -u CLAUDECODE ~/src/skills/nightshift/scripts/nightshift.sh \
  --project /path/to/your-repo \
  [--duration "4 hours"] \
  [--iterations 15] \
  [--agent claude]
```

## References

| Topic | Source | Load When |
|-------|--------|-----------|
| **Review personas** | [references/review-personas.md](references/review-personas.md) | Step 9 — reviewing implementation |
| **Acceptance patterns** | [references/acceptance-testing.md](references/acceptance-testing.md) | Step 4 — writing acceptance tests |
| **Morning briefing template** | [references/morning-briefing.md](references/morning-briefing.md) | Step 15 — writing handoff |
