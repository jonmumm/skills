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

Customize:
- `CONTEXT_FILES` — `@` references to specs, configs, backlog, progress, lessons
- `PROMPT` — Must include all six sections:

| Section | Purpose |
|---------|---------|
| **Orient** | Read context files, backlog, progress, lessons |
| **Pick Task** | First unchecked `- [ ]`, or `<promise>COMPLETE</promise>` |
| **Execute** | Domain-specific work instructions |
| **Verify** | Feedback loop — confirm task is done before marking it |
| **Update Tracking** | Mark done in backlog, append progress/lessons |
| **Quality Bar** | Explicit, measurable "done" criteria |

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

1. **`@` context refs** — Load docs upfront, don't waste tokens exploring
2. **Verification step** — Agent confirms work before marking done
3. **Quality bar** — Measurable "done" criteria, no ambiguity
4. **Under 2000 words** — Specific, not verbose
5. **One task per iteration** — Always: `ONLY WORK ON A SINGLE TASK PER ITERATION.`
6. **Completion sigil** — Always: `If all tasks are done, output <promise>COMPLETE</promise>.`
7. **Priority guidance** — How to pick when multiple tasks are available
8. **Tool instructions** — If using MCP tools, APIs, or CLIs, include explicit how-to
