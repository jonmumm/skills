---
name: codex-goal
description: Hand a goal-maker board off to Codex (gpt-5.5, low reasoning by default) — Claude validates the board, runs `codex exec` with the /goal directive, captures the output, re-validates, and reports state changes. Use after /goal-maker bootstraps the charter and state.yaml when you want Codex (cheaper at low reasoning, separate context) to actually execute the PM loop while Claude Code stays the orchestrator. Triggers on "codex-goal", "run goal in codex", "delegate goal to codex", "hand to codex", or "/goal" when the user is in Claude Code (which doesn't have /goal natively).
---

# Codex Goal — Run goal-maker boards in Codex

`/goal-maker` bootstraps the board. **`/codex-goal` runs the PM loop in Codex** — same shape as `/codex-review` but for goal execution instead of code review. Claude Code stays the orchestrator; Codex does one PM iteration per invocation, leaves a receipt in `state.yaml`, and Claude reads it back.

> **Principle #10 (Agents drift, gates don't)** — the checker (`check-goal-state.mjs`) runs *before* the Codex invocation (refuse to delegate to a broken board) and *after* (verify the board is still valid post-edit). Both gates are non-bypassable. **Principle #7 (Reversibility)** — one task per invocation by default; the human stays in the loop between iterations unless they explicitly opt into `--continue`. See [/principles](../principles/SKILL.md).

## Why hand off to Codex at all

Two reasons:

1. **Cost.** `gpt-5.5` at `low` reasoning is dramatically cheaper than running the same loop in Claude Opus. For Worker tasks (bounded scope, deterministic verify commands), low reasoning is exactly the right effort.
2. **Context isolation.** Each Codex `exec` invocation is a fresh session. The PM loop in `goal.md` plus the active task in `state.yaml` is *all* the context the Codex thread needs — no Claude conversation history bleeds in. This is the same discipline goal-maker is built around.

Reasons NOT to use this — keep the loop in Claude:
- Active task is Judge on a high-stakes call (use `high` reasoning, do it in Claude Opus or Codex with `-c model_reasoning_effort=high`)
- You're actively iterating on the goal/charter and want to see Claude's reasoning per turn
- The task involves a domain Codex hasn't been given context for in CLAUDE.md (Codex won't auto-load CLAUDE.md the same way)

## When to use

After `/goal-maker` has produced a valid board and you want the next active task executed by Codex. Particularly good for:
- Worker tasks with clear `allowed_files` + `verify` commands (this is the cost/iso win)
- Long-running goals where Claude Opus tokens add up
- Recovery-flavored goals where you've already mapped the problem and the Worker just needs to run the fix

## Workflow

```
1. Discover the goal slug (arg, or auto-detect from docs/goals/)
2. Validate the board pre-flight (check-goal-state.mjs must exit 0)
3. Read state.yaml — note the active task type (sets sandbox mode)
4. Run codex exec with the /goal directive, capture output to .codex-goal-output.md
5. Validate the board post-flight (checker again — refuse "looks done" Codex output)
6. Parse the receipt for changed_files, decision, summary
7. Report state changes to the user; offer next action
```

## Step 1: Discover the goal

```bash
# Explicit
/codex-goal docs/goals/deployed-e2e/goal.md

# Auto-detect — single goal in repo
ls docs/goals/*/goal.md | head -1

# Auto-detect — multiple goals; pick the one whose state.yaml has goal.status: active
for g in docs/goals/*/goal.md; do
  state="$(dirname $g)/state.yaml"
  status=$(grep -E '^\s+status:' "$state" | head -1 | awk '{print $2}')
  echo "$status $g"
done | grep '^active'
```

If multiple actives exist, ask the user which.

## Step 2: Pre-flight validate the board

**This is the gate.** Refuse to invoke Codex against an invalid board.

```bash
GOAL_DIR="docs/goals/<slug>"
node ~/.claude/skills/goal-maker/scripts/check-goal-state.mjs "$GOAL_DIR/state.yaml" || {
  echo "Board invalid — refusing to delegate to Codex. Fix the board first."
  exit 2
}
```

If the checker fails, *do not* run `codex exec`. Surface the errors to the user, fix them, re-validate, then proceed.

## Step 3: Read active task type

The active task type determines Codex's sandbox:

| Active task | Codex sandbox | Why |
|---|---|---|
| `scout` | `read-only` | Scout is read-only by definition |
| `judge` | `read-only` | Judge is read-only by definition |
| `worker` | `workspace-write` | Bounded by `allowed_files` enforced via prompt |
| `pm` | `workspace-write` | PM may update control files |

```bash
ACTIVE_TYPE=$(grep -E '^\s+type:' "$GOAL_DIR/state.yaml" | head -1 | awk '{print $2}')
case "$ACTIVE_TYPE" in
  scout|judge) SANDBOX="read-only" ;;
  worker|pm)   SANDBOX="workspace-write" ;;
  *)           echo "Unknown active task type: $ACTIVE_TYPE"; exit 2 ;;
esac
```

## Step 4: Run Codex

The default invocation (`codex exec` flags first-class where available, `-c` only for reasoning effort):

```bash
codex exec "/goal Follow $GOAL_DIR/goal.md" \
  --model gpt-5.5 \
  --sandbox "$SANDBOX" \
  --cd "$PWD" \
  --skip-git-repo-check \
  --output-last-message ".codex-goal-receipt.md" \
  -c model_reasoning_effort="low" \
  2>&1 | tee .codex-goal-output.md
```

### Why these defaults

- **`gpt-5.5`** via `--model` — current default; matches `/codex-review`. Older codex CLI (<0.125) silently falls back to gpt-5.4; verify with `codex --version` if outputs look weird.
- **`--sandbox <mode>`** — first-class flag, takes `read-only | workspace-write | danger-full-access`. Set per active task type (table above).
- **`--cd "$PWD"`** — explicit cwd anchors Codex even when invoked from a sub-shell.
- **`--skip-git-repo-check`** — goals often live in worktrees or sub-paths; the repo check is noisy and not adding safety here.
- **`--output-last-message`** — captures Codex's final message (typically the receipt summary) to a file Claude reads back. The full transcript still goes to `.codex-goal-output.md` via `tee`.
- **`-c model_reasoning_effort=low`** — no first-class flag for reasoning effort; must use `-c`. Override per-task with `-c model_reasoning_effort=high` for Judge audits.

### Optional: JSONL events for structured parsing

If you want Claude to parse Codex's actions reliably (e.g. extract every file-write event), add `--json` for JSONL output:

```bash
codex exec --json "/goal Follow $GOAL_DIR/goal.md" \
  --model gpt-5.5 --sandbox "$SANDBOX" --cd "$PWD" --skip-git-repo-check \
  -c model_reasoning_effort="low" \
  > .codex-goal-events.jsonl
```

Then `cat .codex-goal-events.jsonl | jq 'select(.type=="file_change")'` etc. Use this when you want deterministic post-flight analysis instead of trusting Codex's narrative summary.

### Per-task overrides

| Active task | Recommended override |
|---|---|
| Worker, simple bounded fix | defaults (low) |
| Worker, complex with strategy questions | `-c model_reasoning_effort=medium` |
| Judge, routine receipt review | defaults (low) |
| Judge, completion audit / risk decision | `-c model_reasoning_effort=high` |
| Scout, narrow evidence map | defaults (low) |
| Scout, broad repo discovery | `-c model_reasoning_effort=medium` |

## Step 5: Post-flight validate the board

Codex may have written a receipt and updated `state.yaml`. **Re-run the checker** before declaring success:

```bash
node ~/.claude/skills/goal-maker/scripts/check-goal-state.mjs "$GOAL_DIR/state.yaml" || {
  echo "Board invalid AFTER Codex run — Codex left the board in a bad state. Inspect."
  exit 2
}
```

If the post-flight checker fails, **don't** auto-fix it. Show the user the checker errors and let them decide whether to revert Codex's edits or fix forward.

## Step 6: Parse and report

Read the captured output and summarize:

- What task did Codex work on (T### + type)?
- What's the receipt result (`done` / `blocked` / etc.)?
- For Worker: changed files, command pass/fail
- For Scout: evidence + spawned tasks
- For Judge: decision + next_allowed_task
- What's the new active task (board's continuation)?

Format the summary like `/codex-review` does — categorize for action:

```
Codex Goal Run — T001 (scout) — gpt-5.5/low

Receipt: done
Summary: Mapped 7 specs in tests/e2e; 4 are auth-flow, 3 are admin-dashboard.
         Found one currently failing locally (login.spec.ts:42).
Evidence: tests/e2e/login.spec.ts, tests/e2e/admin-dashboard.spec.ts, ...
Spawned tasks: T005 (Scout — investigate login.spec.ts:42 failure)

Next active: T002 (judge — choose first tranche)
Continue? [Y/n]
```

## Step 7: Continuation

By default, **stop after one PM iteration** and ask the user. This is Principle #7 (reversibility) — one task at a time, human between iterations.

For AFK runs, the user can opt in:

```bash
/codex-goal docs/goals/<slug>/goal.md --continue
```

Continue mode loops `step 2 → step 6` until any of:
- Stop rule fires (goal status `done` or `blocked`)
- Checker fails post-flight
- Same task is "active" two iterations in a row (no progress — escalate)
- User-supplied `--max-iterations N` is reached (default 10 if `--continue` is set)
- Codex returns non-zero

## Composing with other skills

| Skill | Composition |
|---|---|
| **`/goal-maker`** | Bootstraps the board. `/codex-goal` runs it. Always invoke `/goal-maker` first when there's no board. |
| **`/codex-review`** | A Judge task can spawn a `/codex-review` for a second opinion before approving completion — wire this into the Judge's instructions for high-stakes audits. |
| **`/babysit-pr`** | If the goal produces a PR, hand the PR off to babysit-pr after the final Judge audit. Don't merge from inside `/codex-goal`. |
| **`/grill-me`** | If the user invokes `/codex-goal` against a goal whose charter is mush, redirect to `/grill-me` first — Codex with low reasoning won't compensate for a vague charter. |

## Configuration

### Verifying Codex CLI version

```bash
codex --version  # must be >= 0.125 for gpt-5.5
```

If older, upgrade: `npm install -g @openai/codex@latest`

### Codex agent definitions

If goal-maker's Codex agents (`goal_scout.toml`, `goal_worker.toml`, `goal_judge.toml`) are installed in `~/.codex/agents/`, Codex's main thread (PM) can dispatch to them as sub-agents during the run. Without them, the PM simulates the roles in-thread (still works, just less context isolation between roles).

Install them once:
```bash
mkdir -p ~/.codex/agents
cp ~/.claude/skills/goal-maker/agents/goal_*.toml ~/.codex/agents/
```

### Environment

The Codex run inherits the cwd of the invocation. Always invoke from the project root (or the worktree root) where `docs/goals/<slug>/` is reachable by the relative path you pass.

## Gotchas

- **Codex doesn't load CLAUDE.md the same way Claude Code does.** It reads `AGENTS.md` (Codex's equivalent). If your project has CLAUDE.md but no AGENTS.md, Codex will be missing project context. Either symlink or duplicate the relevant sections — `/create-agents-md` exists for exactly this.
- **`/goal` is not a built-in Codex command.** It's a directive prefix. `codex exec "/goal Follow ..."` works because exec treats it as the prompt; the leading slash is harmless. If you ever see Codex confused, drop the `/goal` and just say `Follow docs/goals/<slug>/goal.md per the PM Loop in that file.` — same outcome.
- **Don't loop forever on `--continue`.** The stop rule in `goal.md` is the discipline; if the goal is poorly bounded, the loop will burn tokens. Default cap is 10 iterations; raise deliberately, never automatically.
- **Codex review is read-only; Codex exec is not.** `/codex-review` (the other skill) defaults to read-only because it just reads diffs. `/codex-goal` flips between read-only (Scout/Judge) and workspace-write (Worker/PM) per active task — that's the safety mechanism.
- **The board is the source of truth, not the captured output.** `.codex-goal-output.md` is for Claude to parse and report. Always re-read `state.yaml` for state — Codex may have written more there than what its stdout summarized.
- **Don't have Claude rewrite the board.** If the post-flight checker fails, surface to the user. Auto-fixing means Claude is now drifting in a way `/codex-goal` was supposed to prevent.

## Quick reference

```bash
# One iteration, defaults (gpt-5.5, low, sandbox per active task type)
/codex-goal docs/goals/<slug>/goal.md

# One iteration, high reasoning for Judge audits
/codex-goal docs/goals/<slug>/goal.md --reasoning high

# Continue until stop rule, max 5 iterations
/codex-goal docs/goals/<slug>/goal.md --continue --max-iterations 5

# Specify model explicitly
/codex-goal docs/goals/<slug>/goal.md --model gpt-5.5
```
