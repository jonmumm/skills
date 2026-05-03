---
name: missions
description: >
  Multi-milestone autonomous development for large goals. Decomposes a big objective
  into milestones with validation gates. Orchestrator plans, workers build via TDD in
  isolated worktrees, independent validators exercise the system as a black box against
  a validation contract. Fix features close gaps. Converges until all milestones pass.
  Use when the user says "mission", "missions", wants to build something large
  (multi-feature, multi-day), or needs structured autonomous development beyond a
  single backlog.
---

# Missions

Autonomous multi-milestone development for large goals. Takes a big objective,
decomposes it into milestones and features, builds each feature via TDD in isolated
worktrees, then gates each milestone behind independent validation agents that
exercise the system as a black box.

The key insight from Factory's architecture: **agents are highly reactive to their
context.** An agent that implemented something is biased toward confirming its own
work. Missions separates the "build" and "judge" roles with fresh context boundaries,
and defines success criteria (the validation contract) before any code is written.

> **Principle #10 (Agents drift, gates don't)** — the validation contract IS the gate. Independent validators with no shared context with the builders are what keep a multi-day autonomous run from optimizing toward "looks done." **Principle #2 (Rebuild often)** — between milestones, ask "would I structure this the same way knowing what I know now?" before continuing. The reflection point is built into the milestone boundary for a reason. See [/principles](../principles/SKILL.md).

## Core Principles

### 1. Validation contract first

Before any features are defined, write a finite checklist of testable behavioral
assertions that define what "done" means. This is the mission's source of truth.

```markdown
# validation-contract.md

### VAL-AUTH-001: Successful login
A user with valid credentials submits the login form and is redirected to the dashboard.
Tool: playwright
Evidence: screenshot, network(POST /api/auth/login -> 200)

### VAL-AUTH-002: Invalid credentials rejected
A user with wrong password sees an error message. No redirect occurs.
Tool: playwright
Evidence: screenshot(error-state), network(POST /api/auth/login -> 401)

### VAL-CROSS-001: Auth gates pricing
A guest user sees "Sign in for pricing" on the catalog.
After logging in, real prices are shown.
Tool: playwright
Evidence: screenshot(guest-view), screenshot(authed-view)
```

Each assertion has an ID, a plain-language description, the tool used to verify it,
and the evidence required.

### 2. Separation of concerns and incentives

Three distinct roles, each with a single goal and fresh context:

| Role | Goal | Context contains | Does NOT contain |
|---|---|---|---|
| **Orchestrator** | Plan, decompose, steer to completion | High-level goal, milestones, validation results | Implementation details |
| **Worker** | Build one feature via TDD | Feature spec, success criteria, project docs | Other features' code, validator feedback |
| **Validator** | Judge correctness as a black box | Validation contract, running system | Implementation code, worker reasoning |

The orchestrator never implements. Workers never validate their own work. Validators
never fix what they find.

### 3. Milestone gating

Features are grouped into milestones. Each milestone represents a logical unit of
functionality. A milestone is "done" only when all its validators pass. No work on
the next milestone begins until the current one converges.

### 4. Fix feature loop

When validators surface issues, the orchestrator creates targeted **fix features** —
new work items with clear success criteria derived from the validator's findings.
Fix features go through the same worker TDD cycle. Then validation re-runs. This
loop repeats until the milestone passes.

### 5. Fresh context per agent

Every worker and validator starts with a clean context window containing only what's
relevant to their specific job. This prevents:
- **Context dilution**: irrelevant information degrading performance
- **Self-evaluation bias**: implementation reasoning anchoring judgment

## Architecture

```
.missions/
  config.json                      <- Persisted project settings
  lessons.md                       <- Cross-mission learnings
  runs/
    2026-04-11T14-00/
      mission-brief.md             <- Original goal + clarifications
      validation-contract.md       <- Behavioral assertions (source of truth)
      features.json                <- Feature list with milestone assignments
      knowledge-base.md            <- Accumulated context across the mission
      guidelines.md                <- Worker boundaries and procedures
      progress.md                  <- Structured log of all activity
      report.md                    <- Final summary
      milestones/
        01-foundation/
          features.md              <- Features in this milestone
          validation-results.md    <- Validator output per round
          issues.md                <- Issues surfaced by validators
        02-core-features/
          ...
      captures/
        <feature-name>/
          <checkpoint>.png         <- Screenshots for validators
      logs/
        orchestrator.log
        worker-<feature>.log
        validator-<milestone>-r<round>.log

  # Git worktrees (temporary, not committed)
  worker/                          <- Git worktree (branch: mission/worker)
```

**NEVER commit `.missions/` to git.** It is local working state. Ensure it's
in `.gitignore` before launching.

## Workflow

```
Phase 1: REQUIREMENTS (interactive, human present)
  |-- Interrogate the goal relentlessly:
  |     |-- Walk down each branch of the design tree
  |     |-- Resolve dependencies between decisions one-by-one
  |     |-- Ask "what happens when...?" for every edge case
  |     |-- Don't stop until every ambiguity is resolved
  |     \-- Produce mission-brief.md
  |
  |-- Define the validation contract:
  |     |-- Write behavioral assertions BEFORE thinking about features
  |     |-- Each assertion: ID, description, tool, evidence required
  |     |-- Cover happy paths, error paths, cross-cutting concerns
  |     \-- User reviews and approves the contract
  |
  |-- Decompose into milestones and features:
  |     |-- Each feature: bounded scope, success criteria, assertion IDs it fulfills
  |     |-- Group features into milestones (logical units of functionality)
  |     |-- Order milestones by dependency (foundations first)
  |     \-- User reviews and approves the plan
  |
  |-- Pre-flight:
  |     |-- Detect tooling (test framework, package manager, platform)
  |     |-- Verify baseline (all existing tests pass)
  |     |-- Confirm feedback commands
  |     |-- Ensure .missions/ in .gitignore
  |     \-- User confirms -> launch
  |

Phase 2: EXECUTION (AFK, autonomous)
  |-- For each milestone:
  |     |
  |     |-- IMPLEMENT: For each feature in the milestone:
  |     |     |-- Spawn worker agent in fresh context with:
  |     |     |     |-- Feature spec + success criteria
  |     |     |     |-- guidelines.md (boundaries and procedures)
  |     |     |     |-- knowledge-base.md (accumulated context)
  |     |     |     \-- Project CLAUDE.md
  |     |     |-- Worker writes tests FIRST (red-green-refactor):
  |     |     |     |-- Integration tests (~70%) at system boundaries
  |     |     |     |-- Unit tests (~15%) for complex pure logic
  |     |     |     \-- E2E tests (~15%) for critical journeys + screenshots
  |     |     |-- Worker implements until tests pass
  |     |     |-- Worker runs: lint, typecheck, full test suite
  |     |     |-- Worker commits with descriptive message
  |     |     \-- Worker exits. Its context is discarded.
  |     |
  |     |-- VALIDATE: After all features in milestone complete:
  |     |     |
  |     |     |-- Scrutiny validators (parallel, fresh context each):
  |     |     |     |-- Review each worker's code for quality and correctness
  |     |     |     |-- Check test quality (are tests actually testing behavior?)
  |     |     |     |-- Run mutation testing on changed files
  |     |     |     |-- Cross-model review (Codex): "what did we miss?"
  |     |     |     \-- Surface issues with severity: blocking / non-blocking / suggestion
  |     |     |
  |     |     |-- Contract validators (parallel, fresh context each):
  |     |     |     |-- Exercise system as a black box (browser, API, simulator)
  |     |     |     |-- Verify assertions from validation-contract.md
  |     |     |     |-- Capture evidence (screenshots, network logs, response bodies)
  |     |     |     |-- Each assertion: PASS (with evidence) or FAIL (with reproduction)
  |     |     |     \-- Report results to milestones/<n>/validation-results.md
  |     |     |
  |     |     \-- Validators exit. Their context is discarded.
  |     |
  |     |-- CONVERGE: Orchestrator reviews validation results:
  |     |     |-- If all assertions PASS and no blocking issues: milestone complete
  |     |     |-- If failures exist:
  |     |     |     |-- Create targeted fix features from validator findings
  |     |     |     |-- Fix features go through the same worker TDD cycle
  |     |     |     \-- Re-run validation (loop until convergence or max rounds)
  |     |     \-- Update knowledge-base.md with learnings from this cycle
  |     |
  |     \-- Proceed to next milestone
  |

Phase 3: HANDOFF (waiting for human)
  |-- Write report.md:
  |     |-- Summary of what was built
  |     |-- Validation results per milestone
  |     |-- Fix features created and why
  |     |-- Stats: time, tokens, agents, lines of code, test coverage
  |     |-- Issues that need human attention
  |     \-- Knowledge base entries worth preserving
  \-- Clean up worktrees
```

## Phase 1: Requirements

### Interrogation (grill-me, built-in)

When the user invokes `/missions`, start by interrogating the goal. This is NOT
a casual chat. The agent must be relentless:

> Interview the user about every aspect of this goal until we reach shared
> understanding. Walk down each branch of the design tree, resolving dependencies
> between decisions one-by-one. Don't accept vague answers. Ask "what happens
> when...?" for every edge case. The validation contract depends on complete
> requirements — ambiguity here becomes bugs later.

Key questions to resolve:
1. **What are we building?** High-level goal and success criteria.
2. **Who uses it?** User types, roles, permissions.
3. **What are the critical paths?** The journeys that MUST work.
4. **What are the boundaries?** What's explicitly out of scope?
5. **What exists already?** Codebase state, existing patterns, constraints.
6. **How do we verify?** What tools can exercise the system (browser, API, simulator)?
7. **What's the deployment target?** Where does this run?

Produce `mission-brief.md` summarizing all decisions.

### Validation contract (evals-first, built-in)

After requirements are clear, write the validation contract. This happens BEFORE
feature decomposition — the contract should reflect requirements, not implementation.

Each assertion follows this template:

```markdown
### VAL-<DOMAIN>-<NNN>: <Title>

<Plain-language description of the expected behavior>

**Preconditions:** <setup required>
**Tool:** <playwright | api-test | simulator | manual>
**Steps:**
1. <action>
2. <action>
**Evidence:** <what proves it passed — screenshot, response body, network log>
**Severity:** <blocking | non-blocking>
```

Group assertions by domain (AUTH, MESSAGING, SEARCH, etc.). Cover:
- Happy paths for every feature
- Error/edge cases for critical paths
- Cross-cutting concerns (auth gates other features, etc.)
- Performance baselines where relevant

The contract is append-only during execution — new assertions can be added
(e.g., from validator findings) but existing ones are never weakened.

### Feature decomposition

With the contract in hand, decompose into features:

```json
{
  "milestones": [
    {
      "id": "M1",
      "name": "Foundation",
      "description": "Auth, database schema, core layout",
      "features": [
        {
          "id": "F001",
          "name": "User authentication",
          "description": "Email/password login and registration",
          "assertions": ["VAL-AUTH-001", "VAL-AUTH-002", "VAL-AUTH-003"],
          "successCriteria": [
            "Login form accepts email + password",
            "Invalid credentials show error",
            "Successful login redirects to dashboard",
            "Registration creates user and logs in"
          ],
          "estimatedComplexity": "medium"
        }
      ]
    }
  ]
}
```

Rules:
- Every assertion must be claimed by at least one feature
- Features should be small enough for one worker session (< 2 hours)
- Milestones are ordered by dependency
- Later milestones can depend on earlier ones, never the reverse

## Phase 2: Execution

### Worker agents

Each worker gets a fresh context containing ONLY:

```
You are a Worker agent in a Missions run. Your job is to implement ONE feature
using strict TDD (red-green-refactor). You do NOT validate your own work —
independent validators will do that after you're done.

## Your feature
<feature spec from features.json>

## Success criteria
<from the feature definition>

## Project guidelines
<guidelines.md — coding standards, patterns, boundaries>

## Accumulated knowledge
<knowledge-base.md — things learned in prior cycles>

## TDD discipline

1. Write tests FIRST:
   - Integration tests at system boundaries (~70%)
   - Unit tests for complex pure logic (~15%)
   - E2E tests for user journeys with screenshot capture (~15%)
2. Run tests -> confirm RED
3. Implement the minimum code to make tests pass
4. Refactor if needed
5. Run full verification: lint, typecheck, test suite
6. Commit with descriptive message
7. Exit

## Anti-patterns to avoid
- Don't mock your own modules. Mock external services only.
- Don't modify existing tests to make new code pass.
- Don't implement beyond your feature's scope.
- Don't add backwards-compatibility shims.
- Parse external data at the boundary (Zod/Codable).
```

Workers run in an isolated git worktree on a feature branch. After completion,
the orchestrator merges the branch to main (if tests pass) before spawning the
next worker.

### Scrutiny validators

After all features in a milestone are implemented, spawn scrutiny validators
in parallel, each with fresh context:

```
You are a Scrutiny Validator. Your job is to find bugs, gaps, and quality issues
in recently implemented code. You did NOT write this code — you are an independent
reviewer.

## What to review
<git diff for the milestone's features>

## Checks to perform
1. Code quality: naming, structure, separation of concerns
2. Test quality: do tests actually test behavior or just implementation details?
3. Missing edge cases: error handling, null states, concurrent access
4. Security: injection, XSS, auth bypass, data exposure
5. Mutation testing: run Stryker on changed files, report surviving mutants

## Cross-model review
After your own review, consider: what would a different AI model catch that you
might miss? Think adversarially about your own blind spots.

## Output format
For each issue:
- **Severity:** blocking | non-blocking | suggestion
- **Location:** file:line
- **Description:** what's wrong
- **Reproduction:** how to trigger it (if applicable)
- **Suggested fix direction:** (don't implement, just describe)
```

Also spawn a Codex cross-review agent:

```bash
codex review --diff "$(git diff main..HEAD)" \
  -c model="gpt-5.4" \
  -c model_reasoning_effort="xhigh"
```

### Contract validators

In parallel with scrutiny validators, spawn contract validators that exercise
the running system as a black box:

```
You are a Contract Validator. Your job is to verify behavioral assertions from
the validation contract by exercising the system the way a real user would.
You have NO access to source code. You interact only through the UI/API.

## Assertions to verify
<subset of validation-contract.md for this milestone>

## Tools available
- Playwright (browser automation)
- API testing (curl/fetch)
- Simulator (iOS/Android)

## For each assertion
1. Set up preconditions
2. Execute the steps
3. Capture evidence (screenshots, network logs, response bodies)
4. Verdict: PASS (with evidence) or FAIL (with reproduction steps)

Save evidence to .missions/runs/<ts>/captures/<assertion-id>/
```

### Fix feature loop

When validators surface blocking issues:

1. Orchestrator reads `milestones/<n>/validation-results.md` and `issues.md`
2. For each blocking issue, create a **fix feature**:
   ```json
   {
     "id": "FIX-M1-001",
     "name": "Fix: login redirect missing for OAuth users",
     "description": "Validator found that OAuth login doesn't redirect to dashboard",
     "sourceIssue": "Scrutiny validator #3, blocking",
     "assertions": ["VAL-AUTH-001"],
     "successCriteria": [
       "OAuth login redirects to /dashboard after successful auth",
       "Existing email/password redirect still works"
     ]
   }
   ```
3. Fix features go through the normal worker TDD cycle
4. After all fix features are done, re-run validation
5. Repeat until convergence or max rounds (default: 4)

Track convergence:
```markdown
## Milestone 1: Foundation — Validation Rounds

### Round 1
- Contract: 8/12 PASS, 4 FAIL
- Scrutiny: 3 blocking, 2 non-blocking, 1 suggestion
- Fix features created: FIX-M1-001, FIX-M1-002, FIX-M1-003

### Round 2
- Contract: 11/12 PASS, 1 FAIL
- Scrutiny: 0 blocking, 1 non-blocking
- Fix features created: FIX-M1-004

### Round 3
- Contract: 12/12 PASS
- Scrutiny: 0 blocking
- MILESTONE COMPLETE
```

## Pre-Flight Checklist

### Stage 1: Project Discovery

| # | Check | How |
|---|-------|-----|
| 1 | Project root | Current directory or `--project` flag |
| 2 | Git state clean? | No uncommitted changes |
| 3 | Default branch | Current branch (becomes integration target) |
| 4 | Package manager | Detect from lockfile: `pnpm-lock.yaml` -> pnpm, etc. |
| 5 | CLAUDE.md exists? | Required — missions relies on project conventions |

### Stage 2: Command Detection

Auto-detect from `package.json` scripts:

| # | Command | Look For |
|---|---------|----------|
| 6 | Test | `test`, `test:unit`, `vitest` |
| 7 | Typecheck | `typecheck`, `tsc` |
| 8 | Lint | `lint`, `biome`, `eslint` |
| 9 | Coverage | `test:coverage` |
| 10 | Mutation | `test:mutate`, `test:mutate:incremental` |
| 11 | E2E | `test:e2e`, `e2e` |

### Stage 3: Tooling Verification

| # | Check | If Missing |
|---|-------|-----------|
| 12 | Coverage outputs `lcov.info`? | Configure coverage provider |
| 13 | Stryker configured? | Set up Stryker for mutation testing |
| 14 | E2E framework? | Detect Playwright/Detox/XCUITest |
| 15 | Smoke test | Run test + typecheck + lint to verify clean baseline |
| 16 | Sub-agent smoke | `env -u CLAUDECODE claude --version` |

### Stage 4: Confirm and Launch

```
Pre-flight complete:
- Project: my-app on branch main (pnpm)
- Mission: "Build a Slack clone with real-time messaging"
- Milestones: 6 (Foundation -> Channels -> Conversations -> Interactions -> Rich -> Polish)
- Features: 40 across milestones
- Assertions: 85 in validation contract
- Commands: pnpm test | typecheck | lint | test:coverage | test:mutate:incremental | test:e2e
- Baseline: all checks pass
- Max validation rounds: 4

Launch mission?
```

## Configuration (optional)

Persist project-specific settings in `${CLAUDE_PLUGIN_DATA}/missions/config.json`:

```json
{
  "defaultBranch": "main",
  "maxValidationRounds": 4,
  "maxWorkerIterations": 10,
  "feedbackCommands": {
    "test": "pnpm test",
    "typecheck": "pnpm typecheck",
    "lint": "pnpm lint",
    "coverage": "pnpm test:coverage",
    "mutate": "pnpm test:mutate:incremental",
    "e2e": "pnpm test:e2e"
  },
  "validators": {
    "scrutiny": true,
    "contract": true,
    "codex": true,
    "mutation": true
  }
}
```

## Running a Mission

### Interactive (recommended)

Tell Claude Code: `/missions` or "start a mission"

### Script execution

```bash
chmod +x ~/src/skills/missions/scripts/missions.sh

env -u CLAUDECODE ~/src/skills/missions/scripts/missions.sh \
  --project /abs/path/to/your-repo \
  --max-rounds 4 \
  --max-worker-iterations 10 \
  --agent claude
```

The script:
1. Creates timestamped run directory in `.missions/runs/`
2. Ensures `.missions/` is in `.gitignore`
3. Processes milestones sequentially
4. For each milestone: spawns workers -> merges -> spawns validators -> converges
5. Generates `report.md` on completion or interruption
6. Cleans up worktrees

## Convergence and Halting

The mission halts and returns control to the user when:
- **All milestones pass** — success
- **A milestone exceeds max validation rounds** — the orchestrator explains what's failing and why convergence isn't happening
- **A worker is blocked** — missing dependency, ambiguous spec, infra issue
- **A validator finds a fundamental design issue** — something that can't be fixed by a feature, requires rethinking the approach

When halted, the orchestrator writes a clear summary of state to `report.md` so
the human can pick up where it left off.

## Progress Tracking

All agents append to `.missions/runs/<ts>/progress.md`:

```markdown
# Mission Progress — 2026-04-11T14:00

## [ORCHESTRATOR] 14:00 — Mission started
Goal: Build a Slack clone
Milestones: 6 | Features: 40 | Assertions: 85

## [WORKER] 14:15 — F001: User authentication COMPLETE
Files: src/auth/login.ts, login.test.ts | Tests: +8 | Commit: a1b2c3d

## [WORKER] 14:45 — F002: Database schema COMPLETE
Files: src/db/schema.ts, migrations/ | Tests: +4 | Commit: d4e5f6g

## [VALIDATOR:SCRUTINY] 15:30 — M1 Round 1
Issues: 3 blocking, 2 non-blocking | See milestones/01/issues.md

## [VALIDATOR:CONTRACT] 15:35 — M1 Round 1
Assertions: 8/12 PASS | Failures: VAL-AUTH-003, VAL-AUTH-004, VAL-DB-002, VAL-DB-003

## [ORCHESTRATOR] 15:40 — Created fix features: FIX-M1-001, FIX-M1-002
Source: validator round 1 findings

## [WORKER] 16:00 — FIX-M1-001: OAuth redirect fix COMPLETE
Files: src/auth/oauth.ts | Tests: +2 | Commit: h7i8j9k

## [VALIDATOR:CONTRACT] 16:30 — M1 Round 2
Assertions: 12/12 PASS | MILESTONE 1 COMPLETE
```

## Knowledge Base

`knowledge-base.md` accumulates context across the mission's duration. Workers
and validators read it at startup. The orchestrator updates it after each
validation cycle.

```markdown
# Knowledge Base

## Architecture decisions
- Using Zod for all API boundary validation (decided during F001)
- WebSocket for real-time, not SSE (decided during M2 planning)

## Patterns established
- All routes use middleware chain: auth -> validate -> handle -> respond
- Tests use factory functions for test data, not fixtures

## Pitfalls discovered
- The ORM doesn't support upsert on composite keys — use raw SQL
- Playwright needs explicit waits for WebSocket-driven UI updates

## Validator insights
- Round 1: OAuth flow was missing redirect — workers assumed it existed
- Round 2: File upload tests were passing but files weren't persisted (mock leak)
```

## On-Demand Hooks

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "command": "echo \"$TOOL_INPUT\" | grep -qE '(rm -rf|git push --force|git reset --hard|DROP TABLE)' && echo 'BLOCK: Destructive command blocked during mission.' || true"
      },
      {
        "matcher": "Bash",
        "command": "echo \"$TOOL_INPUT\" | grep -qE 'git add \\.' && echo 'BLOCK: Use specific file paths instead of git add . during mission.' || true"
      }
    ]
  }
}
```

## Monitoring

```bash
# Live heartbeat
watch cat .missions/HEARTBEAT

# Current progress
cat .missions/runs/*/progress.md | tail -30

# Validation convergence
cat .missions/runs/*/milestones/*/validation-results.md

# Recent commits
git log --oneline -10
```

## Post-Mission Recovery

When a new session starts in a project with `.missions/runs/*/report.md`:

1. Present the report summary
2. Show milestone status (which passed, which didn't)
3. If halted mid-mission, explain where it stopped and why
4. Offer to resume from the current state

## Gotchas

- **Never commit `.missions/` to git.** It is local working state.
- **The validation contract is the source of truth, not the feature list.** If a feature "passes its tests" but the contract assertion fails, the feature is wrong.
- **Workers must not see validator feedback directly.** The orchestrator creates fix features that describe what to fix without leaking validator reasoning (which could bias the worker).
- **Don't skip scrutiny validators for "simple" milestones.** Self-evaluation bias exists regardless of complexity.
- **Max validation rounds exist for a reason.** If a milestone can't converge in 4 rounds, there's likely a design issue — halt and involve the human.
- **Knowledge base grows — manage it.** The orchestrator should prune obsolete entries and keep it focused. A bloated knowledge base is just context dilution.
- **Stryker incremental JSON must persist.** `.stryker-incremental.json` saves mutation state across worker runs.
- **Feature ordering within a milestone matters.** Foundation features (schema, auth) before features that depend on them.

## References

| Topic | Source | Load When |
|-------|--------|-----------|
| **Worker prompt** | [references/worker-prompt.md](references/worker-prompt.md) | Spawning a worker agent |
| **Scrutiny validator** | [references/scrutiny-prompt.md](references/scrutiny-prompt.md) | Spawning scrutiny validation |
| **Contract validator** | [references/contract-prompt.md](references/contract-prompt.md) | Spawning contract validation |
| **Orchestrator** | [references/orchestrator-prompt.md](references/orchestrator-prompt.md) | Planning, convergence, resume |
| **Validation contract template** | [references/validation-contract-template.md](references/validation-contract-template.md) | Writing the validation contract |
| **Worktree coordination** | [references/worktree-coordination.md](references/worktree-coordination.md) | Worker lifecycle management |
| **Resume protocol** | [references/resume-protocol.md](references/resume-protocol.md) | Resuming a halted mission |
| **Heartbeat spec** | [references/heartbeat-spec.md](references/heartbeat-spec.md) | Monitoring agent progress |
