# Stryker setup (one-time per project)

## 1. Install dependencies

**Vitest** projects:
```bash
npm install -D @stryker-mutator/core @stryker-mutator/vitest-runner @stryker-mutator/typescript-checker
```

**Jest** projects:
```bash
npm install -D @stryker-mutator/core @stryker-mutator/jest-runner @stryker-mutator/typescript-checker
```

## 2. Create stryker.config.mjs

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
  vitest: { configFile: 'vitest.config.ts' },
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

- `mutate`: adjust glob to your source layout.
- `thresholds.break: 90`: fails the build if mutation score drops below 90%.

## 3. Add npm scripts

```json
{
  "scripts": {
    "test:mutate": "stryker run",
    "test:mutate:incremental": "stryker run --incremental"
  }
}
```

## 4. Add to .gitignore

```
reports/
.stryker-tmp/
```
