---
name: principles
description: The 10 operating principles for building software with AI agents — when to use them, what failure mode each one prevents, and which skills operationalize them. Use when bootstrapping a new project, reviewing an agent workflow that drifted, deciding between tactical fixes and structural changes, or whenever the conversation turns from "what to build" to "how to build it well". Triggers on "principles", "commandments", "how should we work with agents", "what's our philosophy", or when an agent loop is producing low-quality output and you need to diagnose which principle was violated.
---

# Principles for Building with Agents

Ten operating principles for software work where AI agents do most of the implementation. Each one names a failure mode and the discipline that prevents it.

This is the philosophy layer. The skills in `~/src/skills` are the *operations*; this file is the *why*. When a skill prescribes a behavior, it's usually one of these principles in action — referenced by name and number.

## The 10

### 1. Implement to learn

The fastest way to understand a problem is to build the wrong solution and feel where it bends. Don't try to design the correct architecture upfront when the constraints are still fuzzy. Implement the obvious thing, run it against real cases, and let the failures teach you what the design actually needs.

**Failure it prevents**: paralysis-by-architecture, where weeks of diagrams get spent on a system whose real constraints only emerge under load.

**How to apply**: ship the smallest end-to-end version *first* (even if hacky), then refactor with knowledge you didn't have before. Use `/missions` between milestones to ask "what did we actually learn?" and update the spec.

**Operationalized in**: `/grill-me` (interrogate before building, but don't over-design), `/missions` (each milestone is a learning checkpoint), `/vsdd` (the spec evolves with implementation).

---

### 2. Rebuild often

Your second pass is always better than your first. The cost of rewriting a small unit is far lower than the cost of carrying a wrong abstraction forward. With agents doing the typing, "rewrite" is no longer expensive — so the threshold for triggering one should be lower.

**Failure it prevents**: ossification. Code that "kinda works" stays in place because changing it feels expensive, but the future cost of *not* changing it compounds silently.

**How to apply**: when you find yourself patching the same module twice, rebuild it from scratch instead. Use `/swarm` or `/agent-teams` to do parallel rewrites and compare. Set a calendar trigger ("every milestone, ask: would I structure this the same way knowing what I know now?").

**Operationalized in**: `/missions` (between-milestone reflection), `/create-claude-md` (CLAUDE.md is a living artifact), `/swarm` and `/agent-teams` (parallel rewrites are cheap).

---

### 3. E2E tests are gold

End-to-end tests prove that the user-visible behavior actually works. Unit tests prove that the *code you wrote today* does what you intended. The first survives refactors, framework swaps, and AI rewrites. The second often dies the moment the implementation changes.

**Failure it prevents**: green-CI-broken-product, where 5,000 unit tests pass and the homepage is blank.

**How to apply**: every behavior the user can name should have an acceptance test. Prefer integration tests at seams over unit tests of internals. Mocks of internal modules are a smell — mocks of *external systems* are fine.

**Operationalized in**: `/testing-trophy` (more E2E, fewer units), `/seam-tester` (integration at boundaries), `/expo-testing` and `/game-qa` (real device/browser), `/swarm` Acceptance agent.

---

### 4. Document intent (and surface assumptions)

Code shows *what* happens. Tests show *that it works*. Only intentional documentation captures *why this is the right shape* and *what was assumed when the choice was made*. Without it, the next agent (or future you) refactors the load-bearing weirdness away — or builds on a hidden assumption that turns out to be false.

**Failure it prevents**: lost-context regression and assumption-shaped bugs. A "cleanup" PR removes a load-bearing weirdness because no one knew it was load-bearing. Or: the agent inferred UTC, the test assumed local time, and the deploy at midnight UTC silently breaks.

**How to apply**: ADRs for structural decisions. Wide-event log lines for runtime intent. Comments only when the *why* is non-obvious. Spec docs for product intent. **When inferring an unstated constraint, say so**: "I'm assuming X — confirm or correct." The discipline is making the implicit explicit, in whichever artifact is most durable for that knowledge.

**Operationalized in**: `/adr-keeper`, `/adr-writing`, `/wide-events-logging`, `/grill-me` (extract assumptions before they become bugs), `/create-claude-md` (the docs/ directory is intent storage).

---

### 5. Maintain your spec

A stale spec is worse than no spec — it actively misleads. The spec is a contract between human intent and agent execution; if it drifts from reality, every agent that reads it gets misdirected. Treat the spec as the *primary artifact* and code as its derivative.

**Failure it prevents**: spec-rot. The spec describes v1, the code is on v3, and new agents implement features against the wrong contract.

**How to apply**: changing behavior means changing the spec *first*, the acceptance test *second*, the code *third*. If the spec didn't change, the behavior didn't really change. Use `/evals-first` to make the spec executable.

**Operationalized in**: `/vsdd` (verified spec-driven dev), `/evals-first` (spec → eval → code), `/create-claude-md` (the "Keeping Docs Current" table).

---

### 6. Find what's hard (that's the value)

In any task, the hard part is where the value lives. The easy parts — boilerplate, glue, formatting — agents handle in seconds; that's not what you're being paid for. Identify the genuinely hard sub-problem (the API contract, the race condition, the ambiguous requirement, the failure mode no one's thought through) and spend disproportionate effort there.

**Failure it prevents**: agent-induced surface-area expansion. The agent ships 2,000 lines of correct-looking code that doesn't address the actual hard part, and you accept it because it compiles.

**How to apply**: at the start of every task, write down what's hard. If you can't, you haven't understood the task yet. Use `/grill-me` to surface hidden difficulty. Use `/design-an-interface` because contract design is usually the hard part.

**Operationalized in**: `/grill-me` (interrogate until the hard parts surface), `/missions` planner, `/task-planner`, `/design-an-interface`, `/swarm` orchestrator (the orchestrator's job is to identify the brittle seam).

---

### 7. Reversibility over correctness

A wrong decision you can undo cheaply is better than a "correct" decision you can't. Optimize for the ability to change your mind. Feature flags, branches, ratchets, additive migrations, idempotent operations — all manifestations of this principle.

**Failure it prevents**: irreversible mistakes. A migration that mangles production data, a deploy that can't be rolled back, a refactor that bundles 50 files together so any single regression poisons the whole thing.

**How to apply**: ship behind a flag. Migrate additively before destructively. Branch instead of force-push. When in doubt, ask: "if this turns out wrong in 3 days, what does the rollback look like?"

**Operationalized in**: `/swarm` (worktrees = cheap branches), `/babysit-pr` (auto-merge only with rollback path), `/missions` (milestone = reversible checkpoint), `/deploy-verify` (verify before promoting).

---

### 8. Trust the boundary, not the middle

Validate data once, at the system edge, then trust it everywhere inside. Defensive code in the middle of your system is a sign that the boundary is leaking. The trust gradient should be: outside (paranoid) → boundary (parse) → inside (trust).

**Failure it prevents**: defensive-code rot. Every internal function does its own null-check, type-coercion, and validation; the system is half error-handling and the actual logic is buried.

**How to apply**: parse with Zod (or Codable, or Pydantic) at every system edge — HTTP handlers, queue consumers, file readers. After parsing, types are honest and internal code can be straightforward. Never `as` cast.

**Operationalized in**: `/parse-at-boundary` (the canonical reference), `/offensive-typesafety`, `/workers-best-practices`.

---

### 9. Latency of feedback dominates quality

The single biggest predictor of code quality is the time between writing a line and knowing if it's wrong. Pre-commit hook (seconds) > CI (minutes) > daily sweep (hours) > production incident (days). Shrink this gap relentlessly; it pays for itself many times over.

**Failure it prevents**: slow-feedback decay. Mistakes that would have been caught in 10 seconds at write-time become incidents days later, costing 1000× to fix.

**How to apply**: pre-commit hooks for type, lint, format. Watch-mode for tests during development. Local CRAP/mutation runs before pushing. Smoke-test deploys before promoting. Wide-event logs to shorten the gap between bug-in-prod and root-cause-known.

**Operationalized in**: `/setup-pre-commit`, `/deploy-verify`, `/babysit-pr`, `/wide-events-logging`, `/debug-runbook`, `/fewer-permission-prompts`.

---

### 10. Agents drift, gates don't

A long-running agent loop will drift toward "looks done" if no objective gate stops it. Without a hard check it can't bypass — CRAP score, mutation score, eval threshold, acceptance test pass — the loop optimizes for plausibility instead of correctness. The most common drift is *papering over the failure* (`--no-verify`, widening the type, catching-and-ignoring, marking tests `.skip`, increasing the timeout). When a check fails, the failure *is* the signal; suppression removes the warning system.

**Failure it prevents**: confident hallucination at scale. The agent ships 12 features overnight; in the morning, 4 of them don't actually work but every status update said "complete."

**How to apply**: every autonomous loop needs at least one gate it cannot self-grade. Wire `TaskCompleted` hooks. Set `thresholds.break` in mutation config. Require an independent validator (separate agent, separate worktree, no shared context) before marking work done. Treat suppression of a failing check as a high-bar event: it requires a comment naming the reason and a follow-up issue, not a silent fix.

**Operationalized in**: `/missions` (validation gate per milestone), `/nightshift` (gates between tasks), `/swarm` (CRAP/Mutation/Acceptance agents are gates), `/agent-teams` (`TaskCompleted` hook), `/crap`, `/mutation-testing`, `/evals-first`, `/babysit-pr` (don't merge red), `/debug-runbook` (root-cause hunt over suppression).

---

## How to use this skill

### When bootstrapping a project (`/create-claude-md`)
The generated CLAUDE.md gets the principles inline (short form) and a link here for the long form. Every project starts with the principles in the agent's context.

### When reviewing a stuck workflow
If an agent loop is producing low-quality output, check it against these principles. Almost every agent failure traces to violating one of #6 (didn't find what's hard), #10 (no gate, drift accepted), or #4 (assumption never surfaced).

### When deciding "should we just patch this?"
Run the candidate fix against #2 (rebuild often), #5 (maintain your spec), #10 (don't paper failures). If the patch violates two or more, it's not a fix — it's a future incident.

### When a new tool/skill is being added
Ask: which principle does this operationalize? If the answer is "none, it's just nice to have," it probably doesn't need to be a skill — just a one-time script.

## Inheritance into other skills

When updating other skills, prefer **referencing this file by principle number** over restating the principle. Example:

```markdown
> **Principle #10 (Agents drift, gates don't)** — every nightshift task must
> exit through a `TaskCompleted` hook that runs the feedback commands.
> See [/principles](../principles/SKILL.md).
```

This keeps the philosophy in one place and lets skills focus on *how* to operationalize it, not *why* it matters.
