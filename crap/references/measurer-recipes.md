# CRAP Measurer Recipes

The starter `scripts/crap.mjs` is intentionally minimal so it stays readable. For real projects, swap in better complexity measurement and adapt coverage merging to your runtime.

## TS/JS — accurate complexity via ESLint

The starter approximates CC by counting v8 branch nodes inside a function. For real CC, use ESLint's built-in `complexity` rule with `--rule '{"complexity": ["error", 0]}'` and parse the output, or use `typhonjs-escomplex` directly:

```bash
pnpm add -D typhonjs-escomplex
```

```js
import { analyzeModule } from "typhonjs-escomplex";
import { readFileSync } from "node:fs";

const report = analyzeModule(readFileSync("src/auth.ts", "utf8"), {}, { sourceType: "module" });
for (const m of report.methods) {
  console.log(m.name, "CC =", m.cyclomatic);
}
```

Then key by `${file}::${functionName}::${startLine}` to merge with coverage.

## Cloudflare Workers (vitest-pool-workers)

`vitest-pool-workers` runs tests inside `workerd`. Coverage works but the file paths in `coverage-final.json` are virtual (`worker:`). Add a path normalizer to the measurer:

```js
function normalizePath(p) {
  return p.replace(/^worker:/, "").replace(/^\/+/, "");
}
```

Also: integration tests crossing fetch handlers and Durable Objects produce coverage scattered across multiple entry files. Merge their coverage JSONs before running `crap.mjs`:

```bash
pnpm vitest run --coverage --coverage.reporter=json
node scripts/merge-coverage.mjs coverage/*/coverage-final.json > coverage/merged.json
node scripts/crap.mjs --coverage coverage/merged.json
```

## Multi-package monorepo

Run per-package and aggregate:

```bash
for pkg in packages/*; do
  ( cd "$pkg" && pnpm vitest run --coverage )
done
node scripts/crap.mjs \
  --coverage 'packages/*/coverage/coverage-final.json' \
  --threshold 6
```

Modify the script to accept a glob and merge before scoring. Consider per-package thresholds — `packages/domain` stricter than `packages/glue`.

## Python

```bash
uv add --dev radon coverage
coverage run -m pytest && coverage json -o coverage.json
radon cc src/ -s -j > complexity.json
```

CRAP formula is identical. A 50-line script merging the two JSONs by `file + function + line` does the job.

## Swift

`xcrun llvm-cov export -format=text` gives per-function coverage. SwiftLint's `cyclomatic_complexity` rule (or `swift-cc`) gives CC. Same merge pattern.

## Multi-process / actor systems

Coverage tools see only the process they instrument. For systems with many processes (actor-kit, Workers fleets, microservices), you have two choices:

1. **Boundary CRAP only** — measure CRAP for the *public boundary* of each service and ignore internal hops. Pair with seam-tests (`/seam-tester`) for end-to-end behavior coverage.
2. **Coverage stitching** — instrument every process, ship coverage reports to a central directory, merge by file path before scoring. Heavier, but gives a true picture.

Pick (1) unless you're already running distributed traces; the maintenance cost of (2) usually isn't worth it.
