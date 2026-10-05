# Skills

Personal AI agent skills. Install with [skpm](https://skpm.sh) — dependencies are resolved automatically.

## What's in this repo

| Skill | Description |
|-------|-------------|
| [agent-review](agent-review/) | Cross-agent code review using the Cursor Agent CLI in read-only Ask mode, followed by systematic triage and fixes. |
| [ai-sdk-testing](ai-sdk-testing/) | Test Vercel AI SDK code (generateText, streamText, structured output) without calling real LLM APIs. MockLanguageModelV3, MockEmbeddingModelV3, simulateReadableStream, and UI message stream simulation. |
| [auto-grill-me](auto-grill-me/) | Continue an in-progress /grill-me session in auto-pilot — the agent keeps asking the same questions but answers them with its own best recommendation. User interrupts (Esc) only when they disagree. |
| [actorkit-storybook-testing](actorkit-storybook-testing/) | Test actor-kit state machines in Storybook using mock clients and play functions. Covers static snapshots, interactive state transitions, event interception, and multi-actor nesting. |
| [actorkit-tanstack-start](actorkit-tanstack-start/) | Integrate actor-kit with TanStack Start/Router for server-rendered, real-time stateful apps on Cloudflare Workers. Covers route loaders, server functions, SSR hydration, and WebSocket handoff. |
| [adr-keeper](adr-keeper/) | Create and maintain Architectural Decision Records with date-named files sorted like migrations. Captures the WHY behind structural decisions. |
| [autoresearch](autoresearch/) | Set up and run Karpathy's autoresearch — autonomous AI research loop that trains a small LLM overnight. Agent modifies train.py, runs 5-min experiments, keeps improvements, discards failures (~100 experiments/night). |
| [babysit-pr](babysit-pr/) | Monitor a PR through CI, diagnose and fix failures, resolve merge conflicts, post QR codes for mobile preview builds, and auto-merge when ready. Includes monitoring script. |
| [cmux](cmux/) | Manage cmux terminal workspaces for parallel AI agent sessions. Create, switch, monitor, and communicate between named workspaces via CLI and socket API. Orchestrator pattern for /swarm and /nightshift. |
| [codex-review](codex-review/) | Cross-agent code review: run OpenAI Codex to review changes, then address findings. Fresh-eyes review from a different model catches what self-review misses. |
| [cast-party-game](cast-party-game/) | Build a family "cast party game" in a day: shared TV in the OGS launcher, grown-up phone + kid iPhone/iPad. Spec shape, actor-kit room architecture, TV design for the cloud stream, iOS gotchas, juice, recorder. OGS integration via ogs-game. |
| [ogs-game](ogs-game/) | Make a web game OGS-compatible (new or existing): checklist over the OGS game contract: profile-kit tarball, TV page in the launcher (ogs:start, parked = silent), OGS profile on phones, verifyOgsToken, art kit, catalogue entry with TDD, `pnpm run deploy`. |
| [arena](arena/) | N parallel attempts at one task, a cross-family judge, pick a base, graft the best of the rest. For concept rounds and plateaued hill-climbs. (pstack) |
| [architect](architect/) | Ground with how/why, sketch types and stubs twice via arena, screen for shallow modules, implement against the sketch, scrap when the shape is wrong. (pstack) |
| [code-judo](code-judo/) | Harsh maintainability review hunting restructurings that delete complexity: spaghetti special cases, 1k-line files, shallow wrappers, silent fallbacks. (pstack thermo-nuclear review) |
| [how](how/) | Explain how a subsystem works (flow, ownership, seams, gotchas) with parallel read-only explorers for broad questions. (pstack) |
| [interrogate](interrogate/) | Adversarial review by three model families (fable, opus, Codex) on one rubric, synthesized into a verified verdict. (pstack) |
| [reflect](reflect/) | End-of-session pass: three reviewers read the transcript, a synthesizer routes learnings to skill/CLAUDE.md edits and enforceable checks to a backlog; applied with approval. (pstack) |
| [show-me-your-work](show-me-your-work/) | Append-only decision log (TSV + log.sh) for unattended runs, audited against the transcript and reviewed by another model family. (pstack) |
| [what-did-i-get-done](what-did-i-get-done/) | Summarize your commits across ~/src for a time window into a status update or morning report. (pstack) |
| [why](why/) | Why code is the way it is: git/PR/issue/memory/notes/log evidence with explicit confidence levels. (pstack) |
| [verify-on-device](verify-on-device/) | Generate a project-local verify skill (Launch, Doctor, Drive, Evidence, Cleanup + a feature map of every role and screen), prove it once, keep it honest. Ships `av-verdict.mjs` (fails clips on black/white/frozen-with-audio/silent). Adapted from poteto's pstack. |
| [hillclimb](hillclimb/) | Generic quality loop: frozen rubric + evidence command, prove the evaluators catch a planted flaw, then one change → fresh blind multi-model panel (pairwise before/after) → keep or revert → log; pivot once at a plateau. aaa-/design-hillclimb specialize it. |
| [aaa-hillclimb](aaa-hillclimb/) | Progressive self-improvement for an existing game: re-baseline on an anchored AAA scorecard, a one-command evidence rig (contact sheet, recorded multi-screen session with real audio, phones, perf, audio report), a fresh critic every round, one owner per coupled system, stop at plateau. Story Nook case study. |
| [procedural-3d-web-game](procedural-3d-web-game/) | Build stunning 3D browser games, worlds and explainers in Three.js with models, textures and sound generated in code (ElevenLabs for voice/music/SFX). Brief template, scripted playtests, contact-sheet screenshots and a separate critic loop to 8/10+. Pairs with cast-party-game for the TV scene. |
| [ai-art-assets](ai-art-assets/) | Generate illustrations, character sheets, poses and parallax layers with fal.ai and 3D models with Meshy (scripts included, keys from env). Covers putting a real child in a story from family photos: hero sheet, consistency tests, privacy. |
| [decodable-reading](decodable-reading/) | Early-reading features built on synthetic phonics: known sounds, a decodability checker, sound buttons, tricky words, leveled progression, karaoke read-along and generated stories a child can actually decode. |
| [tdd](tdd/) | Red-green-refactor loop for rules, state machines, checkers and seams; tests first, small commits. |
| [game-studio](game-studio/) | Go wide and deep on many games at once: parallel teams (one per game or per version of a game), a shared findings board, a coordinator that consolidates insights, re-steers, prunes and spawns teams, an idea funnel, and kid playtests as the final judge. |
| [chrome-cdp](chrome-cdp/) | Interact with local Chrome browser session. Lightweight CLI for DevTools Protocol: list tabs, take screenshots, navigate, and evaluate JS without Puppeteer. |
| [create-claude-md](create-claude-md/) | Bootstrap CLAUDE.md as a table-of-contents + structured docs/ directory (agent guidance, architecture, product specs, acceptance tests, ADRs, lessons, exec plans, quality grades). |
| [debug-runbook](debug-runbook/) | Structured debugging for production and staging issues. Maps symptoms to tools and queries (Sentry, PostHog, wrangler logs, simulator logs, CI). Symptom-first investigation workflow. |
| [deploy-verify](deploy-verify/) | Deploy Cloudflare Workers and verify changes work by inferring what to test from recent git diff. Flags issues without auto-rolling back. |
| [design-principle-enforcer](design-principle-enforcer/) | Relentlessly critiques code against classic software engineering principles (SOLID, separation of concerns) to prevent spaghetti architecture. |
| [dont-use-use-effect](dont-use-use-effect/) | Avoid unnecessary useEffect in React. Covers the 6 most common anti-patterns and their idiomatic alternatives. |
| [expo-testing](expo-testing/) | Build, install, and test Expo/React Native apps on simulators and physical devices. Detox E2E, local xcodebuild, EAS cloud builds, screenshot capture. |
| [game-design-stages](game-design-stages/) | Staged game design methodology: LLM-simulate mechanics before writing code, define measurable "fun" criteria, iterate via eval loops until convergence, then transition to a deterministic engine. |
| [grill-me](grill-me/) | Relentlessly interrogates an RFC or PRD plan. Walks down each branch of the design tree, resolving dependencies between decisions one-by-one. |
| [mcp-setup](mcp-setup/) | Configure and troubleshoot MCP servers in Claude Code. Quick reference for installing, verifying, and debugging MCP connections (Slack, Sentry, PostHog, Figma, Playwright, Neon, qmd). |
| [mutation-testing](mutation-testing/) | Stryker mutation testing — setup, run incremental, kill survivors, reach ≥95% score. Used by swarm's Mutation Agent. |
| [offensive-typesafety](offensive-typesafety/) | Move faster by using strict, compiler-enforced constraints. Treat types as a development accelerator. Prefer tools like TanStack Router, Zod, and Drizzle to build end-to-end type safety. |
| [orwell-rules](orwell-rules/) | Apply George Orwell's six rules for clear writing to any prose — PR descriptions, commit messages, comments, docs, RFCs, writeups. Cut jargon, prefer short words, kill needless words, favor active voice, drop dead metaphors. |
| [parse-at-boundary](parse-at-boundary/) | Enforce "parse, don't validate" at every system edge. Data crossing a trust boundary must be parsed through a schema before entering application logic. Language-agnostic — TypeScript, Python, Go, Swift, Kotlin. |
| [prune-tests](prune-tests/) | Use mutation testing to find low-signal unit tests (zero kills, or only kills other tests already cover) and delete them. A set-cover script picks the minimal keep set, parallel subagents review candidates, and a before/after Stryker run proves no killed mutant was lost. |
| [react-composable-components](react-composable-components/) | Write and refactor React components to be small, composable, and customizable, doing one thing well. Leverage compound components, prop spreading, and utility class merging. |
| [react-render-performance](react-render-performance/) | Minimize unnecessary React re-renders with selectors and useSyncExternalStore. Patterns for XState, Zustand, Redux, and context. |
| [sre-agent](sre-agent/) | Install a log-watching SRE agent on a service repo: a GitHub Actions cron reads Cloudflare Workers Logs (or any NDJSON command), fingerprints errors, files/updates/reopens deduplicated issues with no LLM, and at autonomy 2 has Claude attempt a test-first fix PR. Pinned composite action + templates. |
| [seam-tester](seam-tester/) | Focuses exclusively on writing robust integration tests at system boundaries (seams) rather than writing brittle, shallow unit tests. |
| [split-pr](split-pr/) | Split an oversized PR or branch into small, reviewer-aligned PRs using GitHub's native stacked pull requests (`gh-stack`) — auto-retargeting and atomic stack merges replace hand-rolled branch chains and manual rebases. |
| [swarm](swarm/) | Launch parallel AI agents (Feature, CRAP, Mutate, Accept) in Git worktrees to automate both coding and continuous codebase hardening. **The primary workflow.** |
| [tlaplus](tlaplus/) | Formal verification of system designs using TLA+ and the TLC model checker. Models concurrent state machines, finds race conditions, deadlocks, and invariant violations before code is written. |
| [vsdd](vsdd/) | Verified Spec-Driven Development — rigorous spec → TDD → adversarial review → mutation testing pipeline. Three intensity levels (Full/Standard/Light). |
| [wide-events-logging](wide-events-logging/) | Implement observability using the Wide Events (Canonical Log Lines) pattern. Accumulate high-cardinality context and emit a single, highly-dimensional structured event per service boundary. |
| [workers-integration-testing](workers-integration-testing/) | Integration tests for Cloudflare Workers using vitest-pool-workers and `SELF.fetch()`. Full HTTP cycle testing against real local bindings (D1, KV, R2, DO, Hyperdrive). Hooks into /nightshift, /swarm, and /ralph-tdd. |

## Install

### Single skill (dependencies auto-resolved)

```bash
npx skpm-cli add jonmumm/skills@swarm -g
# → automatically installs grill-me, mutation-testing, tdd, etc.
```

Skills declare their dependencies via `dependsOn` in SKILL.md frontmatter. When you install a skill, skpm recursively installs everything it needs.

```bash
npx skpm-cli add jonmumm/skills@swarm -g         # swarm + all deps
npx skpm-cli add jonmumm/skills@nightshift -g     # nightshift + all deps
npx skpm-cli add jonmumm/skills@vsdd -g           # vsdd + all deps
npx skpm-cli add jonmumm/skills@create-claude-md -g
```

### All skills

```bash
npx skpm-cli add jonmumm/skills --all -g -y
```

### List available skills

```bash
npx skpm-cli add jonmumm/skills --list
```

### Global install (recommended)

Install `skpm` globally so you can skip `npx`:

```bash
pnpm i -g skpm-cli
skpm add jonmumm/skills@swarm -g
```

## Typical workflows

### Swarm (recommended)

Launch parallel agents that build features AND harden the codebase:

```bash
# 1. Bootstrap agent context (if CLAUDE.md doesn't exist)
#    → creates CLAUDE.md + docs/ structure
"create-claude-md"

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
dependsOn:
  - jonmumm/skills@other-skill
  - owner/repo@external-skill
postInstall:
  - "which some-cli || pnpm i -g some-cli"
---
```

`dependsOn` and `postInstall` are optional. Dependencies are resolved recursively by skpm.

2. Commit and push. New skills will appear in `skpm add jonmumm/skills --list`.
