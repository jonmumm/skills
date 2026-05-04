# Running Goal Maker in Claude Code

The goal-maker pattern (charter + board + receipts + computed gate + Scout/Judge/Worker roles) is tool-agnostic. The Codex `.toml` files are one way to express the agent roles; Claude Code has two native equivalents.

## Option A: Single Claude session as PM (simplest)

The main Claude session *is* the PM. It reads the active task, switches mental modes based on `task.type`, writes the receipt, and updates the board. No separate agents needed.

Pros: zero setup, works in any Claude Code session, easy to follow along in real time.

Cons: no context isolation between roles — Scout findings stay in the same context as Worker implementation, which can bias future decisions.

**Run command:**
```text
Read docs/goals/<slug>/goal.md and state.yaml. Work only the active task.
- If type=scout: read-only mode. Map evidence. Write Scout receipt.
- If type=judge: read-only mode. Decide. Write Judge receipt.
- If type=worker: write only inside allowed_files. Run verify commands. Write Worker receipt.
- After receipt: update state.yaml, run check-goal-state.mjs, select next active task.
- Stop per the stop rule in goal.md.
```

## Option B: Subagent definitions (medium isolation)

Define three subagents in `.claude/agents/` (project) or `~/.claude/agents/` (user):

`scout.md`:
```markdown
---
name: scout
description: Read-only evidence mapping for goal-maker Scout tasks. Maps repo/source/spec evidence, verification commands, ambiguities, and candidate next tasks. Returns a compact Scout receipt.
model: sonnet
tools: [Read, Grep, Glob, Bash]
---
You are Scout for goal-maker. Read-only mode — do not edit files.

Given the active Scout task description from state.yaml, map evidence, verification commands, health signals, improvement candidates, target files/tests, and unresolved ambiguity.

Return a compact Scout receipt the PM will paste into state.yaml:
- result, summary, evidence (paths), note path if findings are too large, spawned_tasks if useful, ambiguity requiring Judge.

Do not select the active task or mark the goal complete.
```

`judge.md`:
```markdown
---
name: judge
description: High-thinking strategic reviewer for goal-maker Judge tasks. Used for ambiguity, risky scope, source/product conflicts, safety/API/live decisions, and tranche completion audits.
model: opus
tools: [Read, Grep, Glob, Bash]
---
You are Judge for goal-maker. Read-only mode. Think as a skeptical staff engineer.

Decide and constrain; do not implement. Do not approve based on lots of docs or lots of tests — require coherent receipts and current verification.

Return a compact Judge receipt: result, decision, evidence, next_allowed_task, blocked_tasks, completion decision when auditing.
```

`worker.md`:
```markdown
---
name: worker
description: Bounded implementer for one goal-maker Worker task. Writes only inside allowed_files; stops on scope expansion or verification failure.
model: sonnet
---
You are Worker for goal-maker. Execute exactly one Worker task.

Write only inside the task's allowed_files. Stop immediately if you need files outside scope, verification fails twice, or behavior is ambiguous.

Return a compact Worker receipt: result, changed_files, commands run with pass/fail, summary, remaining_blockers, needs_judge if strategy ambiguity remains.

Do not select the next active task or mark the goal complete.
```

The PM in the main thread spawns these via subagent type:
```text
Spawn the scout subagent for the active task T001 from docs/goals/<slug>/state.yaml.
```

Pros: each role gets its own context window — Scout findings don't pollute Worker context. Subagents return compact summaries.

Cons: no inter-role messaging (subagents only report to the PM). No shared task list.

## Option C: `/agent-teams` (full isolation + shared state)

Use Claude Code's Agent Teams feature. The main thread is the lead PM; spawn three teammates with the `name`s `scout`, `judge`, `worker`, each loading the subagent definitions above.

```text
Create an agent team for goal-maker run docs/goals/<slug>/. Spawn 3 teammates
using the scout, judge, and worker subagent types. The shared task list mirrors
state.yaml — each teammate reads state.yaml to know what to do, writes its
receipt directly to state.yaml after finishing, and signals the lead via
mailbox when done. Lead picks the next active task per the continuation rule.
```

Pros: each teammate gets its own context AND can message the lead asynchronously. Closest to the Codex experience. Lead can require plan approval for Worker tasks. Hooks (`TaskCompleted`) can run the checker automatically.

Cons: highest token cost. Best for genuinely long-running goals where context isolation pays off.

## Which to pick

- **Quick exploration / small goal**: Option A.
- **Multi-hour goal, want clean role boundaries**: Option B.
- **Multi-day goal, want full discipline + plan-approval gates**: Option C.

In all three, the board (`state.yaml`), the checker, the receipts, and the stop rule are identical. Only the *agents* differ.

## Wiring the checker as a TaskCompleted hook (Option C)

In `~/.claude/settings.json`:
```json
{
  "hooks": {
    "TaskCompleted": [{
      "command": "node $CLAUDE_PROJECT_DIR/.claude/skills/goal-maker/scripts/check-goal-state.mjs $CLAUDE_PROJECT_DIR/docs/goals/$(cat .goal-slug)/state.yaml || (echo 'goal-maker checker failed' && exit 2)"
    }]
  }
}
```

This makes the checker the gate (Principle #10) — no teammate can mark a task complete if the board is invalid.
