---
name: bug-bash
description: >
  Parallel e2e exploration blitz on a single app. Generates 6 charters with diverse
  testing postures (first-time user, power user, error paths, accessibility, edge cases,
  adversarial), launches them as concurrent `e2e explore` runs coordinated to avoid
  collision, merges and deduplicates findings, then verifies each with a failing test.
  Use for "bug bash", "bash the app", "explore everything", "find all the bugs",
  "QA blitz", "parallel exploration", or "e2e bug bash".
dependsOn:
  - jonmumm/skills@qa-agent
---

# bug-bash

Six explorers. One app. No collisions. One report.

```
You ──▶ /bug-bash
          │
          ├── 1. Charter generation (read the app, write 6 non-overlapping charters)
          │
          ├── 2. Parallel exploration (4 at a time, each in its own --output dir)
          │     ├── Explorer 1: first-time-user
          │     ├── Explorer 2: power-user
          │     ├── Explorer 3: error-paths
          │     ├── Explorer 4: edge-cases
          │     ├── Explorer 5: mobile / responsive
          │     └── Explorer 6: adversarial
          │
          ├── 3. Merge & dedupe (combine reports, rank by severity, drop dupes)
          │
          ├── 4. Verify each finding (write a failing test, confirm it fails)
          │
          └── 5. Single report (confirmed bugs, unverified, rejected, warnings)
```

## Prerequisites

- `e2e` installed in the project (`pnpm add -D e2e@latest ai @ai-sdk/openai`)
- `e2e.config.ts` with at least one target
- The app running (dev server, QA copy, or deployed URL)
- ChatGPT OAuth configured (`~/.config/e2e/oauth.json`) — never use an API key

## Rules

- **ChatGPT usage limit.** If any `e2e explore` run fails with a usage limit, stop
  the whole bash, report what completed, and tell the user. Never switch to an API key.
- **Prod is read-only.** If the target is `prod`, every charter gets context saying
  read-only: no sign-ups, no submissions, no rooms, nothing that writes.
- **Secrets stay secret.** Load from the environment or a secrets manager.
  Never print a credential value.
- **No collision.** Each explorer gets its own `--output` directory and its own
  charter. Charters must cover non-overlapping areas of the app.

## Step 1 — Understand the app

Read these in order, stopping when you have enough to write charters:

1. The project's `README.md`
2. `e2e.config.ts` — targets, agents, base URL
3. `qa/charters.yml` if it exists (qa-agent's charters — avoid duplicating their coverage)
4. `package.json` scripts and routes/pages structure
5. Any `docs/` or `CLAUDE.md` that describes user flows

Build a mental model of the app's surface area: pages, flows, roles, devices.

## Step 2 — Generate charters

Write exactly 6 charters, one per testing posture. Each charter is a one-sentence
goal that tells the explorer what to do and what to look for.

| # | Posture | Focus |
|---|---------|-------|
| 1 | **First-time user** | Onboarding, empty states, first interaction, discoverability |
| 2 | **Power user** | Advanced flows, shortcuts, bulk operations, settings |
| 3 | **Error paths** | Bad input, missing data, network failures, expired sessions |
| 4 | **Edge cases** | Boundary values, long strings, special characters, zero/max items |
| 5 | **Mobile / responsive** | Touch targets, viewport scaling, landscape/portrait, scroll |
| 6 | **Adversarial** | XSS attempts, URL manipulation, race conditions, auth bypass |

Adapt these to the specific app. A game needs different charters than a SaaS dashboard.

If `qa/charters.yml` exists, read it and adjust bug-bash charters to cover gaps
rather than re-testing the same flows. Reference the qa-agent charters by name
in the brief so explorers know what's already covered.

Save charters to `.bug-bash/<timestamp>/charters.yml`:

```yaml
run: "2026-10-06T14-30"
target: qa
concurrency: 4
charters:
  - id: first-time-user
    goal: "Sign up as a brand new user, complete onboarding, and try every first interaction. Report anything confusing, broken, or missing."
    agent: first-time-user
  - id: power-user
    goal: "..."
    agent: power-user
  # ... 6 total
```

## Step 3 — Launch parallel exploration

Run up to 4 explorers concurrently. Each gets its own output directory.

```bash
# Explorer N (run up to 4 of these at once)
pnpm exec e2e explore \
  --target <target> \
  --agent <posture> \
  --max-steps 10 \
  --timeout 600000 \
  --reporter json,markdown \
  --output .bug-bash/<timestamp>/explore-<id> \
  "<charter goal>"
```

Launch order: start explorers 1–4, then 5–6 as slots free up.

Each explorer writes to `.bug-bash/<timestamp>/explore-<id>/report.json`.

If an explorer exits with code 2 (config error) or 3 (model error), log the
error and move on — don't retry. If it exits with code 1 (findings), that's
expected. Exit 0 means no issues found.

### Multi-device apps (games with a TV and phones)

An explorer is one browser. For a room-based game, give each charter its own room with bots in
the other seats, playing their turns through the real UI, and point the explorer at the join URL
for the remaining seat (Run Set Jimmy: `e2e/bot-table.ts`, `scripts/bug-bash.sh`). Explorers
that don't know whose turn it is report "out-of-turn" moves that were really their own turn:
check those against the UI before believing them (and treat the confusion itself as a finding).

### Concurrency notes

- The app must handle concurrent sessions. Most dev servers do.
  If the app uses a single shared database state (like a game room),
  have each explorer create its own isolated session/room.
- Each explorer uses its own browser instance (e2e handles this).
- If the ChatGPT usage limit is hit mid-run, all remaining explorers
  are cancelled. Report what completed.

## Step 3b — Device matrix (always)

Explorers drive one viewport each, so they miss layout bugs on every other screen. Alongside the
explorers, run a **deterministic device sweep**: reach each key state of the app once, then
re-render it at every size in the matrix and check the layout in code. Details, device list and
the in-page checks: [references/device-matrix.md](references/device-matrix.md).

- **Sizes:** at least the Galaxy Fold (280 wide), a 360×640 Android, iPhone SE (375×667), iPhone
  15, Pro Max, a phone in landscape, iPad mini portrait and iPad landscape. TV/desktop pages:
  720p, 1080p, 4K, 1366×768, 1440×900 and 4:3.
- **States:** every screen a user can be on, including the crowded ones (full hand, many items,
  the longest names, an open sheet or builder) and the most players/items the app allows.
- **Checks:** sideways scroll, controls off screen (on fixed-height screens), overlapping regions,
  clipped button text, tap targets under 40 px, text too small to read; on TVs the 5% safe area,
  the OGS invite corner (top-right) and content cut off inside a region.
- **Then look:** tile the screenshots into contact sheets per state and look at them. The checks
  caught 267 issues on Run Set Jimmy, but only eyes caught the iPad layout stretching a phone
  column across 1180 px.
- Findings from the sweep go into the same report, verified the same way (the sweep re-run is
  the repro: a finding is confirmed when its check fails, fixed when it passes).

## Step 4 — Merge and deduplicate

Read all `report.json` files. For each finding:

1. **Extract** `kind`, `title`, `severity`, `location`, `expected`, `actual`,
   `reproduction` steps, and screenshot paths.
2. **Deduplicate** by location + symptom. Two explorers hitting the same broken
   button from different charters = one finding, noted as "found by 2 explorers."
3. **Rank** by severity (5 = critical, 1 = trivial), then by explorer count.
4. **Filter out** environment artifacts: localhost-specific URLs, dev-only warnings,
   seed data quirks, intentional design choices.
5. **Classify** each finding:
   - `issue` — a real bug that needs fixing
   - `warning` — cosmetic or minor, not worth a test
   - `question` — might be intentional, needs human judgment

Write the merged report to `.bug-bash/<timestamp>/merged-findings.json`.

## Step 5 — Verify findings

For each `issue` finding, write a repro test:

1. Create `bug-bash/<timestamp>/repro/<finding-id>.test.ts`
2. The test reproduces the finding's steps against the running app
3. Run the test — it must **fail** with `ASSERTION_FAILED` for the reported reason
4. If it passes (finding can't be reproduced), mark as `unverified`
5. If it fails for a different reason, mark as `unverified` with a note

Verification statuses:
- `confirmed` — test fails for the reported reason
- `unverified` — can't reproduce, or fails for a different reason
- `rejected` — explained by environment, seed data, or design

Use one subagent per 3 findings when there are many, to parallelize verification.

## Step 6 — Report

Write `.bug-bash/<timestamp>/report.md` with:

```markdown
# Bug Bash — <app name> — <date>

**Target:** <target URL>
**Explorers:** 6 (4 concurrent)
**Duration:** <wall clock time>
**Model usage:** <from e2e output>

## Confirmed Bugs (<count>)

| # | Severity | Title | Found by | Repro test |
|---|----------|-------|----------|------------|
| 1 | 5 | ... | first-time-user, error-paths | repro/bb-001.test.ts |

### BB-001: <title>
**Severity:** 5 (critical)
**Location:** <URL/page>
**Expected:** ...
**Actual:** ...
**Steps:** ...
**Repro test:** `repro/bb-001.test.ts`
**Evidence:** [screenshot](explore-first-time-user/artifacts/...)

## Unverified (<count>)
...

## Rejected (<count>)
...

## Warnings (<count>)
| Title | Found by | Note |
...

## Coverage
| Charter | Steps | Findings | Status |
|---------|-------|----------|--------|
| first-time-user | 10 | 3 | complete |
| power-user | 8 | 1 | complete |
...
```

Then print:
- The confirmed bug count and top 3 by severity
- The report file path
- A reminder: "Do not push. Review the report and decide what to fix."

## Integration with qa-agent

Bug-bash is a one-shot blitz. qa-agent is a daily sweep. They share:
- The same `e2e.config.ts` targets and agents
- The same `file-findings.sh` for filing to GitHub (if the user wants)
- The same ChatGPT plan (watch the usage limit)

To file bug-bash findings as GitHub issues:
```bash
~/src/skills/qa-agent/scripts/file-findings.sh <repo> .bug-bash/<ts>/batch.json
```

This requires converting `merged-findings.json` to the batch schema
(see qa-agent SKILL.md for the schema).

## Cleanup

`.bug-bash/` is gitignored. Old runs accumulate. The user can delete them.
Add `.bug-bash/` to `.gitignore` if it isn't there.

## When NOT to use this

- **Daily QA** — use `/qa-agent` instead (scheduled, incremental)
- **Multi-project e2e setup** — use `/e2e-sweep` instead
- **Writing e2e tests from scratch** — use `/e2e-sweep` instead
- **Game-specific visual QA** — use `/game-qa` instead
- **The app isn't running** — start it first, then bug-bash
