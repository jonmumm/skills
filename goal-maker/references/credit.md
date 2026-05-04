# Origin and Credit

This skill is a Jonathan-flavored adaptation of [tolibear/goal-maker](https://github.com/tolibear/goal-maker) by Tobias Liebrenz.

## What was preserved verbatim

- The **v2 board model**: `goal.md` charter + `state.yaml` board + `notes/` for long receipts
- The **four primitives**: charter, board, task, receipt
- The **role definitions**: Scout (read-only, medium), Worker (low, bounded write), Judge (high, read-only)
- The **computed gate**: edits allowed only when active task is Worker (or PM with explicit scope)
- The **continuation rule** and **stop rule**
- The **completion gate**: requires final Judge or PM audit receipt with `decision: complete`
- The **board checker** (`scripts/check-goal-state.mjs`) — line-oriented YAML parser, intentionally dependency-free
- The **Codex agent definitions** (`agents/goal_*.toml`) and recommended `[agents]` config snippet
- The **template files**: `goal.md`, `state.yaml`, `note.md`

## What was changed for Jonathan's setup

- Removed the **npm CLI infrastructure** (`bin/`, `package.json`, install scripts) — this skill is distributed via skpm from the jonmumm/skills repo, not as an npm package
- Removed **CONTRIBUTING.md, examples/, assets/, tests/** — kept the runtime; the dev infrastructure lives in the original repo
- Added a **Claude Code adaptation guide** ([claude-code.md](claude-code.md)) covering three options: single-session PM, subagent definitions, or `/agent-teams`
- Added **principle callouts** (#6, #10, #4, #2, #7) cross-referencing [/principles](../../principles/SKILL.md)
- Added **comparison with `/missions`, `/swarm`, `/nightshift`, `/agent-teams`** so the right pattern wins
- Switched **example commands to pnpm** (e.g. `pnpm test` instead of `npm test`)
- Updated the **trigger description** for Jonathan's vocabulary ("rolling task board", "PM-owned board", "scout/judge/worker")

## License

Original goal-maker is open source. Check the upstream repo for the current license. This adaptation inherits whatever license tolibear publishes.

## When to upstream

If you make improvements here that are tool-agnostic (e.g. checker bug fixes, template improvements, a new task type), consider opening a PR upstream so the community benefits. Claude-Code-specific bits stay here.
