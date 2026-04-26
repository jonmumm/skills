---
name: agent-teams
description: Spawn and coordinate Claude Code Agent Teams — multiple Claude sessions sharing a task list and mailbox, with one lead coordinating teammates that can message each other directly. Use when the user wants parallel research, competing-hypothesis debugging, multi-perspective code review, or cross-layer feature work that's too coordinated for /nightshift or /swarm but too multi-agent for plain subagents. Triggers on "agent team", "claude-teams", "spawn teammates", "parallel review", "competing hypotheses", "team of claudes", or when the user mentions cmux claude-teams or CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS.
---

# Claude Code Agent Teams

Agent Teams is a Claude Code feature (v2.1.32+, experimental) where one session — the **lead** — spawns other Claude sessions — **teammates** — that share a task list, exchange messages via a mailbox, and can talk to each other directly. Unlike subagents (which only report back to their parent), teammates are first-class peers you can also address directly.

## When to reach for this vs. nearby patterns

| Pattern | Shape | Best for |
|---|---|---|
| **Subagents** | Spawn → work → return summary | One-shot research / verification where only the result matters |
| **Agent Teams** (this skill) | Lead + N teammates, shared task list, mailbox, can argue | Coordinated parallel work where teammates need to talk |
| **`/swarm`** | Orchestrator + workers in **git worktrees**, role-specialized (Feature/CRAP/Mutation/Acceptance) | Hardening one feature with continuous quality pressure |
| **`/nightshift`** | Orchestrator spawns long-running independent agents in **cmux workspaces** | Overnight backlog churn, no human in the loop |

The deciding question for Agent Teams: *"Do my parallel workers need to share state and message each other?"* If yes, use this. If no, subagents are cheaper and `/swarm`/`/nightshift` give better isolation.

**Token reality**: each teammate is a full Claude session with its own context window. A team of 5 burns ~5× the tokens of a single session. Worth it for review, hypothesis-testing, and exploration. Wasteful for routine implementation.

## Launch

Two paths — pick based on whether you're inside cmux:

**Inside cmux (preferred on this machine):**
```bash
cmux claude-teams --dangerously-skip-permissions
```
This sets `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` automatically and shims tmux on PATH so split-pane mode renders as native cmux pane splits stacked vertically in a right column, auto-equalizing as teammates join/leave. All args forward to `claude`. Works over cmux SSH.

**Outside cmux (raw):**
```bash
CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 claude
```
Or persist in `~/.claude/settings.json`:
```json
{ "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" } }
```
Without cmux, split-pane mode requires tmux or iTerm2 (with `it2` CLI + Python API enabled). In a plain terminal, fall back to **in-process mode** — all teammates run in the main terminal, Shift+Down cycles between them.

## Spawn the team

The lead spawns teammates from natural-language prompts. Use `cmux claude-teams` wording carefully — Lawrence flagged that Claude is fickle about the verb. **Say "spawn team agents" or "create an agent team", not "subagents"**, or the team feature may not trigger.

```text
Create an agent team with 3 teammates to investigate why the iOS app exits
after one Continuous Listening message. Have them work as competing
hypotheses — one on the WebSocket layer, one on actor-kit lifecycle, one on
audio session interruptions. Tell them to argue with each other, then write
the consensus to docs/incidents/2026-04-25-cl-disconnect.md.
```

The lead creates the team, spawns teammates, gives each a name, and routes the task list. Each teammate loads project context (CLAUDE.md, MCP, skills) but **not** the lead's conversation history — pack what they need to know into the spawn prompt.

## Display modes

- **`split` (default in cmux + tmux)** — each teammate gets its own pane. Click in to interact directly.
- **`in-process`** — all teammates inside the lead's terminal. Shift+Down cycles teammates; Enter views; Esc interrupts; Ctrl+T toggles task list.
- Override per-session: `claude --teammate-mode in-process`
- Override globally: `~/.claude/settings.json` → `"teammateMode": "in-process" | "tmux" | "auto"`

In cmux, prefer split mode — that's the whole point of using `cmux claude-teams`.

## Workflow primitives

### Direct teammate messaging
Address a teammate by name. Lead can route, but teammate-to-teammate works too.
```text
Ask the websocket-investigator to share their findings with the actor-kit-investigator.
```

### Plan approval mode
For risky teammate work, require a plan before any writes:
```text
Spawn an architect teammate to refactor src/auth/. Require plan approval.
Only approve plans that include test coverage and don't touch the DB schema.
```
The teammate works in read-only plan mode; the lead approves or rejects with feedback. Tell the lead its approval criteria in the spawn prompt — it decides autonomously.

### Reuse subagent definitions as teammate roles
Any subagent type from `~/.claude/agents/` or `.claude/agents/` works as a teammate role:
```text
Spawn a teammate using the security-reviewer agent type to audit src/auth/.
```
The teammate honors the subagent's `tools` allowlist and `model`. The body of the definition is *appended* to the system prompt (not replacement). **Caveat**: `skills` and `mcpServers` frontmatter on subagents are **not applied** when used as teammates — teammates load skills/MCP from project + user settings like a normal session.

### Shutdown and cleanup
```text
Ask the websocket-investigator to shut down.
```
The teammate can approve or reject the shutdown. When done, **always have the lead clean up** — never the teammates, or you'll leak resources:
```text
Clean up the team.
```
Cleanup fails if teammates are still running. Shut them down first.

## Hooks for quality gates

Three hooks specific to Agent Teams (configured in `settings.json`):

| Hook | Fires when | Exit 2 to… |
|---|---|---|
| `TeammateIdle` | A teammate is about to go idle | Send feedback and keep them working |
| `TaskCreated` | A task is being created | Block creation, send feedback |
| `TaskCompleted` | A task is being marked done | Block completion (force more verification) |

Powerful pattern: wire `TaskCompleted` to run `pnpm test && pnpm crap` and block completion if either fails. The teammate can't mark done without passing.

## Recipe library

### Parallel code review (3 teammates)
```text
Create an agent team to review PR #142. Spawn three reviewers, each with a
distinct lens — one on security implications, one on performance impact, one
on test coverage and CRAP score. Have them post findings to the task list,
then synthesize a single review comment.
```

### Competing-hypothesis debugging (5 teammates)
```text
Users report the app exits after one Continuous Listening message. Spawn 5
agent teammates to investigate different root cause hypotheses — actively try
to disprove each other's theories like a scientific debate. Update
docs/incidents/cl-disconnect.md with the consensus.
```

### Cross-layer feature (3 teammates)
```text
Create an agent team with 3 teammates to add the new "shared streak" feature.
One owns the database schema + queries (apps/api/src/db/), one owns the API
handlers (apps/api/src/routes/), one owns the iOS UI + tests. Use the
shared task list to coordinate the contract; use TDD per layer.
```

### Architecture exploration before writing code
```text
I'm designing a CLI for tracking TODO comments across the codebase. Create an
agent team to explore from three angles — one on UX, one on technical
architecture, one playing devil's advocate. Don't write code; produce a
docs/specs/todo-cli.md with the design and the tradeoffs each teammate raised.
```

## Composing with my other skills

- **`/grill-me`** before spawning a team — most "the team didn't converge" failures trace back to a fuzzy spawn prompt. Grill the goal first, then write the spawn message with the answers baked in.
- **`/swarm`** for hardening, **agent-teams** for exploration. They don't compete: swarm has fixed roles (Feature, CRAP, Mutation, Acceptance) running long; agent-teams is fluid teammates running short.
- **`/codex-review`** — instead of a single Codex pass, spawn an agent team where one teammate runs `/codex-review` and others compare its output to a Claude-native review. Catches divergence between the two models.
- **`/mutation-testing`** + **`/crap`** — wire as `TaskCompleted` hooks so teammates can't mark a feature task done without passing both gates.
- **`/cmux`** — Agent Teams' split-pane mode is the killer demo for `cmux claude-teams`. Cross-reference both directions.

## Storage and state

| Resource | Path |
|---|---|
| Team config (runtime, don't edit) | `~/.claude/teams/{team-name}/config.json` |
| Task list | `~/.claude/tasks/{team-name}/` |

`config.json` holds session IDs, pane IDs, and the `members` array (name, agent ID, type) — useful for teammates to discover each other but **rewritten on every state update**, so never pre-author or hand-edit.

There's no project-level team config. A `.claude/teams/teams.json` in your repo is just an ordinary file; Claude won't load it.

## Known limitations (April 2026, experimental)

- **No session resume for in-process teammates.** `/resume` and `/rewind` won't restore them. Lead may try to message ghost teammates — re-spawn them.
- **Task status can lag.** Teammates sometimes forget to mark tasks complete, blocking dependents. Nudge or update manually.
- **One team per session.** Clean up before starting a new one.
- **No nested teams.** Teammates can't spawn their own teammates.
- **Lead is fixed.** No promoting a teammate to lead, no transferring leadership.
- **Permissions inherited at spawn.** All teammates start in the lead's permission mode. Per-teammate modes can change post-spawn but not at spawn time.
- **Split panes need tmux/iTerm2 (or cmux).** No split mode in VS Code's integrated terminal, Windows Terminal, or plain Ghostty.

## Failure modes & fixes

- **Lead does the work itself instead of waiting.** Tell it explicitly: *"Wait for your teammates to finish their tasks before proceeding."*
- **Lead shuts down before tasks are done.** *"Keep going until all task list items are completed."*
- **Teammate stops on first error.** Open their pane, give them additional instructions directly — or spawn a replacement.
- **Permission-prompt storm.** Pre-approve common ops in `~/.claude/settings.json` permissions before spawning, or launch with `--dangerously-skip-permissions` if you trust the workspace.
- **Orphaned tmux sessions after team ends** (rare in cmux, common with raw tmux): `tmux ls` then `tmux kill-session -t <name>`.
- **`cmux claude-teams` doesn't spawn agents.** Lawrence's hint: phrase it as "spawn **team agents**" or "create an **agent team**". The keyword "subagents" doesn't trigger it.

## Related references

- [references/use-cases.md](references/use-cases.md) — fuller worked examples (overnight research team, multi-repo refactor, evals-driven design exploration)
- Claude Code docs: https://docs.claude.com/en/docs/claude-code/agent-teams
- cmux claude-teams: ships in cmux 0.63+; just run `cmux claude-teams`
