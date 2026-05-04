# Goal Maker Agents (Codex)

Three Codex agent definitions for the Scout / Worker / Judge roles. The main `/goal` thread is the PM and is **not** defined here — it's just the user's main Codex session running with the appropriate reasoning effort.

| Agent | File | Reasoning effort | Sandbox |
|---|---|---:|---|
| Scout | `goal_scout.toml` | medium | read-only |
| Worker | `goal_worker.toml` | low | workspace-write |
| Judge | `goal_judge.toml` | high | read-only |

## Install

**Project-scoped** (`.codex/agents/` in the repo root):
```bash
mkdir -p .codex/agents
cp ~/.claude/skills/goal-maker/agents/goal_*.toml .codex/agents/
```

**User-scoped** (`~/.codex/agents/`):
```bash
mkdir -p ~/.codex/agents
cp ~/.claude/skills/goal-maker/agents/goal_*.toml ~/.codex/agents/
```

## Recommended `~/.codex/config.toml` snippet

```toml
[agents]
max_threads = 4
max_depth = 1
job_max_runtime_seconds = 1800
```

`max_depth = 1` is important — it prevents agents from spawning their own sub-agents, which would break the one-active-task discipline.

## Rules

- Only the main `/goal` PM loop may select the active task, mark tasks done, update board truth, or mark the goal complete.
- Scout and Judge are read-only.
- At most one write-capable Worker active at a time.
- Judge runs at `high` reasoning. Don't downgrade.

## For Claude Code users

These `.toml` files are Codex-specific. To run goal-maker in Claude Code, see [../references/claude-code.md](../references/claude-code.md) — same roles, implemented as subagent definitions or `/agent-teams` teammate types.
