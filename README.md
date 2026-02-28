# Skills

Personal AI agent skills. Install with the [Skills CLI](https://skills.dev).

## What's in this repo

These five skills are installed when you add this repo (`npx skills add jonmumm/skills --all`):

| Skill | Description |
|-------|-------------|
| [ralph-creator](ralph-creator/) | Create AFK Ralph loop scripts for any task. Generates a complete .ralph/ directory with loop script, backlog, progress tracking, and lessons file. Use when you want to create a custom ralph script for doing something on a long-running loop. |
| [ralph-tdd](ralph-tdd/) | Autonomous TDD loop — agent picks tasks from a backlog, implements with TDD (uses mattpocock/skills@tdd), verifies with mutation testing, commits. AFK coding. |
| [ralph-dogfooding](ralph-dogfooding/) | Autonomous dogfooding loop — explores core routes with Playwright MCP, captures evidence, dedupes in Linear via the linear-cli skill, logs progress per iteration. |
| [mutation-testing](mutation-testing/) | Stryker mutation testing — setup, run incremental, kill survivors, reach ≥95% score. Used by ralph-tdd's quality gate. |
| [create-agents-md](create-agents-md/) | Create minimal AGENTS.md (WHAT/WHY/HOW, feedback commands, .ralph/lessons). Ralph scripts prompt the agent to run this first when AGENTS.md is missing. |

## Install

**Ralph stack (recommended)**

[scripts/install-ralph-stack.sh](scripts/install-ralph-stack.sh) does the following in order. Flags: `-g` / `--global` (default), `-p` / `--project` (project-scoped), `-f` / `--full` (extra skills), `-y` / `--yes` (non-interactive).

1. **CLIs** — Offers to install **Linear CLI** (`lin`/`linear`), **Codex CLI**, **Claude Code CLI** if missing.
2. **Playwright MCP** — Adds Playwright MCP to `~/.codex/config.toml` so Codex can drive the browser (ralph-dogfooding uses it).
3. **This repo's skills** — Runs `npx skills add jonmumm/skills --all` (installs all four skills above).
4. **Companion skills** — Always installs **linear-cli** (schpet/linear-cli; required for ralph-dogfooding). Then asks for each optional skill (tdd, vitest, e2e-testing-patterns; see table below). Use `-y` to accept defaults (install recommended companions, skip CLI install prompts). Use `-p` to install skills for the current project instead of globally.

```bash
./scripts/install-ralph-stack.sh --global
./scripts/install-ralph-stack.sh -g -y   # non-interactive (recommended companions, skip CLI prompts)
./scripts/install-ralph-stack.sh -p      # project-scoped install
```

With `--full`, the script also offers **react-best-practices** and **skill-creator**:

```bash
./scripts/install-ralph-stack.sh -g --full
```

From a clone:

```bash
git clone https://github.com/jonmumm/skills.git && cd skills && ./scripts/install-ralph-stack.sh -g
```

**This repo's skills only** (no CLIs, no MCP, no companions):

```bash
npx skills add jonmumm/skills --all -g -y
```

**Single skill:**

```bash
npx skills add jonmumm/skills@ralph-tdd -g -y
npx skills add jonmumm/skills@ralph-dogfooding -g -y
```

**List skills in this repo:**

```bash
npx skills add jonmumm/skills --list
```

## Companion skills (install script)

The script optionally installs these from other repos. ralph-tdd and ralph-dogfooding expect the recommended ones to be present.

| Companion | Purpose |
|-----------|--------|
| **schpet/linear-cli** (linear-cli) | **Always installed.** Linear issue list/create/update/comment from CLI. ralph-dogfooding uses this. |
| **mattpocock/skills@tdd** | TDD: vertical slices, red-green-refactor. ralph-tdd relies on this. |
| **antfu/skills@vitest** | Vitest guidance for the TDD loop. |
| **wshobson/agents@e2e-testing-patterns** | E2E/Playwright patterns for ralph-tdd. |
| **Playwright MCP** | Added to Codex config by the script (not a skill). ralph-dogfooding uses it for browser automation. |

With `--full` the script also offers and installs: **react-best-practices**, **skill-creator**, **vercel-composition-patterns** (component refactoring), **prd-creator** (PRD + task JSON), **frontend-code-review** (structured .tsx/.ts review), **frontend-testing** (Vitest + RTL). It tries `vercel-labs/agent-skills@<name>` for each; if a skill isn’t in that repo the install is skipped and the script continues.

## Ralph working files in your project

When you run the Ralph scripts with `--project /path/to/repo`, they write working files (progress, lessons, dogfood progress, screenshots) into **`.ralph/`** in that project. Both scripts ensure **`.ralph/`** is appended to the project’s `.gitignore` if it isn’t already there, so these files are not committed.

## Repo layout

Skills live at repo root (one folder per skill, each with `SKILL.md`). Optional: `references/`, `scripts/` inside each skill. No `skills/` subfolder required for this repo; the CLI discovers root-level skill folders.

## Adding a skill

1. Create `<skill-name>/SKILL.md` with frontmatter:

```markdown
---
name: skill-name
description: What it does. Use when [trigger scenarios].
---
```

2. Commit and push. New skills will appear in `npx skills add jonmumm/skills --list`.
