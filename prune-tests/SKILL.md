---
name: prune-tests
description: Use mutation testing to find low-signal unit tests (ones that catch no mutant, or only catch mutants other tests already catch) and delete them without losing any bug-catching power. Use when the user says "prune tests", "delete bad tests", "too many unit tests", "tests that restate the code", "low-signal tests", "test bloat", or when agents keep burning time fixing brittle tests after refactors.
dependsOn:
  - jonmumm/skills@mutation-testing
  - jonmumm/skills@testing-trophy
---

# Prune Tests

Agents write a lot of unit tests after the code. Most restate the implementation: they always pass, catch almost nothing, and break on every refactor. This skill uses mutation testing to prove which tests earn their keep, then deletes the rest.

The usual mutation workflow adds tests to kill survivors. This one runs the other way: find the tests you can delete while every killed mutant stays killed.

## The rule

A test is worth keeping only if deleting it would let a real bug through. With Stryker, "a real bug" is a killed mutant, and the proof is simple:

- **Before**: set K of mutants killed by the suite.
- **After deleting**: the same K is still killed.

If K holds, nothing of value was lost. Any test not needed to keep K is a delete candidate.

## Verdicts

`scripts/analyze.mjs` reads the Stryker JSON report and gives each test one verdict:

| Verdict | Meaning | Default action |
|---|---|---|
| `OUT_OF_SCOPE` | In a test file that kills nothing in this run (or doesn't match `--tests`). Not judged | Leave alone; judge it in a run scoped to its code |
| `ZERO_KILLS` | In an in-scope file, but no mutant makes it fail. Asserts nothing that matters, or tests code outside `mutate` | Delete, unless review finds it tests out-of-scope code |
| `LITERAL_ONLY` | Only kills ignored mutators, `StringLiteral` by default. The "10 tests that a constant string contains substrings" case | Delete |
| `REDUNDANT` | Every mutant it kills, a kept test also kills | Delete |
| `KEEP_COVER` | Needed for the minimal cover, but no mutant depends on it alone | Keep |
| `KEEP_UNIQUE` | Sole killer of at least one mutant | Keep |

The keep set is a greedy set cover, so you can delete every candidate at once and K still holds. Candidates are not independent of each other: don't hand-pick a subset of `REDUNDANT` and swap in others.

## Workflow

### 0. Set up

- Work on a fresh branch in a worktree. This deletes a lot of code.
- Baseline must be green: typecheck, lint, the unit suite.
- Confirm the project has Stryker with a Vitest, Jest, or Mocha runner. If not, set it up first with `/mutation-testing`.
- Confirm the tests you want to judge are ones Stryker runs. The runner config Stryker uses may include only some test dirs (a separate coverage config, a Node pool that skips Workers-pool tests). Tests it never runs can't be judged by this skill.

### 1. Pick a scope

A full-repo run with `disableBail` is slow, since every test runs against every mutant it covers. Work one module or directory at a time. Ask the user which area if it's not obvious; the one with the most churn in its tests is a good start (`git log --since=3.months --name-only -- '*.test.ts' | sort | uniq -c | sort -rn | head`).

### 2. Run Stryker with bail off

```sh
npx stryker run \
  --mutate 'src/billing/**/*.ts,!src/billing/**/*.test.ts' \
  --coverageAnalysis perTest \
  --disableBail \
  --reporters json,clear-text \
  --incrementalFile reports/prune/.stryker-incremental.json
```

- `--disableBail` is required. With bail on, `killedBy` lists only the first killer and every other test looks useless.
- Use a separate incremental file so this run doesn't corrupt the project's normal incremental baseline, and so a re-run after deletions is fast.
- If Vitest logs "failed to find test files related to mutated files" and Stryker exits with "No tests were executed", set `"vitest": { "related": false }` in a copy of the config and pass that file as the first argument to `stryker run`.
- Report lands at `reports/mutation/mutation.json` (set `jsonReporter.fileName` to change it). Copy it to `reports/prune/before.json`.

### 3. Analyze

```sh
node ~/.agents/skills/prune-tests/scripts/analyze.mjs reports/prune/before.json \
  --prefer '\.integration\.test\.' \
  --json reports/prune/verdicts.json
```

- `--prefer`: when a unit test and an integration test catch the same mutants, keep the integration test. Match whatever naming the repo uses for higher-level tests.
- `--tests`: regex for the test files to judge. Default is every file with at least one killing test; use this if a whole file kills nothing and you still want it judged.
- `--ignore-mutators`: defaults to `StringLiteral`. Add `ArrayDeclaration,ObjectLiteral` if the codebase has big constant tables (prompts, config maps) that tests just echo back. Pass `''` to count everything.
- If the script warns that no mutant has more than one killer, bail was on. Re-run step 2.

### 4. Review candidates in parallel

The script is a filter, not the judge. Fan out one subagent per test file with candidates (group small files). Give each agent the file path, its rows from `verdicts.json`, and this brief:

> For each candidate test, decide DELETE or KEEP. Default is DELETE. KEEP only if one of these holds, and say which:
> 1. It pins down behavior outside the mutated scope (a contract with an external API, a schema, a migration) that the mutation run couldn't see.
> 2. It is a regression test for a real bug: check `git log -S '<test name>' --oneline` and keep it if it landed in a fix commit that names an incident or ticket.
> 3. It is the only readable spec of a tricky edge case AND it tests through a public interface, not internals.
>
> "It documents the code", "it's cheap", and "it might catch something" are not reasons. Delete the test, then any helpers, fixtures, and mocks that no longer have a caller. If a `describe` block or file ends up empty, delete it. Do not edit source files. Do not add new tests. Report: tests deleted, tests kept with reason, files removed.

Have agents edit in the same worktree only if they own disjoint files. Otherwise give each its own worktree and merge.

### 5. Verify K holds

Re-run the exact command from step 2, copy the report to `reports/prune/after.json`, and compare killed sets:

```sh
node -e '
const k = (p) => new Set(Object.entries(require(p).files).flatMap(([f, {mutants}]) =>
  mutants.filter((m) => m.status === "Killed").map((m) => `${f}:${m.location.start.line}:${m.location.start.column}:${m.mutatorName}`)))
const [b, a] = [k("./reports/prune/before.json"), k("./reports/prune/after.json")]
const lost = [...b].filter((x) => !a.has(x))
console.log(`killed before ${b.size}, after ${a.size}, lost ${lost.length}`); lost.forEach((x) => console.log("  " + x))'
```

- Lost mutants from ignored mutators are expected. Lost mutants from any other mutator mean an agent deleted a test in the keep set: restore it.
- Then run the project's full feedback loop (typecheck, lint, all tests, E2E). Fix breakage from deleted shared helpers; never by restoring a candidate test.

### 6. Report

Tell the user, with numbers from the runs:

- Tests deleted / kept, lines of test code removed, test files removed.
- Unit suite wall time before and after.
- Mutation score before and after, split into valued mutators and ignored ones.
- Candidates the reviewers kept, with their reason, so the user can overrule.

Commit as one commit per scope so each is easy to revert.

### 7. Optional: stop new ones

Offer to add rules to the repo's `AGENTS.md` / `CLAUDE.md`. Show the diff and get a yes first. Suggested rules:

```markdown
- Never write unit tests after you write the code.
- Prefer E2E tests to verify features. At the end of an E2E test, produce a verifiable, repeatable artifact.
- If you must test a unit in isolation, first write down all the ways it could fail, then write the code.
```

Before adding, check for existing rules that pull the other way, such as a mutation-score gate that tells agents to kill every survivor by adding tests. That gate is how many of these tests got written. Point out the conflict and let the user decide; don't silently weaken either rule.

## Limits

- Mutation testing only sees code inside `mutate`. A test of fixtures, types, config, or code outside the scope shows as `ZERO_KILLS` and needs the review step to catch it.
- The script ignores `coveredBy`. Some runners don't report per-test coverage (Stryker then logs a high "tests per mutant" count), which leaves that field empty.
- Stryker can't get per-test results from Playwright, so this can't directly answer "does E2E already catch this?". The `--prefer` flag covers the integration layer; for E2E, the review brief's rule 1 is the backstop.
- Equivalent mutants and timeouts count as not killed, so they never protect a test. That's fine: a test whose only job was to catch an equivalent mutant catches nothing.
