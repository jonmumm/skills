#!/usr/bin/env node
// Compute CRAP scores from Vitest v8 coverage output + per-function complexity.
//
// CRAP(f) = CC(f)^2 * (1 - cov(f)/100)^3 + CC(f)
//
// Inputs:
//   --coverage <path>   Path to coverage-final.json (Vitest v8 reporter output)
//   --threshold <n>     Fail (exit 1) on any function with CRAP > n. Default 6.
//   --include <glob>    Comma-separated globs to include (optional)
//   --exclude <glob>    Comma-separated globs to exclude (optional)
//
// Complexity source: this starter computes a *cheap* approximation by counting
// branches (b array) per function from v8 coverage, which correlates with CC
// but is not identical. Replace `complexityFor()` with an ESLint or
// typhonjs-escomplex pass for production use — see references/measurer-recipes.md.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const args = parseArgs(process.argv.slice(2));
const coveragePath = resolve(args.coverage ?? "coverage/coverage-final.json");
const threshold = Number(args.threshold ?? 6);

const coverage = JSON.parse(readFileSync(coveragePath, "utf8"));

const rows = [];
for (const [filePath, fileData] of Object.entries(coverage)) {
  if (args.include && !matchesAny(filePath, args.include.split(","))) continue;
  if (args.exclude && matchesAny(filePath, args.exclude.split(","))) continue;

  const fnMap = fileData.fnMap ?? {};
  const fnHits = fileData.f ?? {};
  const branchMap = fileData.branchMap ?? {};
  const branchHits = fileData.b ?? {};
  const stmtMap = fileData.statementMap ?? {};
  const stmtHits = fileData.s ?? {};

  for (const [fnId, fn] of Object.entries(fnMap)) {
    const cc = complexityFor(fn, branchMap);
    const cov = coverageFor(fn, stmtMap, stmtHits, branchMap, branchHits, fnHits, fnId);
    const crap = cc * cc * Math.pow(1 - cov / 100, 3) + cc;
    rows.push({ filePath, name: fn.name || "(anonymous)", line: fn.loc?.start?.line ?? 0, cc, cov, crap });
  }
}

rows.sort((a, b) => b.crap - a.crap);

const grouped = new Map();
for (const r of rows) {
  if (!grouped.has(r.filePath)) grouped.set(r.filePath, []);
  grouped.get(r.filePath).push(r);
}

let offenders = 0;
for (const [file, fns] of grouped) {
  console.log(`\n${relPath(file)}`);
  for (const fn of fns) {
    const flag = fn.crap > threshold ? "  ❌" : "  ✓";
    const cov = `${fn.cov.toFixed(0)}%`.padStart(4);
    console.log(
      `  ${fn.name.padEnd(28)} CC=${String(fn.cc).padStart(2)}  cov=${cov}  CRAP=${fn.crap.toFixed(1).padStart(6)}${flag}`,
    );
    if (fn.crap > threshold) offenders++;
  }
}

console.log(`\n${rows.length} functions analyzed. ${offenders} over CRAP ${threshold}.`);

if (offenders > 0) process.exit(1);

// --- helpers ---

function complexityFor(fn, branchMap) {
  // Approximation: 1 (entry) + count of branch nodes whose source range falls
  // inside this function's source range. Replace with ESLint `complexity` rule
  // output for accuracy.
  const fnStart = fn.loc?.start?.line ?? 0;
  const fnEnd = fn.loc?.end?.line ?? Infinity;
  let branches = 0;
  for (const b of Object.values(branchMap)) {
    const bLine = b.loc?.start?.line ?? b.line ?? 0;
    if (bLine >= fnStart && bLine <= fnEnd) branches += (b.locations?.length ?? 1);
  }
  return 1 + branches;
}

function coverageFor(fn, stmtMap, stmtHits, branchMap, branchHits, fnHits, fnId) {
  const fnStart = fn.loc?.start?.line ?? 0;
  const fnEnd = fn.loc?.end?.line ?? Infinity;

  let total = 0;
  let hit = 0;

  // Statements inside the function
  for (const [sid, loc] of Object.entries(stmtMap)) {
    const line = loc?.start?.line ?? 0;
    if (line >= fnStart && line <= fnEnd) {
      total++;
      if ((stmtHits[sid] ?? 0) > 0) hit++;
    }
  }

  // Branches inside the function
  for (const [bid, b] of Object.entries(branchMap)) {
    const line = b.loc?.start?.line ?? b.line ?? 0;
    if (line >= fnStart && line <= fnEnd) {
      const hits = branchHits[bid] ?? [];
      for (const h of hits) {
        total++;
        if (h > 0) hit++;
      }
    }
  }

  // Function call itself
  total++;
  if ((fnHits[fnId] ?? 0) > 0) hit++;

  return total === 0 ? 0 : (hit / total) * 100;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
      out[key] = val;
    }
  }
  return out;
}

function matchesAny(path, patterns) {
  return patterns.some((p) => path.includes(p.trim()));
}

function relPath(p) {
  return p.startsWith(process.cwd()) ? p.slice(process.cwd().length + 1) : p;
}
