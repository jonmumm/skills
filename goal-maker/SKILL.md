---
name: goal-maker
description: Set up a rolling Scout/Judge/Worker task board with a charter, machine-truth state.yaml, and durable receipts for long-running autonomous coding work. Use when a goal is broad, multi-hour, ambiguous, recovery-flavored, or needs serial discipline (one active task at a time) instead of parallel teammates. Triggers on "goal-maker", "set up a goal", "create a charter", "rolling task board", "scout/judge/worker", "PM-owned board", or when the user wants long-running autonomous work that's NOT a parallel swarm and NOT a multi-milestone mission. Pairs with /grill-me upfront and /principles #10 (gates), #6 (find what's hard), and #4 (document intent).
---

# Goal Maker

Turn a vague long-running goal into a rolling task board with one active task, a charter, and durable receipts. Adapted from [tolibear/goal-maker](https://github.com/tolibear/goal-maker).

The loop:

```text
vague goal → Scout (discovery) → Judge (decide tranche) → Worker (one bounded task) → receipt → board update → repeat
```

> **Principle #6 (Find what's hard)** — for vague goals, the first task is *always* Scout, not Worker. Implementing from vibes is the most common failure. **Principle #10 (Agents drift, gates don't)** — completion requires a final Judge or PM audit receipt with `decision: complete`; "looks done" never marks it done. **Principle #4 (Document intent)** — the charter (`goal.md`) captures *intent*; the board (`state.yaml`) captures *truth*; when they conflict, the board wins for status, the charter wins for *why*. See [/principles](../principles/SKILL.md).

## When to use this skill (vs. /missions, /swarm, /nightshift, /agent-teams)

| Pattern | Shape | Best for |
|---|---|---|
| **goal-maker** (this) | One active task, serial, PM-owned board with receipts | Single autonomous run on an ambiguous, long-running goal where serial discipline + receipts matter more than parallelism |
| **/missions** | Multi-milestone, validation gates, parallel worktree workers + independent validators | Large multi-day objectives decomposed into milestones |
| **/swarm** | Parallel agents in worktrees: Feature/CRAP/Mutation/Acceptance | Hardening one feature with continuous quality pressure |
| **/nightshift** | Sequential overnight backlog churn | Working through a known list of small tasks AFK |
| **/agent-teams** | Lead + teammates with shared task list and mailbox | Tightly coordinated parallel work where teammates argue |

The deciding question for goal-maker: *"Is the goal vague enough that I need discovery before I can even decompose it, and disciplined enough that I want exactly one thing happening at a time with a paper trail?"* If yes, this is the skill.

For Codex users, this is the most natural fit (the pattern was designed for Codex). For Claude Code users, this works in a single Claude session as PM, optionally delegating to subagents (Scout/Judge/Worker as subagent types) — see [references/claude-code.md](references/claude-code.md).

## What this skill does when invoked

Prepare or repair a goal board, then **stop for the user**. Never auto-launch the agent loop.

When invoked:
1. Clarify the goal title + slug. If vague, propose two or three.
2. Classify the goal kind: `specific | open_ended | recovery | audit`.
3. Create or repair `docs/goals/<slug>/` with:
   - `goal.md` — charter (from [templates/goal.md](templates/goal.md))
   - `state.yaml` — board (from [templates/state.yaml](templates/state.yaml))
   - `notes/` — directory for long receipts
4. Seed a role-tagged task board (Scout first if vague; Worker first only if evidence is concrete and tranche is bounded).
5. Make the first active task safe: read-only Scout for vague goals, narrow Worker for specific ones.
6. Verify the agent definitions are installed (Codex) or the Claude Code subagent types exist.
7. Print the run command:
   - **Codex**: `/goal Follow docs/goals/<slug>/goal.md`
   - **Claude Code**: `Read docs/goals/<slug>/goal.md and run the PM loop. Work the active task only.`
8. Ask: start now, refine `goal.md` first, or stop.

Do not:
- Auto-start the loop. The user's choice gates execution.
- Create `evidence.jsonl`, `units/`, or `artifacts/` (those are v1 artifacts; rejected by the v2 checker).
- Edit implementation files before the board exists.
- Invent Worker tasks from vibes when Scout is needed first.
- Treat `goal.md` as board truth when it conflicts with `state.yaml`.

## The four primitives

1. **Charter** (`goal.md`) — what the tranche is trying to accomplish, what's non-negotiable, when to stop
2. **Board** (`state.yaml`) — rolling task list, machine truth for status/active/receipts/verification
3. **Task** — exactly one active at a time
4. **Receipt** — compact durable proof per task: what changed, learned, decided, blocked, or spawned

Agents are not a primitive — they're the assignee type on a task.

## Control files (v2 layout)

```text
docs/goals/<slug>/
  goal.md
  state.yaml
  notes/
```

The goal root may contain *only* these three. The checker rejects anything else — that strictness prevents drift.

Most receipts live inline in `state.yaml`. Use `notes/<task-id>-<slug>.md` only when a Scout, Judge, or PM result is too large for the task card. Worker receipts almost never need notes — if they do, the task was too big.

## Charter (goal.md)

The charter answers four questions:

```text
What are we trying to improve?
What constraints are non-negotiable?
Is this goal specific, open-ended, recovery, or audit?
What counts as enough for the current tranche?
```

Avoid forever goals. A broad objective like "improve the codebase" needs a tranche:

> Discover the highest-leverage local improvements, complete the first safe implementation tranche, and leave a reviewable handoff for anything larger.

This is **Principle #2 (Rebuild often)** in disguise — every tranche is a checkpoint where you ask "would I structure this the same way knowing what I know now?" before continuing.

## Board (state.yaml)

A task card:

```yaml
id: T001
type: scout | judge | worker | pm
assignee: Scout | Judge | Worker | PM
status: queued | active | blocked | done
objective: "<one sentence>"
inputs: []
constraints: []
expected_output: []
receipt: null
```

Worker tasks additionally require:

```yaml
allowed_files: []   # the only files this Worker may write
verify: []          # commands to run before claiming done
stop_if: []         # conditions that force the Worker to stop and escalate
```

The PM owns the board. Scout, Judge, and Worker return receipts; they don't select the next active task or mark the goal complete.

> **Principle #7 (Reversibility over correctness)** — `allowed_files` is the reversibility lever. Bound the blast radius before the Worker starts. If the Worker decides it needs files outside scope, it stops and escalates — it doesn't widen scope unilaterally.

## Seed boards

**Vague goal → Scout first:**

```yaml
tasks:
  - id: T001
    type: scout
    assignee: Scout
    status: active
    objective: "Map repo health and identify improvement candidates."
    receipt: null
  - id: T002
    type: judge
    assignee: Judge
    status: queued
    objective: "Choose the first tranche by impact, confidence, reversibility, verification strength."
    receipt: null
  - id: T003
    type: worker
    assignee: Worker
    status: queued
    objective: "Execute the first chosen implementation task."
    allowed_files: []
    verify: []
    stop_if:
      - "Need files outside allowed_files."
      - "Behavior is ambiguous."
      - "Verification fails twice."
    receipt: null
```

**Specific goal with adequate evidence → Worker first.**

**Recovery / red verification → Judge first** to decide what's safe to touch.

## Task rules

- **Scout** tasks are read-only and produce findings.
- **Judge** tasks are read-only and produce decisions or constraints.
- **Worker** tasks may write only inside `allowed_files`.
- **PM** tasks may update control files and board state.

No implementation without an active Worker or PM task that explicitly allows it.

At most one write-capable Worker may be active. Don't run parallel Workers unless `state.yaml` proves disjoint write scopes *and* the user explicitly asked for parallel agent work.

## Receipts

A receipt is compact proof. Inline in `state.yaml` whenever it fits.

**Scout:**
```yaml
receipt:
  result: done
  summary: "Found three high-leverage candidates: flaky auth tests, missing router coverage, stale build docs."
  evidence:
    - test/auth/session.test.ts
    - src/router/index.ts
    - README.md
  spawned_tasks: [T004]
```

**Judge:**
```yaml
receipt:
  result: done
  decision: "Do router coverage first; defer auth flake — not reproducible locally."
  next_allowed_task: T004
  blocked_tasks: [T005]
```

**Worker:**
```yaml
receipt:
  result: done
  changed_files:
    - src/billing/router.ts
    - test/billing/router.test.ts
  commands:
    - cmd: git diff --check
      status: pass
    - cmd: pnpm test test/billing/router.test.ts
      status: pass
  summary: "invoice.paid now routes through eventRouter.dispatch; regression test added."
```

For long output → write `notes/<task-id>-<slug>.md` and reference it:
```yaml
receipt:
  result: done
  note: notes/T001-repo-map.md
  summary: "Repo map completed; three candidate tranches found."
```

## Computed gate

Don't store manual gate booleans. The gate is computed from the active task type:

| Active task | Edits allowed? | Receipt must include |
|---|---|---|
| Scout | No | findings or note |
| Judge | No | decision |
| Worker | Yes, only inside `allowed_files` | changed files + commands |
| PM | Limited to control files unless task says otherwise | board update summary |

If verification is red, stale, blocked, or unknown → choose recovery / Scout / Judge / PM board work before feature work.

## Blocked ≠ stop

Blocked tasks don't necessarily block the goal. The PM should keep doing safe local board work:

- Create a Scout task to improve evidence
- Create a Judge task to resolve ambiguity
- Create a Worker task for a smaller safe slice
- Write a handoff note
- Update receipts and verification freshness

Set `goal.status: blocked` only when *every* safe local next action is blocked, unsafe, or requires owner input.

## Continuation rule

After a task completes, immediately write its receipt and select the next active task — *unless*:
- The tranche audit passes
- Every safe local next action is blocked
- Owner input is required
- Continuing would require credentials, destructive operations, or product strategy outside the board

Don't end with an active task marked done.

Run the checker after each board update:

```bash
node ~/src/skills/goal-maker/scripts/check-goal-state.mjs docs/goals/<slug>/state.yaml
```

If the checker and your judgment disagree → choose the more conservative state. The checker is **the gate** (Principle #10).

## Agents (Codex .toml or Claude Code subagents)

Three roles, one PM:

| Role | Reasoning effort | Write access | Use for |
|---|---:|---:|---|
| Scout | medium | no | source/spec/repo evidence mapping |
| Worker | low | yes, bounded | one exact implementation or recovery task |
| Judge | high | no | strategic review, ambiguity, scope, completion skepticism |
| PM (main thread) | medium–high | board only | owns task selection, receipts, completion |

**Codex setup**: copy [agents/](agents/) into `.codex/agents/` (project) or `~/.codex/agents/` (user). See [agents/README.md](agents/README.md).

**Claude Code setup**: see [references/claude-code.md](references/claude-code.md) — use subagent definitions or `/agent-teams` teammates with the same `name`/`model`/instructions, and let the PM (lead) self-coordinate via the shared task list.

Only the PM may choose the active task, mark tasks done, or mark the goal complete.

## PM thinking policy

| Goal kind | PM thinking |
|---|---:|
| specific, bounded | medium |
| open-ended | high |
| recovery | high |
| audit | high |
| high-risk or multi-day final audit | xhigh (optional) |

Don't use `xhigh` by default. Use it only when a wrong board / scope / completion decision would be materially more expensive than latency and cost.

Tasks may include `reasoning_hint: default | low | medium | high | xhigh` as PM guidance — never as permission to widen scope.

## Completion (the strictest gate)

Never complete because work *looks* substantial. Completion is a Judge or PM audit task. The goal is done only when a final done Judge or PM receipt says the current tranche is complete and maps completion to current receipts and verification.

Default final task:

```yaml
- id: T999
  type: judge
  assignee: Judge
  status: queued
  objective: "Audit whether the current tranche is complete."
  inputs:
    - "All done task receipts"
    - "Last verification"
    - "Current dirty diff"
  expected_output:
    - "complete | not_complete"
    - "missing evidence"
    - "next task if not complete"
  receipt: null
```

The checker enforces this — `goal.status: done` without a final Judge/PM audit receipt with `decision: complete` will fail.

## Default run command

**Codex:**
```text
/goal Follow docs/goals/<slug>/goal.md
```

**Claude Code:**
```text
Read docs/goals/<slug>/goal.md and state.yaml. Work only the active task. After completing it, write the receipt to state.yaml, then select the next active task per the continuation rule. Stop only per the stop rule.
```

## Composing with other skills

- **`/grill-me` first** — interrogate the goal before bootstrapping the board. The Scout-first discipline prevents implementing from vibes, but a Goal that's mush before Scout produces a Scout task that's also mush.
- **`/codex-goal` to execute** — once the board is valid, hand the PM loop off to Codex (gpt-5.5, low reasoning) for cost + context-isolation wins. Claude validates the board pre and post, parses the receipt, and reports state changes. The natural pairing: `/goal-maker` (Claude scopes) → `/codex-goal` (Codex executes) → repeat.
- **`/missions`** for multi-milestone goals (this is single-tranche; for *the next 5 tranches*, use missions which builds in milestone gates).
- **`/agent-teams`** in Claude Code — instead of separate Codex agents, the PM is the team lead and Scout/Judge/Worker are teammates with the agent type specified in the spawn prompt.
- **`/codex-review`** for the Judge role on hard decisions — give Judge the option to invoke a Codex review for a second opinion on tranche-completion calls.
- **`/crap` and `/mutation-testing`** as gates inside Worker `verify` commands — make Worker receipts include `pnpm crap` and `pnpm test:mutate:incremental` results.
- **`/wide-events-logging`** — every PM-loop iteration could emit a wide event with goal slug, active task, decision, receipt summary. Makes goal runs queryable later.

## Related

- [scripts/check-goal-state.mjs](scripts/check-goal-state.mjs) — the v2 board checker
- [templates/](templates/) — `goal.md`, `state.yaml`, `note.md`
- [agents/](agents/) — Codex agent definitions (.toml)
- [references/claude-code.md](references/claude-code.md) — running goal-maker in Claude Code instead of Codex
- [references/credit.md](references/credit.md) — origin and license

## Status

This is the v2 board/receipt model. It intentionally rejects v1 (`gate`, `units`, `artifacts`, `evidence.jsonl`) instead of auto-migrating. If you find a v1 goal folder, create a fresh v2 goal next to it and migrate by hand.
