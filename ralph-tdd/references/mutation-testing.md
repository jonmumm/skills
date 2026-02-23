# Mutation Testing Quality Gate (reference)

Use Stryker Mutator to verify that tests actually catch breakage — not just that they pass. Ralph uses this as the verification layer after TDD.

## What It Does

Stryker modifies your source code (mutates it) and checks if your tests catch the change. If a mutation survives (tests still pass), there's a gap in your test coverage.

Examples of mutations:
- `> 0` → `>= 0` (boundary condition)
- `a + b` → `a - b` (arithmetic operator)
- `if (condition)` → `if (true)` (removed conditional)
- `return value` → `return ""` (string literal)
- `{ ...body }` → `{}` (removed block)

If your tests don't catch these, they're not testing real behavior.

## Setup (one-time per project)

### 1. Install dependencies

For **Vitest** projects:
```bash
npm install -D @stryker-mutator/core @stryker-mutator/vitest-runner @stryker-mutator/typescript-checker
```

For **Jest** projects:
```bash
npm install -D @stryker-mutator/core @stryker-mutator/jest-runner @stryker-mutator/typescript-checker
```

### 2. Create stryker.config.mjs

```javascript
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  mutate: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
    '!src/**/*.d.ts',
  ],
  testRunner: 'vitest',  // or 'jest'
  vitest: { configFile: 'vitest.config.ts' },  // adjust to your config
  checkers: ['typescript'],
  tsconfigFile: 'tsconfig.json',
  reporters: ['html', 'clear-text', 'progress', 'json'],
  htmlReporter: { fileName: 'reports/mutation/mutation.html' },
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
  thresholds: { high: 90, low: 80, break: 90 },
  incremental: true,
  incrementalFile: 'reports/stryker-incremental.json',
  timeoutMS: 10000,
  timeoutFactor: 1.5,
  concurrency: 4,
}
export default config
```

Key settings:
- `mutate`: which files to mutate (adjust glob to your source layout)
- `thresholds.break: 90`: **fails the build** if mutation score drops below 90% on covered code
- `incremental: true`: only re-tests changed files on subsequent runs (minutes vs. hours)

### 3. Add npm scripts

```json
{
  "scripts": {
    "test:mutate": "stryker run",
    "test:mutate:incremental": "stryker run --incremental"
  }
}
```

### 4. Add to .gitignore

```
reports/
.stryker-tmp/
```

## The Quality Gate Workflow

Run **after all unit tests pass**:

1. **Run Stryker**: `npm run test:mutate:incremental` (first run 10–60 min; incremental 2–5 min).
2. **Read survivors**: Clear-text output shows file, line, and what was changed.
3. **Kill survivors** on files you touched: understand the mutation → write a targeted test that would fail with the mutation → re-run incremental.
4. **Repeat** until mutation score ≥ 95% on touched files. The `break: 90` threshold prevents committing if you regress.

## Common Surviving Mutations and How to Kill Them

| Mutation | What It Means | How to Kill |
|----------|--------------|-------------|
| `> 0` → `>= 0` | No test with zero value | Add test with `amount = 0`, assert rejection |
| `a + b` → `a - b` | No test verifying arithmetic result | Assert exact computed values |
| `if (x)` → `if (true)` | Condition not tested as false | Add test where condition is false |
| `return value` → `return ""` | Return value not asserted | Assert the specific return value |
| `{ ...body }` → `{}` | Block removal not detected | Assert side effects of the block |
| `a.filter(fn)` → `a` | Filter not tested | Add test with mixed data, assert filtered result |
| `a === b` → `a !== b` | Only testing the happy path | Test both matching and non-matching cases |

## Tips

- **Run incremental, not full**: After the first baseline, always use `npm run test:mutate:incremental`. It's 10–20x faster.
- **Focus on your changes**: Don't try to kill survivors in code you didn't touch. That's a separate task.
- **NoCoverage mutants are fine**: Mutants in code with no test coverage don't count against your score. They're a signal for where to add tests next.
- **CompileError mutants are free**: Stryker tried a mutation that doesn't compile. TypeScript caught it. No action needed.
- **Don't chase 100%**: 95% on covered code is excellent. The last 5% is usually diminishing returns.
