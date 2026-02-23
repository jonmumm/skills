---
name: ralph-tdd
description: Ralph TDD loop — autonomous coding with TDD and mutation testing. Use when running autonomous coding loops, implementing features from a backlog, or when asked about "ralph", "ralph loop", "afk coding", or "autonomous tdd".
---

# Ralph TDD Loop

**Naming**: Skill and script are both **ralph-tdd** (the capability). Ralph is designed to run AFK (away-from-keyboard); the script is `ralph-tdd.sh`.

Ralph runs AI coding agents in an AFK loop. The agent picks tasks from a backlog, implements with TDD, verifies test quality with mutation testing, and commits. You come back to working code.

**TDD reference**: [references/tdd.md](references/tdd.md) has the red-green-refactor loop and test-quality rules used in step 4.

## Architecture

```
┌──────────────────────────────────────────────────────┐
│ RALPH OUTER LOOP (per task)                          │
│                                                      │
│  1. Read progress.md + lessons.md                    │
│  2. Read backlog (Linear, GitHub Issues, PRD, etc.)  │
│  3. Pick highest-priority unfinished task             │
│  4. TDD red-green-refactor (see ref below)           │
│  5. Run feedback loops (types, lint, tests)           │
│  6. Verify: "Would a staff engineer approve this?"   │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │ MUTATION QUALITY GATE (see ref below)          │  │
│  │  7. Run incremental mutation testing           │  │
│  │  8. Kill survivors on touched files            │  │
│  │  9. Repeat until score >= 95%                  │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  10. Mark task done, append to progress.md           │
│      Update lessons.md if anything was learned       │
│  11. Commit                                          │
└──────────────────────────────────────────────────────┘
```

Outer loop = Ralph picking tasks. Inner loop = mutation quality gate. The gate prevents "green but useless" tests — a constraint the AI can't cheat its way out of.

### Mutation quality gate (steps 7–9)

After tests pass: run `npm run test:mutate:incremental` (or project equivalent). For each surviving mutant on **files you changed**, write a test that would fail with the mutation, then re-run until mutation score ≥ 95% on those files. **Full setup and survivor table**: [references/mutation-testing.md](references/mutation-testing.md).

## Reference guide

Load detailed guidance when relevant to the project stack:

| Topic | Reference | Load when |
|-------|-----------|-----------|
| **TDD** | [references/tdd.md](references/tdd.md) | Red-green-refactor, one test at a time, behavior-focused tests, when to mock |
| **Vitest** | [references/vitest.md](references/vitest.md) | Writing or running unit tests, feedback loop test command, mocking |
| Mutation testing | [references/mutation-testing.md](references/mutation-testing.md) | Running Stryker, killing survivors, first-time setup |
| Playwright E2E | [references/playwright-e2e.md](references/playwright-e2e.md) | Writing or running E2E tests, debugging flaky browser tests |
| Progress format | [references/progress-format.md](references/progress-format.md) | Appending entries to progress.md or lessons.md |
| AGENTS.md template | [references/agents-template.md](references/agents-template.md) | Creating AGENTS.md for a new project |

## Pre-Flight Checklist

**Before going AFK, gather all of this.** Ask the user until every item is answered.

| # | Question | Default |
|---|----------|---------|
| 1 | Project name and working directory | — |
| 2 | Backlog source (Linear team, GitHub repo, local PRD file) | — |
| 3 | Tasks to skip or focus on? | Priority order |
| 4 | How many iterations? | 5 |
| 5 | Agent runtime — see [Agent Runtimes](#agent-runtimes) | Codex |
| 6 | Permission mode — see [Permission Modes](#permission-modes) | Full auto |
| 7 | Feedback commands: typecheck, lint, test, mutation | Auto-detect |
| 8 | Does AGENTS.md exist? Create from [template](references/agents-template.md) if not. | — |
| 9 | Start fresh progress.md or continue existing? | Fresh |
| 10 | Does lessons.md exist? Create if not (persists across sprints). | — |
| 11 | Commit per task, or batch? | Per task |
| 12 | Branch — current or create new? | Current |
| 13 | Anything off-limits? | None |

After gathering answers, confirm back:

```
Ready to go AFK:
- Project: [name] on branch [branch]
- Backlog: [source] — [N] iterations, priority order
- Agent: [runtime] with [permission mode]
- Feedback: tsc → biome → vitest → stryker (incremental)
- Commit after each task

Anything to change?
```

Only start after user confirms.

## Agent Runtimes

The Ralph TDD script supports multiple agent CLIs. Set `AGENT_CMD` in the script.

| Runtime | Command | Notes |
|---------|---------|-------|
| **Codex** (default) | `codex --approval-mode full-auto -q` | OpenAI Codex CLI. `-q` for quiet/non-interactive. |
| **Claude Code** | `claude -p --dangerously-skip-permissions` | Full auto. Best for AFK. |
| **Claude Code (semi)** | `claude -p --permission-mode acceptEdits` | Allows edits, blocks shell. May stall AFK. |

For true AFK, use full-auto permission modes. Semi-auto modes may prompt for approval and stall the loop.

## Permission Modes

| Mode | Claude Code Flag | Codex Flag | Risk | Best For |
|------|-----------------|------------|------|----------|
| **Full auto** | `--dangerously-skip-permissions` | `--approval-mode full-auto` | Agent can run any command | Trusted repos, overnight runs |
| **Accept edits** | `--permission-mode acceptEdits` | `--approval-mode auto-edit` | Blocks on shell commands | Semi-trusted, may stall |
| **Default** | (none) | `--approval-mode suggest` | Blocks on everything | Not suitable for AFK |

**Recommendation**: Use full-auto for AFK. The mutation testing quality gate and test suite act as safety nets. If tests pass and mutations are killed, the code is likely correct regardless of what commands ran.

## Setup

### 1. Run the Ralph TDD script

See [scripts/ralph-tdd.sh](scripts/ralph-tdd.sh) — copy to your project root and customize the config variables at the top.

Make executable: `chmod +x ralph-tdd.sh`

Run: `./ralph-tdd.sh <iterations>` (e.g. `./ralph-tdd.sh 5`). Typically run AFK.

### 2. Create progress.md

```markdown
# Progress

Agent working memory. Delete after sprint.

---
```

See [references/progress-format.md](references/progress-format.md) for entry format.

### 3. Create AGENTS.md

The agent's onboarding doc — project description, tech stack, code conventions, feedback commands, core principles, what not to do.

**Use the template**: [references/agents-template.md](references/agents-template.md) — copy to your project root as `AGENTS.md` and fill in placeholders.

### 4. Create lessons.md

```markdown
# Lessons

Patterns and rules learned during development. Review at the start of each iteration.

---
```

The agent updates this file after any failed approach, mistake, or course correction. Unlike progress.md (what was done), lessons.md captures **what to avoid** — it persists across iterations and prevents repeating the same class of mistake.

See [references/progress-format.md](references/progress-format.md) for entry format.

## Task Prioritization

1. **Architectural decisions** — cascade through entire codebase
2. **Integration points** — reveals incompatibilities early
3. **Unknowns / spikes** — fail fast
4. **Features** — implementation work
5. **Polish** — save for last

## Task Sources & Work Tracking

**Use Linear for tracking work** when the backlog is a Linear team: mark the current task in-progress when starting, and mark it done when the task is complete (before committing). Use Linear MCP or `linear` CLI. Same idea for GitHub Issues or a local PRD — update status so progress is visible.

| Source | How |
|--------|-----|
| **Linear** | MCP or CLI. Mark issue in-progress → implement → mark done. Preferred when available. |
| **GitHub Issues** | `gh issue list`, `gh issue close` (or update labels/state) |
| **PRD file** | Local `prd.md` with checklist; tick off items as done |

## Alternative Loop Types

Same Ralph pattern works for non-feature work:

| Loop | Focus |
|------|-------|
| **Mutation Score** | Kill surviving mutants across codebase |
| **Test Coverage** | Write tests for uncovered lines |
| **Lint** | Fix lint errors one at a time |
| **Refactor** | Code smells → extract, simplify |
