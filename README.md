# Skills

Personal AI agent skills. Install with the [Skills CLI](https://skills.dev).

## What's in this repo

| Skill | Description |
|-------|-------------|
| [actorkit-storybook-testing](actorkit-storybook-testing/) | Test actor-kit state machines in Storybook using mock clients and play functions. Covers static snapshots, interactive state transitions, event interception, and multi-actor nesting. |
| [actorkit-tanstack-start](actorkit-tanstack-start/) | Integrate actor-kit with TanStack Start/Router for server-rendered, real-time stateful apps on Cloudflare Workers. Covers route loaders, server functions, SSR hydration, and WebSocket handoff. |
| [adr-keeper](adr-keeper/) | Create and maintain Architectural Decision Records with date-named files sorted like migrations. Captures the WHY behind structural decisions. |
| [autoresearch](autoresearch/) | Set up and run Karpathy's autoresearch — autonomous AI research loop that trains a small LLM overnight. Agent modifies train.py, runs 5-min experiments, keeps improvements, discards failures (~100 experiments/night). |
| [chrome-cdp](chrome-cdp/) | Interact with local Chrome browser session. Lightweight CLI for DevTools Protocol: list tabs, take screenshots, navigate, and evaluate JS without Puppeteer. |
| [create-agents-md](create-agents-md/) | Bootstrap AGENTS.md as a table-of-contents + structured docs/ directory (architecture, product specs, acceptance tests, ADRs, lessons, exec plans, quality grades). |
| [deploy-verify](deploy-verify/) | Deploy Cloudflare Workers and verify changes work by inferring what to test from recent git diff. Flags issues without auto-rolling back. |
| [design-principle-enforcer](design-principle-enforcer/) | Relentlessly critiques code against classic software engineering principles (SOLID, separation of concerns) to prevent spaghetti architecture. |
| [dont-use-use-effect](dont-use-use-effect/) | Avoid unnecessary useEffect in React. Covers the 6 most common anti-patterns and their idiomatic alternatives. |
| [expo-testing](expo-testing/) | Build, install, and test Expo/React Native apps on simulators and physical devices. Detox E2E, local xcodebuild, EAS cloud builds, screenshot capture. |
| [grill-me](grill-me/) | Relentlessly interrogates an RFC or PRD plan. Walks down each branch of the design tree, resolving dependencies between decisions one-by-one. |
| [mutation-testing](mutation-testing/) | Stryker mutation testing — setup, run incremental, kill survivors, reach ≥95% score. Used by swarm's Mutation Agent. |
| [offensive-typesafety](offensive-typesafety/) | Move faster by using strict, compiler-enforced constraints. Treat types as a development accelerator. Prefer tools like TanStack Router, Zod, and Drizzle to build end-to-end type safety. |
| [parse-at-boundary](parse-at-boundary/) | Enforce "parse, don't validate" at every system edge. Data crossing a trust boundary must be parsed through a schema before entering application logic. Language-agnostic — TypeScript, Python, Go, Swift, Kotlin. |
| [react-composable-components](react-composable-components/) | Write and refactor React components to be small, composable, and customizable, doing one thing well. Leverage compound components, prop spreading, and utility class merging. |
| [react-render-performance](react-render-performance/) | Minimize unnecessary React re-renders with selectors and useSyncExternalStore. Patterns for XState, Zustand, Redux, and context. |
| [seam-tester](seam-tester/) | Focuses exclusively on writing robust integration tests at system boundaries (seams) rather than writing brittle, shallow unit tests. |
| [swarm](swarm/) | Launch parallel AI agents (Feature, CRAP, Mutate, Accept) in Git worktrees to automate both coding and continuous codebase hardening. **The primary workflow.** |
| [tlaplus](tlaplus/) | Formal verification of system designs using TLA+ and the TLC model checker. Models concurrent state machines, finds race conditions, deadlocks, and invariant violations before code is written. |
| [vsdd](vsdd/) | Verified Spec-Driven Development — rigorous spec → TDD → adversarial review → mutation testing pipeline. Three intensity levels (Full/Standard/Light). |
| [wide-events-logging](wide-events-logging/) | Implement observability using the Wide Events (Canonical Log Lines) pattern. Accumulate high-cardinality context and emit a single, highly-dimensional structured event per service boundary. |
| [workers-integration-testing](workers-integration-testing/) | Integration tests for Cloudflare Workers using vitest-pool-workers and `SELF.fetch()`. Full HTTP cycle testing against real local bindings (D1, KV, R2, DO, Hyperdrive). Hooks into /nightshift, /swarm, and /ralph-tdd. |

## Install

### Full stack (recommended)

[scripts/install-agents-md-stack.sh](scripts/install-agents-md-stack.sh) installs everything: CLIs, Playwright MCP, all skills from this repo, and curated companion skills.

Flags: `-g` / `--global` (default), `-p` / `--project` (project-scoped), `-f` / `--full` (extra skills), `-y` / `--yes` (non-interactive).

```bash
./scripts/install-agents-md-stack.sh -g          # interactive (recommended)
./scripts/install-agents-md-stack.sh -g -y       # non-interactive (install all recommended)
./scripts/install-agents-md-stack.sh -p          # project-scoped install
./scripts/install-agents-md-stack.sh -g --full   # also offer react/frontend extras
```

From a clone:

```bash
git clone https://github.com/jonmumm/skills.git && cd skills && ./scripts/install-agents-md-stack.sh -g
```

**What it installs:**

1. **CLIs** — Offers to install **Linear CLI** (`lin`), **Codex CLI**, **Claude Code CLI** if missing
2. **Playwright MCP** — Adds to `~/.codex/config.toml` (provides browser automation)
3. **This repo's skills** — All 20 skills listed above
4. **TDD & Testing companions** — TDD, Vitest, E2E patterns (see table below)
5. **Knowledge Infrastructure** — Gherkin writing, ADR writing (powers `create-agents-md`'s docs/ structure)
6. **Linear CLI skill** — Always installed (handy for generating backlogs)

### This repo's skills only

No CLIs, no MCP, no companion skills:

```bash
npx skills add jonmumm/skills --all -g -y
```

Or use the script:

```bash
./scripts/install-all-skills.sh        # global (default)
./scripts/install-all-skills.sh -p     # project only
```

### Single skill

```bash
npx skills add jonmumm/skills@swarm -g -y
npx skills add jonmumm/skills@create-agents-md -g -y
npx skills add jonmumm/skills@adr-keeper -g -y
```

### List available skills

```bash
npx skills add jonmumm/skills --list
```

## Scripts

| Script | What it does |
|--------|-------------|
| [scripts/install-agents-md-stack.sh](scripts/install-agents-md-stack.sh) | Full interactive installer: CLIs → MCP → skills → companions. The one-stop-shop. |
| [scripts/install-all-skills.sh](scripts/install-all-skills.sh) | Installs only this repo's skills (no CLIs, no companions). |

## Companion skills

The install script optionally installs these from other repos.

### TDD & Testing

| Companion | Source | Purpose |
|-----------|--------|---------|
| **tdd** | `mattpocock/skills` | TDD: vertical slices, red-green-refactor. Swarm's Feature Agent uses this. |
| **vitest** | `antfu/skills` | Vitest guidance for the TDD loop. |
| **e2e-testing-patterns** | `wshobson/agents` | E2E/Playwright patterns. |
| **linear-cli** | `schpet/linear-cli` | **Always installed.** Linear issue list/create/update/comment from CLI. |
| **Playwright MCP** | (added to Codex config) | Browser automation. |

### Knowledge Infrastructure

| Companion | Source | Purpose |
|-----------|--------|---------|
| **bdd-gherkin-specification** | `jzallen/fred_simulations` | Gherkin writing guidance. `create-agents-md` uses this for `docs/acceptance/` feature files. |
| **adr-writing** | `existential-birds/beagle` | ADR writing guidance. `create-agents-md` uses this for `docs/adrs/` entries. |
| **playwright-bdd-gherkin-syntax** | `thebushidocollective/han` | Gherkin → Playwright test generation. Optional, for web E2E projects. |

### Extras (with `--full`)

| Companion | Source | Purpose |
|-----------|--------|---------|
| **react-best-practices** | `vercel-labs/agent-skills` | React/Next.js performance. |
| **skill-creator** | `vercel-labs/agent-skills` | Creating new skills. |
| **vercel-composition-patterns** | `vercel-labs/agent-skills` | React component refactoring. |
| **prd-creator** | `vercel-labs/agent-skills` | PRD + task JSON backlog. |
| **frontend-code-review** | `vercel-labs/agent-skills` | Structured .tsx/.ts review. |
| **frontend-testing** | `vercel-labs/agent-skills` | Vitest + RTL component/hook tests. |

## Typical workflows

### Swarm (recommended)

Launch parallel agents that build features AND harden the codebase:

```bash
# 1. Bootstrap agent context (if AGENTS.md doesn't exist)
#    → creates AGENTS.md + docs/ structure
"create-agents-md"

# 2. Plan and launch the swarm
"swarm"
#    → grill-me interrogates the plan
#    → creates backlog from Linear/GitHub/local file
#    → launches Feature + CRAP + Mutation agents in worktrees
```

### VSDD (rigorous verification)

For correctness-critical work:

```bash
"vsdd"
#    → spec crystallization → TDD → adversarial review → mutation testing
```

## Agent working files

| Directory | Created by | Purpose |
|-----------|-----------|---------|
| `.swarm/` | swarm skill | Worktrees, run logs, tactical lessons (persists across runs) |
| `.claude/` | Claude Code | Session state |

Both are gitignored. The swarm script adds them to `.gitignore` automatically.

## Repo layout

Skills live at repo root (one folder per skill, each with `SKILL.md`). Optional: `references/`, `scripts/` inside each skill. No `skills/` subfolder required; the CLI discovers root-level skill folders.

## Adding a skill

1. Create `<skill-name>/SKILL.md` with frontmatter:

```markdown
---
name: skill-name
description: What it does. Use when [trigger scenarios].
---
```

2. Commit and push. New skills will appear in `npx skills add jonmumm/skills --list`.
