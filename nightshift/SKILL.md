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

## Workflow

```
Phase 1: PREP (interactive, ~2 minutes)
  ├── Discover spec locations from CLAUDE.md + docs/ structure
  ├── Detect platform + test framework
  ├── Confirm feedback commands (test, typecheck, lint, e2e)
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
  ├── 9. Run review personas (sub-agents critique the diff)
  ├── 10. Fix issues from review, re-run feedback commands
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

## Review Personas

After implementation, the agent spawns sub-agents as reviewers. Each persona
critiques the diff from their own perspective and owns specific documentation.

| Persona | Focus | Owns |
|---------|-------|------|
| **User Advocate** | "Does this actually work from a user's perspective?" | Specs, acceptance tests |
| **Architect** | "Does this fit the system? Any coupling concerns?" | Architecture docs, AGENTS.md |
| **Domain Expert** | "Is the domain logic correct? Edge cases?" | Domain-specific docs |
| **Code Quality** | "Is this clean, simple, well-tested?" | CLAUDE.md conventions |
| **Platform Expert** | "Any platform-specific gotchas?" | Platform docs, gotchas |

Each reviewer returns: APPROVE, REQUEST_CHANGES (with specifics), or FLAG
(noticed something worth mentioning but not blocking). The agent iterates
until all reviewers approve.

See [references/review-personas.md](references/review-personas.md) for full
persona prompts.

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
