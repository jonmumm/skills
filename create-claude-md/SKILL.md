---
name: create-claude-md
description: >
  Bootstrap CLAUDE.md as a short table-of-contents plus a structured docs/
  directory (agent guidance, architecture, product specs, acceptance tests,
  ADRs, exec plans, quality grades). Use when CLAUDE.md is missing, when
  asked to "create CLAUDE.md", "bootstrap project", or "set up agent context".
dependsOn:
  - jonmumm/skills@adr-keeper
---

# Create CLAUDE.md

Create `CLAUDE.md` as the agent's **table of contents** — a brief map
pointing to deeper sources of truth in `docs/`. Agents start here,
then load only what they need (progressive disclosure).

> **Philosophy:** CLAUDE.md is a map, not an encyclopedia.
> A monolithic instruction file crowds out the task and rots instantly.
> Keep it short; point to deeper docs.

## When to Use

- The project has no `CLAUDE.md` and you're about to run a swarm or any agent workflow.
- User asks to "create CLAUDE.md", "set up this repo for agents", or "bootstrap agent context".
- The project has an existing CLAUDE.md that is overly long or monolithic and needs restructuring.

## What to Do

### Phase 1: Pre-Flight Detection

Before generating anything, detect and report.

#### 1. Inspect the Project

| Check | How |
|-------|-----|
| Project name | `package.json` name, or directory name |
| Package manager | `bun.lockb` → bun, `pnpm-lock.yaml` → pnpm, `yarn.lock` → yarn, else npm |
| Framework & stack | Read `package.json` deps, config files (tsconfig, vitest, playwright, detox, stryker, etc.) |
| Source layout | Scan top-level directories (`src/`, `app/`, `lib/`, `services/`, `db/`, `e2e/`, etc.) |
| Existing agent docs | Check for `CLAUDE.md`, `AGENTS.md`, `CODEX.md`, `spec/`, `docs/` |
| Existing gitignore | Check `.gitignore` for `.swarm/`, `.claude/` |

#### 2. Detect Feedback Commands

Auto-detect from `package.json` scripts, then confirm with user:

| Command | Look for in scripts |
|---------|-------------------|
| Typecheck | `typecheck`, `tsc`, `type-check` |
| Lint | `lint`, `biome`, `eslint` |
| Test | `test`, `test:unit`, `vitest`, `jest` |
| Coverage | `test:coverage` |
| Mutation | `test:mutate`, `test:mutate:incremental` |
| E2E | `test:e2e`, `e2e`, `detox test` |

#### 3. Report and Confirm

Show the user what you found and what will be generated:

```
Pre-Flight: create-claude-md
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Project:           my-app (pnpm, TypeScript, React, Vitest)
Feedback commands:  typecheck, lint, test, test:mutate:incremental
Existing docs:     AGENTS.md found (will migrate to CLAUDE.md)
                   spec/SPEC.md found (will migrate to docs/product-specs/)

Will generate:
  CLAUDE.md                                 (the TOC — brief)
  docs/agents/harness-engineering.md        (continuous improvement loop)
  docs/agents/testing-principles.md         (project testing conventions)
  docs/agents/code-style.md                 (language/framework style rules)
  docs/ARCHITECTURE.md                      (system map)
  docs/product-specs/index.md               (product requirements catalog)
  docs/acceptance/index.md                  (acceptance test catalog)
  docs/adrs/index.md                        (ADR catalog)
  docs/design-docs/index.md                 (design doc catalog)
  docs/exec-plans/active/                   (active plans directory)
  docs/exec-plans/completed/                (completed plans directory)
  docs/QUALITY.md                           (quality grades)
  docs/lessons.md                           (persistent project lessons)

Proceed? [Y/n]
```

Only generate after user confirms.

### Phase 2: Generate

#### 1. Create `docs/` directory structure

Always create the full structure:

```
docs/
├── agents/                        ← agent-specific guidance
│   ├── harness-engineering.md     ← continuous improvement loop
│   ├── testing-principles.md      ← project testing conventions
│   └── code-style.md             ← language & framework style rules
├── ARCHITECTURE.md                ← system map
├── QUALITY.md                     ← quality grades per domain/layer
├── lessons.md                     ← persistent project lessons (meta)
├── product-specs/
│   ├── index.md                   ← catalog of product spec files
│   └── (migrate existing spec files here, or create starters)
├── acceptance/
│   ├── index.md                   ← catalog of .feature files
│   └── (seed .feature files from existing specs if available)
├── adrs/
│   ├── index.md                   ← catalog of ADRs
│   └── (seed from existing "Key Decisions" sections)
├── design-docs/
│   ├── index.md                   ← design doc catalog
│   └── (project-specific design docs)
└── exec-plans/
    ├── active/                    ← plans being worked
    └── completed/                 ← finished plans (history)
```

#### 2. Create `CLAUDE.md`

Use the template below. Fill every placeholder with real values.
Keep it brief — this is a map, not an encyclopedia.

#### 3. Update `.gitignore`

Append if not already present:
```
# Agent working files
.swarm/
.claude/
```

### Phase 3: Seed Content (Optional)

If the project has existing docs that map to the new structure, offer to
migrate content:

| Existing | Offer to migrate to |
|----------|-------------------|
| `AGENTS.md` | Merge relevant content into `CLAUDE.md` + `docs/agents/` |
| `spec/SPEC.md` or similar behavioral spec | `docs/product-specs/` (prose) + `docs/acceptance/` (Gherkin distillation) |
| Inline architecture diagram in old docs | `docs/ARCHITECTURE.md` |
| "Key Decisions" bullet list | Individual ADR files in `docs/adrs/` |
| Platform gotchas, framework rules | `docs/agents/code-style.md` or `docs/design-docs/platform-gotchas.md` |
| Visual design / theme docs | `docs/design-docs/visual-design.md` |

## Product Specs vs. Acceptance Tests

These are related but distinct:

```
Product Specs (docs/product-specs/)       Acceptance Tests (docs/acceptance/)
─────────────────────────────────────     ──────────────────────────────────────
Prose. Human intent. The "what & why."    Gherkin. Testable contract. The "how to verify."
Organized by domain area.                 Organized by feature, date-named like migrations.
Evolves as the product vision changes.    Updated when specific behaviors change.
Read by humans and agents for context.    Read by agents to verify behavior, can generate
                                          runnable tests (Playwright, Detox, Vitest).
```

**The flow:**
1. Product specs capture the vision and requirements (prose)
2. Acceptance tests distill the specs into precise, testable scenarios (Gherkin)
3. E2E tests implement the scenarios as runnable code (Playwright/Detox)

**When requirements change:**
1. Update the product spec first (the intent)
2. Update or create acceptance test .feature files (the contract)
3. The failing acceptance tests drive the implementation change

### Product Spec File Naming

Use domain-based names in `docs/product-specs/`:
- `overview.md` — high-level product description, target user, core principles
- `data-model.md` — schemas, entities, relationships
- `screens.md` or individual screen files (e.g., `home-screen.md`, `session-screen.md`)
- `api-integration.md` — external API contracts

### Acceptance Test File Naming

Use date-prefixed names in `docs/acceptance/`:
- `YYYY-MM-DD-feature-name.feature`
- e.g., `2026-03-07-listening-session.feature`

## CLAUDE.md Template

Fill all `[PLACEHOLDER]` values. Keep it brief — this is a map, not an encyclopedia.

```markdown
# [PROJECT NAME]

[One-line description]

**Stack:** [e.g. TypeScript, React, Vite, Vitest, Playwright, Stryker]
**Package manager:** [pnpm/npm/yarn/bun] — use `[pnpm/bun] install`, `[pnpm/bun] run ...`

## Feedback Commands

Run in this order. All must pass before committing.

1. `[Typecheck command]`
2. `[Lint command]`
3. `[Unit test command]`
4. `[Mutation command — only if detected]`
5. `[E2E command — only if detected]`

## Knowledge Base

Start here. Load deeper docs **only when working on the relevant domain.**

| Topic | Location |
|-------|----------|
| Agent guidance | [docs/agents/](docs/agents/) — harness engineering, testing, code style |
| Architecture | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Product specs | [docs/product-specs/index.md](docs/product-specs/index.md) |
| Acceptance tests | [docs/acceptance/index.md](docs/acceptance/index.md) |
| ADRs | [docs/adrs/index.md](docs/adrs/index.md) |
| Design docs | [docs/design-docs/index.md](docs/design-docs/index.md) |
| Execution plans | [docs/exec-plans/active/](docs/exec-plans/active/) |
| Quality grades | [docs/QUALITY.md](docs/QUALITY.md) |
| Lessons learned | [docs/lessons.md](docs/lessons.md) |

> **Progressive disclosure:** Do NOT load all docs upfront. Read this file,
> then load the specific doc relevant to your current task.

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Verify Before Done**: Run feedback commands. Ask: "Would a staff engineer approve this?"
- **Spec Traceability**: Every behavior should trace to an acceptance test in docs/acceptance/.
- **Architecture First**: Consult docs/adrs/ before making structural decisions.

## Keeping Docs Current

Stale docs are worse than no docs. Updating docs is part of completing any task.

| If you... | Then update... |
|-----------|---------------|
| Change a feature's behavior | Product spec + acceptance test .feature file |
| Add a new feature | Product spec + new .feature file + docs/acceptance/index.md |
| Make a structural decision | Create a new ADR in docs/adrs/ + update index |
| Change module boundaries | docs/ARCHITECTURE.md |
| Fix a platform gotcha | docs/agents/code-style.md or docs/design-docs/ |
| Change the tech stack | This file (CLAUDE.md header) |
| Learn from a mistake | docs/lessons.md |

## Off-Limits

- [Project-specific: e.g. Don't modify CI without approval; don't change DB schema]
```

## After Creating

- Tell the user the structure is ready.
- You can output `<promise>CLAUDE_MD_CREATED</promise>` when done so scripts know
  to continue.

## Starter File Templates

### `docs/agents/harness-engineering.md`

```markdown
# Harness Engineering

How to turn each change into a durable improvement, not a one-off fix.

## Core Mindset

- Humans steer outcomes; agents execute implementation details.
- Optimize for human attention as the scarce resource.
- Repository-local knowledge is the source of truth.
- Prefer small, enforceable rules over long, fragile instructions.

## The Continuous Improvement Loop

Run this loop for features, fixes, and refactors:

1. Define intent and acceptance criteria in the task/PR.
2. Implement the change.
3. Evaluate with fast checks (feedback commands).
4. Capture what was learned in docs, tests, or tooling.
5. Promote repeated guidance into mechanical enforcement.

## Promote Learning into Enforcement

When a mistake repeats, move "advice" into a stronger guardrail:

1. **Docs** — clarify the expected pattern in docs/agents/.
2. **Tests** — add coverage for the failure mode.
3. **Lint/structure** — add a static rule when possible.
4. **Scripts/automation** — encode the workflow in commands.

Rule of thumb: **if reviewers repeat the same comment twice, encode it.**

## Make Quality Legible

- Deterministic scripts (feedback commands, targeted tests, type checks).
- Explicit failure messages with remediation hints.
- Small PRs with clear intent and verification notes.
- Documentation links near related code.

## Weekly Maintenance Cadence

Lightweight "doc and quality gardening" pass to prevent drift:

- Remove stale guidance from docs/agents/.
- Tighten unclear instructions and add cross-links.
- Identify recurring defects and propose one new mechanical guardrail.
- Record follow-up tech debt as explicit, trackable work.

Continuous small cleanups are cheaper than periodic large rewrites.
```

### `docs/agents/testing-principles.md`

```markdown
# Testing Principles

[PROJECT NAME] testing conventions. Adapt to your project's
test runner (Vitest, Bun test, Jest, Detox, Playwright, etc.)

## Principles

- Prefer flat test files: use top-level `test(...)`, avoid `describe` nesting.
- Inline setup per test. Avoid shared `beforeEach`/`afterEach`.
- Don't test what the type system already guarantees.
- Build helpers that return ready-to-run objects (factory pattern), not globals.
- Keep test intent obvious in the name: "[subject] [verb]s [expected outcome]".
- Write tests so they run offline — prefer local fakes/fixtures over network.
- Prefer fast unit tests for logic; keep E2E focused on user journeys.

## Testing Hierarchy

1. **Integration tests at seams** — the highest-value tests. Test real boundaries.
2. **Unit tests for pure logic** — fast, no mocks of internal modules.
3. **E2E for critical journeys** — expensive but irreplaceable for full-stack confidence.
4. **Mutation testing** — validates that tests actually catch regressions.

## When to Add Tests

- Every new behavior gets a test BEFORE the implementation (TDD).
- Every bug fix starts with a failing test that reproduces the bug.
- Never modify existing tests to make new code pass — the new code is wrong.
```

### `docs/agents/code-style.md`

```markdown
# Code Style

Apply these rules to all new or edited code. When in doubt, match the
existing file style first, then run the formatter.

[Fill in project-specific conventions. Examples below — keep only what applies.]

## TypeScript

- Prefer named exports. Default exports only for framework contracts.
- Prefer `type` aliases for object shapes. Use `interface` only for declaration merging.
- Use `null` for explicit "no value"; `undefined` for optional fields.
- Function declarations for reusable functions; arrow functions for callbacks.
- Parse external data at the boundary with Zod (no `any`, no `as` casting).

## [Framework-Specific]

- [e.g. "Remix: loader/action functions in route files, business logic in services/"]
- [e.g. "React Native: no @tailwind base with NativeWind v4"]
```

### `docs/ARCHITECTURE.md`

```markdown
# [PROJECT NAME] — Architecture

## System Map

[Describe the high-level architecture. Include module boundaries,
data flow, and external dependencies. Keep this current.]

## Module Boundaries

| Module | Directory | Responsibility |
|--------|-----------|---------------|
| ... | ... | ... |
```

### `docs/product-specs/index.md`

```markdown
# Product Specs

Product requirements and vision, organized by domain.
These are the source of truth for WHAT the product does and WHY.

Update these when the product vision or requirements change.
Acceptance tests in `docs/acceptance/` are the testable distillation
of these specs.

| Spec File | Covers |
|-----------|--------|
| ... | ... |
```

### `docs/acceptance/index.md`

```markdown
# Acceptance Tests

Gherkin scenarios defining the behavioral contract of the application.
These are the testable distillation of product specs in `docs/product-specs/`.

Maintained as `.feature` files, date-named and sorted chronologically.

| Date | Feature File | Covers |
|------|-------------|--------|
| ... | ... | ... |

## Relationship to Product Specs

Product specs (prose) → Acceptance tests (Gherkin) → E2E tests (runnable)

When requirements change:
1. Update the product spec (the intent)
2. Update or create the .feature file (the contract)
3. Failing acceptance tests drive the implementation change
```

### `docs/adrs/index.md`

```markdown
# Architectural Decision Records

Decisions are append-only. Never edit old ADRs — supersede with new ones.
Named `YYYY-MM-DD-short-description.md` and sorted chronologically.

| Date | Decision | Status |
|------|----------|--------|
| ... | ... | Accepted |
```

### `docs/QUALITY.md`

```markdown
# Quality Grades

Grade each domain/layer on a scale. Update after major changes.

| Domain | Grade | Notes |
|--------|-------|-------|
| ... | ... | ... |

Grading scale:
- **A** — Well tested, clean architecture, documented
- **B** — Adequate tests, minor debt, mostly documented
- **C** — Gaps in coverage, some debt, docs may be stale
- **D** — Significant gaps, needs attention
- **F** — Untested, undocumented, high risk
```

### `docs/lessons.md`

```markdown
# Lessons Learned

Persistent project knowledge. Things any agent (or human) needs to know.
Updated whenever a mistake is made, a gotcha is discovered, or a pattern proves
effective. Review this file at the start of each task.

## Platform & Framework

- [e.g. "NativeWind v4: never use @tailwind base — it breaks Pressable styles"]

## Architecture

- [e.g. "Keep all Gemini calls in a single service file — spreading them causes inconsistent error handling"]

## Testing

- [e.g. "Always disable Detox synchronization for async operations"]

## Process

- [e.g. "When breaking up a monolith, move tests first — they tell you what's actually coupled"]
```
