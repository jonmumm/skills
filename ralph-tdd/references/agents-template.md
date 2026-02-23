# AGENTS.md Template

Copy to your project root as `AGENTS.md` and fill in the project-specific sections. This is the agent's onboarding doc — everything it needs to work autonomously.

## How to use

```bash
cp references/agents-template.md /path/to/project/AGENTS.md
# Edit the [PLACEHOLDER] sections
```

---

# AGENTS.md

## Project

- **Name:** [PROJECT NAME]
- **Description:** [One-line description]
- **Tech stack:** [e.g. TypeScript, React, Vite, Vitest, Playwright, Stryker]
- **Source layout:** [e.g. `src/` for source, `src/**/*.test.ts` for tests, `e2e/` for E2E]

## Feedback Commands

Run in this order. All must pass before committing.

```bash
# Typecheck
[e.g. npx tsc --noEmit]

# Lint
[e.g. npx biome check --write .]

# Unit tests
[e.g. npx vitest run]

# Mutation testing (after units pass)
[e.g. npm run test:mutate:incremental]

# E2E (if applicable)
[e.g. npx playwright test]
```

## Code Conventions

- [e.g. No default exports]
- [e.g. Prefer composition over inheritance]
- [e.g. All new code must have tests]
- [e.g. Use dependency injection — accept dependencies, don't create them]

## Core Principles

These apply to every change, every iteration.

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.
- **Verify Before Done**: Never mark a task complete without proving it works. Run tests, check logs, demonstrate correctness. Ask yourself: "Would a staff engineer approve this?"

## Self-Improvement

- After any mistake or failed approach, update `lessons.md` with the pattern.
- Write rules that prevent the same mistake from recurring.
- Review `lessons.md` at the start of each iteration.

## Off-Limits

- [e.g. Don't modify CI configuration]
- [e.g. Don't change database schemas without explicit approval]
- [e.g. Don't refactor modules outside the current task scope]
