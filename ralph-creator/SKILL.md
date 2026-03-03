---
name: ralph-creator
description: Create AFK Ralph loop scripts for any task. Use when the user wants to run an autonomous Claude loop, create a ralph script, go AFK on a task, run something in a loop while away, batch-process work autonomously, or mentions "ralph", "ralph creator", "afk loop", "create a loop", or "run this while I'm away". Generates a complete .ralph/ directory with loop script, backlog, progress tracking, and lessons file.
---

# Ralph Creator

Generate AFK Ralph loop scripts. Ralph runs `claude -p --dangerously-skip-permissions` in a loop — one task per iteration, progress tracked between iterations, stops when all tasks are done.

## Output Structure

All artifacts go in `.ralph/` at the project root:

```
.ralph/
├── ralph-<name>.sh    # Loop script (executable)
├── backlog.md         # Task checklist
├── progress.md        # Working memory (delete after run)
└── lessons.md         # Mistakes to avoid (persists)
```

## Workflow

### 1. Gather Context

Ask the user (2-3 questions max, skip if obvious from context):

- What's the task?
- What context files should the agent read?
- Roughly how many subtasks? (determines iteration count)

### 2. Create `.ralph/` Directory

```bash
mkdir -p .ralph
```

### 3. Write the Backlog

Create `.ralph/backlog.md`. See [references/backlog-format.md](references/backlog-format.md).

Rules:
- Each task: `- [ ]` checkbox, bolded title, clear description
- One task = one iteration = one context window
- Order by dependency, then priority
- Enough detail for a fresh Claude instance to execute without ambiguity

### 4. Generate the Script

Create `.ralph/ralph-<name>.sh` from [references/script-template.md](references/script-template.md).

Customize the placeholders:
- `{{ADDITIONAL_CONTEXT_REFS}}` — extra `@path` refs for skills, specs, style guides
- `{{ONE_SENTENCE_DIRECTIVE}}` — imperative statement: what each iteration produces
- `{{EXECUTE_STEPS}}` — numbered sub-steps for the domain-specific work
- `{{VERIFY_INSTRUCTION}}` — how to confirm the work is correct
- `{{ADDITIONAL_RULES}}` — domain-specific constraints

CRITICAL: The `@` refs and prompt text MUST be in ONE quoted string passed to `claude -p`. The template handles this correctly — do not separate them into different variables or CLI args.

If the task needs a style guide or reference material, put it in a SEPARATE file and add it to `{{ADDITIONAL_CONTEXT_REFS}}` as another `@` reference. Do NOT inline it in the prompt.

### 5. Create Tracking Files

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

### 6. Make Executable and Report

```bash
chmod +x .ralph/ralph-<name>.sh
```

Tell the user the run command:
```
.ralph/ralph-<name>.sh <iterations>
```

Suggest iterations = task count + 2 (buffer for retries + final COMPLETE check).

## Prompt Design Rules

1. **Imperative first line** — The prompt MUST open with a direct command: `YOUR JOB: <one sentence>.` The model reads `@` context files first (often 1000+ lines), so the prompt must immediately snap it into execution mode, not summary mode.
2. **Numbered steps, not section headers** — Use `STEPS:` with numbered items (`1. Do X. 2. Do Y.`), NOT markdown `## Section` headers. Section headers read as documentation. Numbered steps read as commands.
3. **Explicit "Do NOT" rules** — End the prompt with a `RULES:` block that includes what the agent must NOT do (e.g., "Do NOT summarize the spec. Do NOT ask what to work on. Just execute."). Without these, the model defaults to helpful-assistant mode.
4. **Short and punchy** — Prompt should be under 30 lines. The `@` files provide all the context. The prompt is ONLY for instructions. If domain-specific guidance (style guides, conventions) is needed, put it in a separate `@`-referenced file, not inline.
5. **`@` context refs** — Load docs upfront, don't waste tokens exploring
6. **Verification step** — Agent confirms work before marking done
7. **Quality bar** — Measurable "done" criteria, no ambiguity
8. **One task per iteration** — Always include: `ONLY work on ONE task. Do not continue to the next.`
9. **Completion sigil** — Always: `If all tasks are done, output <promise>COMPLETE</promise>.`
10. **Tool instructions** — If using MCP tools, APIs, or CLIs, include explicit how-to in the execute steps

## Prompt Anti-Patterns (Avoid These)

These patterns cause the agent to summarize context instead of executing tasks:

| Anti-Pattern | Why It Fails | Fix |
|---|---|---|
| `@` refs as separate CLI args | Model receives file contents without a directive, just summarizes them | `@` refs MUST be inline in the prompt string: `"@file.md YOUR JOB: ..."` |
| `OUTPUT=$(claude -p ...)` capture | Buffers all output — user sees nothing for 10-20 minutes | Use `\| tee "$LOGFILE"` for real-time streaming + log capture |
| Starting with background/explanation | Model treats it as conversation context | Lead with `YOUR JOB:` imperative |
| `## Section` headers in prompt | Reads as documentation, not commands | Use `STEPS:` with numbered list |
| Long inline style guides/conventions | Buries the actual instructions | Move to separate `@`-referenced file |
| Prompt > 40 lines | Model loses the thread after heavy `@` context | Keep to 15-30 lines max |
| No explicit "Do NOT" rules | Model defaults to helpful-assistant behaviors | Add `RULES:` block with prohibitions |
| Sections named "Orient" / "Context" | Encourages reading + summarizing, not acting | Name steps as actions: "Read backlog", "Write the file" |
