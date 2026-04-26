---
name: crap
description: Measure and lower CRAP (Change Risk Anti-Patterns) — a metric that fuses cyclomatic complexity and test coverage to surface fragile code. Use when verifying test quality after a feature, gating PRs, refactoring legacy code, setting up a new project's quality bar, or whenever the user mentions "CRAP score", "complexity", "Change Risk Anti-Patterns", or wants to know which functions are most likely to break. Pair with mutation-testing so coverage is meaningful, not superficial.
---

# CRAP — Change Risk Anti-Patterns

CRAP is a single number per function that says: *"how dangerous is this code to change?"* It fuses cyclomatic complexity (CC) and test coverage so that a function is only "safe" when it's either simple OR thoroughly tested (ideally both). High complexity with low coverage explodes the score.

## The formula

```
CRAP(f) = CC(f)^2 × (1 − coverage(f)/100)^3 + CC(f)
```

Implications worth holding in your head:
- At 100% coverage, `CRAP = CC` — coverage cancels the squared term, so the floor is just the function's complexity.
- At 0% coverage, `CRAP = CC² + CC` — a CC of 6 → 42, a CC of 10 → 110. Untested branchy code is catastrophic.
- The cubic on the gap means even small coverage drops on complex functions hurt fast: CC=8 at 80% coverage = 8.5; at 50% = 16; at 0% = 72.

## Targets (Uncle Bob, April 2026)

| Context | Threshold | Why |
|---|---|---|
| Human-maintained code | **CRAP ≤ 4** | Stays within the 7±2 working-memory limit per function |
| AI-maintained code | **CRAP ≤ 6** | AI tolerates more simultaneous detail than humans |
| Hard ceiling for AI code | **CRAP < 8** | Above this, even AI starts losing the thread |
| Universal fail | **CRAP > 30** | Considered unacceptable in any context |

If coverage is 100%, these reduce to "keep CC ≤ 4 (human) or ≤ 6 (AI)". The metric is doing two jobs at once: encouraging splits *and* encouraging tests.

## When to use this skill

- After implementing a feature — run as part of the verification cadence (alongside mutation testing)
- Before opening a PR — gate merges on CRAP thresholds, like you'd gate on lint or types
- Refactoring legacy code — surface the worst offenders first (highest CRAP = highest risk-to-fix)
- Bootstrapping a new project — wire CRAP into `pnpm verify` or pre-commit alongside tests
- When an AI agent writes a long, branchy function — measure CRAP and force a split

## How to lower CRAP

The metric pushes you toward two responses:

1. **Split the function** to lower CC. Common patterns:
   - **Data-driven dispatch**: replace an `if/else if/...` ladder with a lookup table (`Map<Key, Handler>`)
   - **Strategy/polymorphism**: collapse branches into method dispatch
   - **Guard clauses + early return**: flatten nested conditions
   - **Extract helpers**: pull each branch into a small named function
2. **Raise coverage** on the function until the cubic factor collapses. Pair with mutation testing (see `/mutation-testing`) so the new coverage actually exercises behavior — coverage without assertions is a lie that CRAP can't detect.

Occasionally the right move is to **unify** rather than split — when two functions share so much state that splitting creates tighter coupling than the original. Splitting is the default; unification is the exception.

## Build a custom measurer (do this; don't trust generic ones)

Bob's strongest piece of advice in the bathrobe rant: **write your own CRAP measurer for your codebase**. The reasons:
- **Coverage measurement varies by architecture.** A monolith's `c8` output isn't comparable to a multi-process Worker fleet, microservices, or a multi-threaded runtime where tests cross process boundaries.
- **CC is language-dependent.** What ESLint counts as a branch differs from what `radon` counts in Python or what Swift considers a control-flow node.
- **Your thresholds may differ per layer.** Pure domain logic should be stricter than glue code.

A starter script is in [scripts/crap.mjs](scripts/crap.mjs) — it merges Vitest v8 coverage with ESLint complexity output and prints a sorted CRAP table. Use it as a starting point and customize for your project (filter paths, weight by layer, change thresholds, add a Worker-aware coverage merger, etc.). See [references/measurer-recipes.md](references/measurer-recipes.md) for variations (Python, multi-package monorepos, Cloudflare Workers test pools).

## Standard workflow (TS/JS with Vitest)

```bash
# 1. Run tests with coverage
pnpm vitest run --coverage

# 2. Compute CRAP scores
node scripts/crap.mjs --coverage coverage/coverage-final.json --threshold 6

# 3. Address offenders, top-down. For each function above threshold:
#    - Decide: split (lower CC) or test (raise coverage)
#    - Write the test FIRST if raising coverage (TDD discipline)
#    - Re-run; verify the score dropped
```

Output reads like:

```
src/auth/middleware.ts
  validateToken          CC=9  cov=58%  CRAP=21.7  ❌ over 6
  refreshSession         CC=4  cov=100% CRAP=4.0   ✓
  parseHeader            CC=2  cov=100% CRAP=2.0   ✓
```

## Wire it into the project

Add to your `CLAUDE.md` feedback commands so it runs as part of the standard verification loop:

```markdown
## Feedback commands

These must pass before commit:

1. `pnpm typecheck`
2. `pnpm test`
3. `pnpm test:mutate:incremental` — mutation score ≥ 95%
4. `pnpm crap` — no function over CRAP 6
```

Add the script to `package.json`:

```json
{
  "scripts": {
    "crap": "vitest run --coverage --silent && node scripts/crap.mjs --threshold 6"
  }
}
```

For pre-commit, see `/setup-pre-commit` — add `pnpm crap` to the lint-staged or husky chain.

## Integration with other skills

- **`/mutation-testing`** — CRAP rewards coverage; mutation testing verifies that coverage actually catches bugs. Run mutation testing on the same functions CRAP flags. **High coverage + low mutation score = lying to CRAP.**
- **`/tdd`** — Write tests first for new code; CRAP stays naturally low. Use CRAP as the post-feature gate.
- **`/swarm`** — The swarm's CRAP agent already runs continuously in its own worktree. This skill is what that agent loads. The orchestrator should fail a feature merge if the CRAP agent reports unaddressed offenders.
- **`/missions`** and **`/nightshift`** — Add CRAP to the validation gate between milestones / overnight tasks so autonomous loops can't regress complexity.
- **`/design-principle-enforcer`** — CRAP is a *quantitative* check; design-principle is *qualitative*. Both before merge.

## Common failure modes

- **Over-splitting into rubble.** A skill following CRAP blindly can fragment one coherent function into ten one-liners that obscure intent. If a split makes the call site harder to read than the original, unify and raise coverage instead.
- **Coverage theater.** Adding `expect(true).toBe(true)` after exercising a line lowers CRAP without testing anything. Mutation testing (`/mutation-testing`) is the only reliable defense.
- **Threshold drift on legacy code.** Don't try to bring a 30k-line legacy file under CRAP=6 in one pass. Instead: (a) baseline current scores, (b) `thresholds.break` only on touched files, (c) ratchet down over time.
- **Counting the wrong CC.** Default ESLint complexity counts logical operators (`&&`, `||`) as branches; some teams disable that. Pick a definition, write it down, and apply consistently.

## Related reading

- [references/measurer-recipes.md](references/measurer-recipes.md) — language/runtime variants of the measurer
- [references/why-crap-works.md](references/why-crap-works.md) — Uncle Bob's reasoning, the human 7±2 ceiling, and why mutation testing is the necessary partner
