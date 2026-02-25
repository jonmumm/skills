---
name: create-agents-md
description: Create or bootstrap AGENTS.md in a project root so Ralph (and other agent loops) have an onboarding doc. Use when AGENTS.md is missing, when asked to "create AGENTS.md", "bootstrap project for Ralph", or "set up agent context".
---

# Create AGENTS.md

Create `AGENTS.md` in the **project root**. It is the agent's onboarding doc: **WHAT** (tech stack, structure), **WHY** (purpose), **HOW** (build/test/verify). Ralph (ralph-tdd, ralph-dogfooding) and other loops expect it. Keep it short; research shows long or LLM-generated context hurts performance. Do not duplicate code style—use linters/formatters instead. Do not add codebase overviews or directory listings; agents can discover structure. Focus on non-obvious tooling (e.g. `uv` not `pip`, `bun` not `npm`); tools mentioned here get used far more often.

## When to use

- The project has no `AGENTS.md` and you're about to run a Ralph loop.
- User asks to "create AGENTS.md" or "set up this repo for Ralph".

## What to do

1. **Inspect the project** — `package.json` (name, scripts), existing config (tsconfig, vitest, playwright, lint), and layout (`src/`, tests location).
2. **Create `AGENTS.md`** in the project root using the template below.
3. **Fill every `[PLACEHOLDER]`** with real values from the project. Do not leave placeholders.
4. **Feedback commands** — Use the actual commands the project uses (e.g. `npx tsc --noEmit`, `npx vitest run`, `npm run test:mutate:incremental`). Copy from `package.json` scripts and configs where possible.
5. **Ralph working files** — Ralph keeps progress, lessons, and dogfood artifacts under **`.ralph/`**. If the project has a `.gitignore`, add `.ralph/` so these files are not committed (the Ralph scripts also add this automatically when run). Example block to append if missing:

   ```
   # Ralph working files (progress, lessons, dogfood artifacts)
   .ralph/
   ```

## Template

Write this structure into `AGENTS.md` and replace all bracketed placeholders. Omit any section that would be empty or redundant. Aim for under 60–80 lines.

```markdown
# AGENTS.md

## Project

- **Name:** [PROJECT NAME]
- **Description:** [One-line description]
- **Tech stack:** [e.g. TypeScript, React, Vite, Vitest, Playwright, Stryker]
- **Source layout:** [e.g. src/ for source, src/**/*.test.ts for tests, e2e/ for E2E]

## Feedback Commands

Run in this order. All must pass before committing.

[Typecheck command]
[Lint command]
[Unit test command]
[Mutation command if present]
[E2E command if present]

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Verify Before Done**: Never mark a task complete without proving it works. Run tests. Ask: "Would a staff engineer approve this?"

## Self-Improvement

- After any mistake or failed approach, update .ralph/lessons.md with the pattern so it doesn't happen again.
- Review .ralph/lessons.md at the start of each iteration.

## Off-Limits

- [Project-specific: e.g. Don't modify CI without approval; don't change DB schema]
```

## After creating

- If this was for Ralph: tell the user to run the Ralph script again; the loop will now read AGENTS.md. Ralph writes working files (progress, lessons, dogfood progress/artifacts) under `.ralph/` and will add `.ralph/` to `.gitignore` when the script runs.
- You can output `<promise>AGENTS_CREATED</promise>` when done so Ralph scripts know to continue or exit that iteration.
