---
name: ralph-creator
description: >
  Create AFK Ralph loop scripts for any task. Interrogates the user to nail down
  requirements, then generates a complete .ralph/ directory with loop script,
  backlog, progress tracking, and lessons file. Use when the user wants to run an
  autonomous Claude loop, create a ralph script, go AFK on a task, run something
  in a loop while away, batch-process work autonomously, or mentions "ralph",
  "ralph creator", "afk loop", "create a loop", or "run this while I'm away".
---

# Ralph Creator

Generate AFK loop scripts. Ralph runs `claude -p --dangerously-skip-permissions`
in a loop — one task per iteration, progress tracked between iterations, stops
when all tasks are done.

## Output Structure

```
.ralph/
├── ralph-<name>.sh    # Loop script (executable)
├── backlog.md         # Task checklist
├── progress.md        # Working memory (delete after run)
└── lessons.md         # Mistakes to avoid (persists)
```

## Workflow

### Phase 1: Interrogate (grill-me)

Before generating anything, interrogate the user relentlessly about every
aspect of the task. Do NOT accept vague answers.

> Walk down each branch of the task tree, resolving dependencies between
> decisions one-by-one. Don't stop until every ambiguity is resolved.

Questions to resolve (skip if obvious from context):

1. **What's the task?** Concrete description of the end state.
2. **What's the scope?** How many subtasks? What's in, what's out?
3. **What context does the agent need?** Files, specs, docs, APIs.
4. **What tools does the agent use?** CLI commands, MCP tools, test runners.
5. **What does "done" look like per task?** Measurable acceptance criteria.
6. **What must the agent NOT do?** Constraints, off-limits areas, anti-patterns.
7. **What order?** Dependencies between tasks. What unblocks what?
8. **What verification?** How does the agent confirm each task is correct?

Keep pushing until you can write every backlog item with enough detail that
a fresh Claude instance can execute it without asking questions. If the user
says "just figure it out," push back: vague backlogs produce vague results.

### Phase 2: Generate

Once requirements are nailed down, generate all artifacts:

#### 1. Create `.ralph/` directory

```bash
mkdir -p .ralph
```

Ensure `.ralph/` is in `.gitignore`.

#### 2. Write the backlog

Create `.ralph/backlog.md`. See [references/backlog-format.md](references/backlog-format.md).

Rules:
- Each task: `- [ ]` checkbox, bolded title, clear description
- One task = one iteration = one context window
- Order by dependency, then priority
- Enough detail for a fresh Claude instance to execute without ambiguity

#### 3. Generate the script

Create `.ralph/ralph-<name>.sh` from [references/script-template.md](references/script-template.md).

Customize the placeholders:
- `{{ADDITIONAL_CONTEXT_REFS}}` — extra `@path` refs for skills, specs, style guides
- `{{ONE_SENTENCE_DIRECTIVE}}` — imperative statement: what each iteration produces
- `{{EXECUTE_STEPS}}` — numbered sub-steps for the domain-specific work
- `{{VERIFY_INSTRUCTION}}` — how to confirm the work is correct
- `{{ADDITIONAL_RULES}}` — domain-specific constraints

CRITICAL: The `@` refs and prompt text MUST be in ONE quoted string passed
to `claude -p`. The template handles this correctly — do not separate them.

If the task needs a style guide or reference material, put it in a SEPARATE
file and add it to `{{ADDITIONAL_CONTEXT_REFS}}` as another `@` reference.
Do NOT inline it in the prompt.

#### 4. Create tracking files

`.ralph/progress.md`:
```markdown
# Progress
Working memory for ralph-<name>. Delete after run.
---
```

`.ralph/lessons.md`:
```markdown
# Lessons
Patterns and mistakes. Review at start of each iteration.
---
```

See [references/tracking-format.md](references/tracking-format.md) for entry format.

#### 5. Make executable and report

```bash
chmod +x .ralph/ralph-<name>.sh
```

Tell the user the run command:
```
env -u CLAUDECODE .ralph/ralph-<name>.sh <iterations>
```

Suggest iterations = task count + 2 (buffer for retries + final COMPLETE check).

## Prompt Design Rules

1. **Imperative first line** — The prompt MUST open with `YOUR JOB: <one sentence>.` The model reads `@` context files first (often 1000+ lines), so the prompt must snap it into execution mode, not summary mode.
2. **Numbered steps, not section headers** — Use `STEPS:` with numbered items, NOT markdown `## Section` headers. Section headers read as documentation. Numbered steps read as commands.
3. **Explicit "Do NOT" rules** — End with a `RULES:` block including what the agent must NOT do. Without these, the model defaults to helpful-assistant mode.
4. **Short and punchy** — Under 30 lines. `@` files provide context. The prompt is ONLY for instructions. Domain-specific guidance goes in separate `@`-referenced files.
5. **`@` context refs** — Load docs upfront, don't waste tokens exploring.
6. **Verification step** — Agent confirms work before marking done.
7. **Quality bar** — Measurable "done" criteria, no ambiguity.
8. **One task per iteration** — Always include: `ONLY work on ONE task. Do not continue to the next.`
9. **Completion sigil** — Always: `If all tasks are done, output <promise>COMPLETE</promise>.`
10. **Tool instructions** — If using MCP tools, APIs, or CLIs, include explicit how-to in the execute steps.

## Prompt Anti-Patterns

| Anti-Pattern | Why It Fails | Fix |
|---|---|---|
| `@` refs as separate CLI args | Model summarizes file contents instead of acting | `@` refs MUST be inline in the prompt string |
| `OUTPUT=$(claude -p ...)` | Buffers all output — silence for 10-20 minutes | Use `\| tee "$LOGFILE"` for real-time streaming |
| Starting with background | Model treats it as conversation context | Lead with `YOUR JOB:` imperative |
| `## Section` headers in prompt | Reads as documentation, not commands | Use `STEPS:` with numbered list |
| Long inline style guides | Buries the actual instructions | Move to separate `@`-referenced file |
| Prompt > 40 lines | Model loses the thread after heavy `@` context | Keep to 15-30 lines max |
| No explicit "Do NOT" rules | Model defaults to helpful-assistant behaviors | Add `RULES:` block with prohibitions |
| Sections named "Orient" / "Context" | Encourages summarizing instead of acting | Name steps as actions: "Read backlog", "Write the file" |

## Gotchas

- **`env -u CLAUDECODE` is required** when launching from inside a Claude Code session, so sub-agents can spawn properly.
- **Don't put domain guidance inline in the prompt.** If you need style guides, conventions, or reference material, write them to a separate file and `@`-reference it.
- **One task per iteration is non-negotiable.** Multi-task iterations cause scope creep, partial completion, and context dilution.
- **Delete `progress.md` between runs.** It's working memory for a single run, not a permanent log.
- **`lessons.md` persists.** It accumulates across runs. Agents read it at the start of each iteration to avoid repeating mistakes.

## References

| Topic | Source | Load When |
|-------|--------|-----------|
| **Backlog format** | [references/backlog-format.md](references/backlog-format.md) | Writing the backlog |
| **Script template** | [references/script-template.md](references/script-template.md) | Generating the loop script |
| **Tracking format** | [references/tracking-format.md](references/tracking-format.md) | Creating progress/lessons files |
