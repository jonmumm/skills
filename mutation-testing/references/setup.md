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

## TypeScript 7 (native compiler) and pnpm

TypeScript 7 ships the native compiler without the JavaScript compiler API. Stryker 10's tsconfig preprocessor calls it and crashes at startup:

```
TypeError: ts.parseConfigFileTextToJson is not a function
    at TSConfigPreprocessor.rewriteTSConfigFile
```

The preprocessor only rewrites project `references` paths for the sandbox. If your tsconfig has no `references`, point `tsconfigFile` at a file that doesn't exist and Stryker skips it. Don't downgrade TypeScript.

```json
{
  "testRunner": "vitest",
  "plugins": ["@stryker-mutator/vitest-runner"],
  "tsconfigFile": "tsconfig.no-references.json",
  "coverageAnalysis": "perTest"
}
```

- Leave out `checkers: ["typescript"]`: the TypeScript checker relies on the same compiler API (not tried here, but expect the same failure). Vitest still type-strips the mutants, and `pnpm typecheck` (tsgo) gates types separately.
- With pnpm 10 and Stryker 10.1, the vitest runner wasn't discovered automatically ("no TestRunner plugins were loaded") until it was listed in `plugins`.
- A crashed run can leave `.stryker-tmp/sandbox-*/` behind, and Vitest then runs those copies too: every test file counts twice. Delete the folder, and exclude it in `vitest.config.ts`:

```ts
import { configDefaults, defineConfig } from "vitest/config";
export default defineConfig({ test: { exclude: [...configDefaults.exclude, ".stryker-tmp/**"] } });
```
