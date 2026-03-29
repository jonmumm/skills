---
name: nightshift
description: >
  Autonomous AFK development loop. Sequentially works through a specs/bugs backlog:
  grill-me preflight → evals-first surface → pick task → testing-trophy TDD →
  progressive commits → eval stack (hooks → integration → e2e + screenshots →
  LLM judges → codex review) → commit → morning briefing. Use when going AFK —
  lunch, gym, overnight, weekend. Optionally provide duration so the agent can
  scope work accordingly.
---

# Nightshift

Autonomous sequential development loop for AFK sessions. Works through your
specs and bugs backlog one task at a time, fully completing each before moving
on. Uses the testing trophy (integration-heavy) for test strategy, evals-first
for quality gates, and progressive commits to reduce blast radius.

## When to use Nightshift vs Swarm

| | Nightshift | Swarm |
|---|---|---|
| **Goal** | Ship spec'd features, fix bugs | Harden codebase quality |
| **Agents** | 1 sequential, no worktrees | 4 parallel in worktrees |
| **Testing focus** | Testing trophy (integration-heavy) + LLM judges | Coverage + mutation + CRAP |
| **Review** | Eval stack (hooks → tests → judges → codex) | Metric-driven quality agents |
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
Phase 1: PREFLIGHT (interactive, human present)
  ├── /grill-me — interrogate spec backlog for gaps and contradictions
  ├── /evals-first — define eval surface per project:
  │     ├── Hooks: lint, typecheck, custom domain rules (block commits)
  │     ├── Tests: testing-trophy distribution (70% integration, 15% unit, 15% e2e)
  │     ├── LLM judges: judge prompts for subjective criteria (design, UX, spec match)
  │     └── Classify each spec criterion into the strongest enforcement tier
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
  ├── 3. Load spec + relevant project docs + eval surface for this task
  ├── 4. Write tests (testing trophy):
  │     ├── Integration tests FIRST (~70%) — Storybook play, vitest-pool-workers, XCTest UI
  │     ├── Unit tests for complex pure logic (~15%)
  │     └── E2E tests for critical user journeys (~15%) — with screenshot capture
  ├── 5. Run tests → confirm RED
  ├── 6. Implement with progressive commits:
  │     ├── Commit each compiling milestone: wip(scope): description
  │     └── TDD red-green-refactor for each test slice
  ├── 7. Run eval stack:
  │     ├── Static: lint, typecheck, custom hooks (fast, blocking)
  │     ├── Integration tests (medium, blocking)
  │     ├── Unit tests (fast, blocking)
  │     ├── E2E tests + screenshot capture to .nightshift/captures/ (slow, blocking)
  │     ├── LLM judges: sub-agents evaluate screenshots + code vs spec (blocking)
  │     └── Codex review: cross-model "what did our evals miss?" (advisory)
  ├── 8. Fix issues, re-run eval stack until all blocking tiers pass
  ├── 9. Optional: exploratory Chrome MCP / simulator smoke test (advisory)
  ├── 10. Final commit with detailed message for human review
  ├── 11. Log: progress.md, NOTICED.md, lessons.md, eval gap log
  ├── 12. Loop to step 2 for next task
  └── 13. Write morning briefing + workflow feedback + eval iteration notes

Phase 3: HANDOFF (waiting for human)
  ├── Morning briefing in .nightshift/MORNING.md
  ├── Workflow feedback in .nightshift/WORKFLOW_FEEDBACK.md
  └── Eval iteration notes: recommended new hooks/tests/judges based on gaps
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
  eval-gaps.md            ← Gaps found by codex review (feeds eval iteration)
  eval-surface/
    judges/               ← LLM judge prompts (from /evals-first preflight)
  captures/
    <task-name>/
      <checkpoint>.png    ← Screenshots from E2E tests for LLM judges
  runs/
    2026-03-15T22-00/
      progress.md         ← Task-by-task log for this run
      codex-review.md     ← Codex review output for this run
      logs/
        nightshift.log    ← Full agent output
```

## Testing Strategy: Testing Trophy

Follow the testing trophy distribution. **Integration tests are the default.**
Only write E2E for critical user journeys. Only write unit tests for complex pure logic.

```
        🏆
      E2E Tests (~15%)      ← Few critical journeys + screenshot capture
    Integration Tests (~70%) ← MOST tests here — real behavior, real boundaries
   Unit Tests (~15%)         ← Complex pure logic only
 Static Analysis             ← TypeScript, ESLint, custom hooks (always on)
```

### Integration tests (the bulk of your work)

**Web — Storybook play functions:**
```typescript
export const ShowsCastAvailable: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = await canvas.findByRole('button', { name: /cast/i });
    await userEvent.click(button);
    await expect(canvas.getByText(/available/i)).toBeVisible();
  },
};
```

**Workers — vitest-pool-workers with real D1:**
```typescript
it("registers device end-to-end", async () => {
  const res = await SELF.fetch("https://api.test/api/v1/devices/register", {
    method: "POST",
    body: JSON.stringify({ ogsDeviceId: "device-1", platform: "ios" }),
  });
  expect(res.status).toBe(200);
  const row = await env.DB.prepare("SELECT * FROM devices WHERE ...").first();
  expect(row.push_token).toBeTruthy();
});
```

**iOS — XCTest UI tests:**
```swift
func testCastButtonShowsDevicePicker() throws {
  app.buttons["Create Game"].tap()
  app.buttons["Cast to TV"].tap()
  let picker = app.sheets["Select a device"]
  XCTAssertTrue(picker.waitForExistence(timeout: 3))
}
```

**React Native — Detox:**
```typescript
it('should start a voice session when Play is tapped', async () => {
  await element(by.id('play-button')).tap();
  await expect(element(by.id('session-screen'))).toBeVisible();
});
```

### E2E tests (~15%) — critical journeys + screenshot capture

E2E tests cover the few critical user journeys AND capture screenshots for
LLM judges. Add `page.screenshot()` at key checkpoints:

```typescript
// Web (Playwright) — E2E with screenshot capture
test('password reset flow', async ({ page }) => {
  await page.goto('/login');
  await page.click('text=Forgot password?');
  await page.screenshot({ path: '.nightshift/captures/password-reset/forgot-link.png' });

  await page.fill('[name=email]', 'user@example.com');
  await page.click('text=Send reset link');
  await page.screenshot({ path: '.nightshift/captures/password-reset/confirmation.png' });

  await expect(page.locator('.success-message')).toContainText('Check your email');
});
```

```swift
// iOS — XCUITest with screenshot capture
func testAddToCartFromProductDetail() throws {
  let app = XCUIApplication()
  app.launch()
  app.cells["product-hiking-boots"].tap()
  let screenshot1 = app.screenshot()
  let attachment1 = XCTAttachment(screenshot: screenshot1)
  attachment1.name = "product-detail"
  add(attachment1)

  app.buttons["Add to Cart"].tap()
  XCTAssertTrue(app.badges["cart-badge"].exists)
  let screenshot2 = app.screenshot()
  let attachment2 = XCTAttachment(screenshot: screenshot2)
  attachment2.name = "cart-added"
  add(attachment2)
}
```

```typescript
// React Native (Detox) — with screenshot capture
it('should show session screen after tapping Play', async () => {
  await element(by.id('play-button')).tap();
  await expect(element(by.id('session-screen'))).toBeVisible();
  await device.takeScreenshot('session-started');
});
```

### Unit tests (~15%) — pure logic only

Only for complex algorithms, parsers, scoring functions, state machine transitions.
**Don't mock what you own.** If you're tempted to mock a module you wrote, write
an integration test instead.

### Anti-patterns

- **Don't mock your own modules.** Mock external services (Stripe, Expo Push), not your code.
- **Don't write E2E for everything.** E2E is slow and brittle. Reserve for critical journeys.
- **Don't test implementation details.** Assert on what the user sees, not internal dispatch calls.
- **Don't snapshot entire components.** Targeted snapshots of specific states only.

## Eval Stack

After implementation, run the eval stack in order. Each tier must pass before
proceeding to the next. This replaces the previous persona-based review.

```
Tier 1: Static (fast, blocking)
  └── lint, typecheck, custom hooks

Tier 2: Integration tests (medium, blocking)
  └── Storybook play functions, vitest-pool-workers, XCTest UI, Detox

Tier 3: Unit tests (fast, blocking)
  └── Complex pure logic only

Tier 4: E2E tests + screenshot capture (slow, blocking)
  └── Critical user journeys
  └── Screenshots saved to .nightshift/captures/<task-name>/<checkpoint>.png

Tier 5: LLM judges (slow, blocking)
  └── Sub-agents evaluate screenshots + code against spec and judge prompts
  └── Each judge returns: PASS, FAIL (with reason), or SCORE

Tier 6: Codex review (advisory)
  └── Cross-model audit: "what did our evals miss?"
  └── Findings are addressed but don't block

Tier 7: Exploratory smoke test (optional, advisory)
  └── Web: Chrome MCP — navigate live app, freeform exploration
  └── iOS: Simulator — xcrun simctl screenshot, visual inspection
  └── React Native: Simulator/device screenshot capture
  └── Only runs if --exploratory flag is set
```

### LLM judges

LLM judges evaluate subjective criteria that code-based tests can't check:
visual quality, UX copy clarity, spec compliance, design hierarchy, etc.

Judge prompts are defined during preflight (`/evals-first` Phase 2-3) and
stored in `.nightshift/eval-surface/judges/`. Each judge is a sub-agent that
receives:
- Screenshots from `.nightshift/captures/` (captured during E2E tests)
- The spec being implemented
- The judge prompt (criteria to evaluate against)

**Platform-routed screenshot sources:**

| Platform | E2E captures screenshots via | Judge receives |
|---|---|---|
| Web (Playwright) | `page.screenshot({ path: '.nightshift/captures/...' })` | PNG files |
| iOS (XCUITest) | `XCTAttachment(screenshot: app.screenshot())` | Test attachments |
| React Native (Detox) | `device.takeScreenshot('name')` | Device screenshots |

Launch all judges in parallel (same pattern as the old persona approach):
```
Agent(description="Judge: Visual Quality", prompt="[judge prompt + screenshots + spec]")
Agent(description="Judge: UX Copy", prompt="[judge prompt + screenshots + spec]")
Agent(description="Judge: Spec Compliance", prompt="[judge prompt + screenshots + spec]")
```

Each judge returns a structured verdict:
```
<eval>PASS</eval>              — criterion met
<eval>FAIL: reason</eval>      — criterion failed, must fix
<eval>SCORE: 87</eval>         — numeric score (threshold in judge prompt)
```

If any blocking judge returns FAIL: fix the issue, re-run the full eval stack.

### Codex review

After all blocking tiers pass, run Codex as a cross-model audit. The specific
question is: **"what did our evals miss?"**

```bash
codex review --uncommitted \
  -c model="gpt-5.4" \
  -c model_reasoning_effort="xhigh" \
  2>&1 | tee .nightshift/codex-review.md
```

Codex findings are advisory. Fix real issues, note false positives (Codex lacks
CLAUDE.md context). Log any legitimate gaps in `.nightshift/eval-gaps.md` —
these feed back into eval surface iteration during handoff.

See the [codex-review skill](../codex-review/SKILL.md) for CLI details.

### Exploratory smoke test (optional)

When `--exploratory` is set, after the eval stack passes, run an unstructured
smoke test by driving the live application:

- **Web**: Chrome MCP — navigate the app, poke around, look for visual issues
- **iOS**: iOS Simulator — use `xcrun simctl` + screenshot, inspect UI
- **React Native**: Detox device or simulator, freeform navigation

This is a `/dogfood`-style check, not a structured eval. It catches things
that structured tests miss: broken images, layout glitches on odd viewports,
flows that "feel wrong." Findings go to NOTICED.md, not the eval gate.

### Review gate (when to skip eval tiers 5-7)

**Skip LLM judges + codex + exploratory when ALL of these are true:**
- Diff is small (roughly under 20 lines changed)
- Change is mechanical — typo fix, formatting, config change
- No logic, control flow, or data model changes
- No new UI surface

Static analysis + tests (tiers 1-4) always run. The subjective tiers (5-7)
are skipped only for trivial changes.

## Morning Briefing

`.nightshift/MORNING.md` is written for YOU, the human. It's designed to be
read in 2 minutes over coffee:

```markdown
# Morning Briefing — 2026-03-15

## Summary
Completed 3 tasks. 1 bug fix, 2 features. All eval tiers green.

## What was done
1. **BUG: Push notification plays twice** — Fixed race condition in
   notification handler. Added integration test. Commit: a1b2c3d
2. **SPEC: User login flow** — Email/password login with validation.
   Integration tests (Storybook play) + 1 E2E journey. Commits: e4f5g6h, i7j8k9l
3. **SPEC: Password reset** — Email-based reset flow. Integration tests +
   E2E with screenshot capture. Commits: m1n2o3p, q4r5s6t

## Eval results
- Static: clean (lint + typecheck)
- Integration: 38 passing (+12 new)
- Unit: 142 passing (+3 new)
- E2E: 28 passing (+3 new)
- LLM judges: all PASS (visual quality, UX copy, spec compliance)
- Codex review: 1 finding addressed, 1 false positive noted

## Eval gaps (improve for next run)
- Codex found missing error state for expired reset links — add judge criterion
- No integration test for concurrent login sessions — add to eval surface

## What needs your attention
- Password reset email template is placeholder — needs real copy

## What I noticed (unrelated)
- The checkout page has a broken image on mobile (see NOTICED.md)
- `utils/format.ts` has a function with CRAP score 45
```

## Workflow Feedback

At the end of each run, write `.nightshift/WORKFLOW_FEEDBACK.md` — meta-feedback
about how the *workflow itself* performed, not the code. This helps the human
improve the nightshift process over time.

```markdown
# Workflow Feedback — 2026-03-15

## What worked well
- Explore agent was effective for understanding unfamiliar subsystems
- Acceptance-test-first caught a regression that unit tests missed

## What felt wasteful
- Full peer review on 3 one-line display fixes added ~15 min with no findings
- Codex review flagged the same false positive on every task (project convention)

## Suggestions
- Consider adding "skip known false positive" config for codex review
- The spec for push-notifications was vague on error states — needed to guess

## Stats
- Tasks completed: 7
- Review skipped (trivial): 3
- Review findings addressed: 4
- False positives: 2
- Time estimate accuracy: estimated 6 hours, finished in 4.5
```

This file is separate from `MORNING.md` (which is about the code) and `lessons.md`
(which persists across runs for the agent). Workflow feedback is for the human
to tune the nightshift process — adjust the review gate, improve specs, update
gotchas, or refine the skill itself.

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
1. Run `/grill-me` to interrogate the spec backlog (unless `--skip-grill`)
2. Run `/evals-first` Phase 1-3 to define the eval surface
3. Read CLAUDE.md to discover docs structure and spec locations
4. Detect platform and test framework
5. Confirm feedback commands
6. Ask for duration estimate (optional)
7. Launch the loop

### Direct script execution

```bash
chmod +x ~/src/skills/nightshift/scripts/nightshift.sh

env -u CLAUDECODE ~/src/skills/nightshift/scripts/nightshift.sh \
  --project /path/to/your-repo \
  [--duration "4 hours"] \
  [--iterations 15] \
  [--agent claude] \
  [--skip-grill] \
  [--exploratory]
```

| Flag | Purpose |
|---|---|
| `--skip-grill` | Skip `/grill-me` preflight (for re-runs where specs are already vetted) |
| `--exploratory` | Enable Chrome MCP / simulator exploratory smoke test after eval stack |
| `--with-codex` | (Deprecated — codex review is now always part of the eval stack) |

## References

| Topic | Source | Load When |
|-------|--------|-----------|
| **Testing trophy** | [/testing-trophy skill](../testing-trophy/SKILL.md) | Step 4 — writing tests (integration-first) |
| **Evals-first** | [/evals-first skill](../evals-first/SKILL.md) | Phase 1 — building eval surface |
| **Acceptance patterns** | [references/acceptance-testing.md](references/acceptance-testing.md) | Step 4 — writing E2E tests with screenshot capture |
| **Morning briefing template** | [references/morning-briefing.md](references/morning-briefing.md) | Step 13 — writing handoff |
| **Codex review** | [/codex-review skill](../codex-review/SKILL.md) | Step 7 — cross-model eval audit |
| **Review personas (legacy)** | [references/review-personas.md](references/review-personas.md) | Optional fallback if no eval surface is defined |
