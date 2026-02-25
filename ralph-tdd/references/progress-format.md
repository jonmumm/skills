# .ralph/progress.md & .ralph/lessons.md Format

Ralph keeps working files under **`.ralph/`** (the scripts add `.ralph/` to `.gitignore` so they are not committed). Two files track agent state across context windows.

## Promise tags (agent → script)

The agent can end a run with a tag so the Ralph script knows what to do:

| Tag | Meaning | Script action |
|-----|---------|----------------|
| `<promise>COMPLETE</promise>` | All backlog tasks done | Exit 0 |
| `<promise>AGENTS_CREATED</promise>` | AGENTS.md was just created | Exit 0, tell user to re-run |
| `<promise>BLOCKED:reason</promise>` | Cannot proceed (env, deps, credentials, tool broken) | Exit 2, show reason |
| `<promise>DECIDE:question</promise>` | Needs human decision (architecture, requirement) | Exit 3, show question |

Agent should output only the tag (and optionally the reason/question) and stop; no extra output after the tag.

---

- **.ralph/progress.md** — what was done. Working memory. Delete after each sprint.
- **.ralph/lessons.md** — what to avoid. Persists across sprints. Review at iteration start.

## Entry format

Append after each completed task:

```markdown
## [TASK-ID] Task Title — YYYY-MM-DD

**Status:** Done
**Files changed:** list key files
**Decisions:** architectural choices and why
**Mutation score:** X% on touched files (Y survivors killed)
**Notes:** anything next iteration should know
```

## Guidelines

- Keep entries concise. Sacrifice grammar for brevity.
- Focus on what the NEXT iteration needs to know, not what you did.
- Record decisions and their rationale — future iterations can't read your mind.
- Record files changed — saves grep time.
- Record mutation score — tracks quality trend across iterations.
- If blocked, explain what's blocking and what was tried.

## Example

```markdown
## THE-42 Add password reset flow — 2025-06-15

**Status:** Done
**Files changed:** src/lib/auth/service.ts, src/lib/auth/service.test.ts, src/lib/email/service.ts
**Decisions:** Used time-limited token (15min) instead of magic link. Stored hash not plaintext.
**Mutation score:** 97% on touched files (2 survivors — both string literal mutations in error messages, acceptable)
**Notes:** Email service is a stub — THE-43 will implement real SMTP. Reset tokens use same HMAC as session tokens.
```

---

## .ralph/lessons.md

Unlike .ralph/progress.md, .ralph/lessons.md **persists across sprints**. It captures patterns, mistakes, and rules the agent should follow to avoid repeating failures.

Update .ralph/lessons.md after:
- A failed approach that had to be reversed
- A mutation survivor that revealed a testing blind spot
- A pattern the agent keeps getting wrong
- Any course correction from the user

### Entry format

```markdown
## [CATEGORY] Short description — YYYY-MM-DD

**Pattern:** What went wrong or what was learned
**Rule:** Concrete rule to follow going forward
**Example:** (optional) Specific code or scenario
```

### Categories

| Category | When |
|----------|------|
| `TESTING` | Testing blind spots, mock misuse, missing edge cases |
| `DESIGN` | Architectural mistakes, wrong abstraction level |
| `PROCESS` | Wrong task order, skipped verification, scope creep |
| `TOOLING` | Build/config issues, Stryker quirks, CLI gotchas |

### Example

```markdown
## [TESTING] Stryker string literal survivors are OK to skip — 2025-06-15

**Pattern:** Spent 20 min writing tests to kill string literal mutations in error messages. These don't affect behavior.
**Rule:** Don't kill string literal mutations in error messages or log strings. Focus mutation killing on logic, conditionals, and arithmetic.

## [DESIGN] Don't extract a base class for two similar services — 2025-06-16

**Pattern:** Created AbstractNotificationService for Email and SMS. Added coupling, made both harder to change independently.
**Rule:** Prefer composition and dependency injection over inheritance. Only extract shared code after 3+ concrete implementations.
```
