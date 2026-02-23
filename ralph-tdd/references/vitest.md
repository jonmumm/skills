# Vitest (reference)

Use when the project uses Vitest for unit tests: running tests in the feedback loop, writing tests (TDD), or configuring the test runner.

## Running tests

```bash
npx vitest              # Watch mode (dev); run-once in CI
npx vitest run          # Single run (use in feedback loop / CI)
npm run test            # Usually same as vitest
npm run test:run        # Usually vitest run
```

- In CI (or when `process.env.CI` is set), Vitest defaults to run-once. Use `vitest run` in scripts when you need a single run (e.g. feedback loop, lint-staged).

## Config

Config lives in `vitest.config.ts` or inside `vite.config.ts`:

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',  // or 'jsdom', 'happy-dom'
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
```

In a Vite project, the same options go in `vite.config.ts` under the `test` key; add `/// <reference types="vitest" />` at the top.

## Basic test API

```typescript
import { describe, expect, test } from 'vitest';

describe('Feature', () => {
  test('does something', () => {
    expect(1 + 1).toBe(2);
  });

  test('async', async () => {
    const result = await fetchData();
    expect(result).toBeDefined();
  });
});
```

- Use `expect(value).toBe(expected)` for primitives, `expect(obj).toEqual(expected)` for objects.
- For errors: `expect(() => fn()).toThrow()`; async: `await expect(promise).rejects.toThrow()`.

## Mocking (for TDD and killing mutants)

```typescript
import { vi } from 'vitest';

// Mock function
const fn = vi.fn();
fn.mockReturnValue(42);

// Spy on object method
const spy = vi.spyOn(obj, 'method');
spy.mockReturnValue('mocked');

// Module mock (hoisted)
vi.mock('./module', () => ({ fn: vi.fn(() => 'mock') }));
```

- Assert calls: `expect(fn).toHaveBeenCalledWith(...)`, `expect(fn).toHaveBeenCalledTimes(n)`.
- Restore: `spy.mockRestore()`; config can use `restoreMocks: true`.

## Filtering (feedback loop)

```bash
# Run tests that import changed files (e.g. with lint-staged)
vitest related src/utils.ts src/api.ts --run

# Run tests matching name
vitest -t "login"
vitest --testNamePattern "user"
```

## Coverage

```bash
vitest run --coverage
```

Configure in config: `coverage: { provider: 'v8', reporter: ['text', 'html'], include: ['src/**'] }`. Install `@vitest/coverage-v8` (or `@vitest/coverage-istanbul`).

## Quick reference

| Need | Command / note |
|------|-----------------|
| Single run (feedback loop) | `vitest run` or `npm run test:run` |
| Watch | `vitest` or `npm run test` |
| Related to files | `vitest related <files> --run` |
| Mock function | `vi.fn()`, `vi.spyOn(obj, 'method')` |
| Module mock | `vi.mock('./path', () => ({ ... }))` |
| Env (DOM) | `environment: 'jsdom'` or `'happy-dom'` |

For full Vitest API (fixtures, projects, type testing, advanced vi), use a dedicated vitest skill or [vitest.dev](https://vitest.dev).
