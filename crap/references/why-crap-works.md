# Why CRAP Works (and where it doesn't)

## Origin

CRAP (Change Risk Anti-Patterns) was introduced by Alberto Savoia and Bob Evans (2007) as a metric for `crap4j`. The premise: "untested complex code is the most expensive to change." The formula penalizes the combination — a complex function with 100% coverage is fine; a simple function with 0% coverage is also fine; a complex function with low coverage is exponentially dangerous.

```
CRAP(f) = CC(f)^2 × (1 − cov(f)/100)^3 + CC(f)
```

The square on CC and the cube on the coverage gap are deliberate: they make the metric *aggressive* about complex+untested code, while leaving simple or well-tested code essentially untouched.

## Why Uncle Bob revived it for the AI era (April 2026)

In his bathrobe rant, Bob argues CRAP solves a specific problem AI coding agents create: they happily write 200-line functions with 17 nested branches that pass tests. Humans can't review that volume manually. CRAP gives the agent — and the human reviewer — a single objective signal:

> "Below 6, ship it. Above 6, refactor."

This works because the agent can iterate: measure → split or test → measure again. No human in the loop required *for the metric*. The human still owns acceptance tests (the behavior contract).

## The 7±2 connection

Bob's threshold of 4 for human-maintained code traces to George Miller's "magical number 7±2" — the working-memory limit for chunks a person can hold simultaneously. A function with CC=4 has roughly 4 paths to track; combined with parameter mental load and call context, you're at the ceiling. Push CC higher and the human reviewer's comprehension degrades nonlinearly.

AI agents don't have the same limit. Their context window is the constraint, and a CC-of-6 function is well within their working set. So CRAP=6 for AI is the rough cognitive equivalent of CRAP=4 for humans.

## Why mutation testing is the necessary partner

CRAP rewards coverage. Coverage measures lines/branches *executed*, not lines *asserted*. A test that runs a function but never checks the result has 100% coverage and 0% assertion value. CRAP can't see this; it'll happily report a CRAP of CC for a fully-covered, never-asserted function.

Mutation testing (e.g. Stryker — see `/mutation-testing`) closes this gap by *changing* the code and seeing if tests fail. Surviving mutants prove the assertions are weak. The combination — CRAP gates complexity-vs-coverage, mutation testing gates coverage-vs-assertion — is what makes the metric trustworthy.

If you only have time for one: do CRAP first (it's cheaper to compute), and run mutation testing on functions that look suspiciously well-covered.

## Where CRAP misleads you

- **Pure data files / configs**: high statement count, no logic, no branches. CRAP is uninteresting. Filter these out by path.
- **Generated code**: complexity reflects the generator, not your code. Exclude generated dirs.
- **Plumbing / DI containers**: low CC but lots of statements, sometimes hard to test in isolation. CRAP looks fine but the function is fragile in a different way (coupling). Use design-principle-enforcer alongside.
- **Async control flow**: some CC tools count `await` chains as branches; others don't. Pick a tool, lock the version.
- **Defensive programming**: every `if (x == null) return` adds CC. If you've adopted "parse at the boundary" (`/parse-at-boundary`), most of these guards disappear naturally — CRAP and the parse-at-boundary discipline reinforce each other.

## When to relax thresholds

- **Hot paths with proven test rigor.** A network parser with CC=10 and mutation score 100% might genuinely be the right shape. Document the exception in a comment with the rationale.
- **Bootstrap / startup code.** Often necessarily branchy and run once. Acceptance tests cover it; per-function CRAP isn't the right tool.
- **Adapters / shims.** If their job is to translate every variant of an external format, CC will be high by definition. Exhaustive table-driven tests + a comment explaining the shape > forcing a split.

For everything else, hold the line at 6. Bob's quote on going to 8: "I'd be loathe to try."
