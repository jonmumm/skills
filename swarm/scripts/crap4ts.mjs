#!/usr/bin/env node

/**
 * crap4ts — CRAP Score Calculator for TypeScript
 *
 * Calculates the Change Risk Anti-Pattern (CRAP) score for every exported
 * function in a TypeScript project by combining:
 *   - Cyclomatic Complexity (CC): counted from AST branch nodes
 *   - Test Coverage: read from lcov.info or coverage-final.json
 *
 * Formula: CRAP(fn) = CC² × (1 - cov)³ + CC
 *
 * Usage:
 *   node crap4ts.mjs [--src src/] [--coverage coverage/lcov.info] [--json] [--threshold 30]
 */

import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join, relative, extname } from "path";

// ── CLI Arguments ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function getArg(name, fallback) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}
const srcDir = getArg("src", "src");
const coveragePath = getArg("coverage", "coverage/lcov.info");
const outputJson = args.includes("--json");
const threshold = parseInt(getArg("threshold", "0"), 10);

// ── Branch Keywords ──────────────────────────────────────────────────────────
// Each of these adds 1 to cyclomatic complexity when found as a standalone token.

const BRANCH_KEYWORDS = new Set([
  "if",
  "else if",
  "case",
  "for",
  "while",
  "do",
  "catch",
  "&&",
  "||",
  "??",
  "?.",
  "?",  // ternary
]);

// ── Find All TS/TSX Files ────────────────────────────────────────────────────

function findFiles(dir, extensions = [".ts", ".tsx"]) {
  const results = [];
  if (!existsSync(dir)) return results;

  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === ".swarm" || entry === "dist" || entry === "coverage") continue;
      results.push(...findFiles(full, extensions));
    } else if (extensions.includes(extname(entry))) {
      results.push(full);
    }
  }
  return results;
}

// ── Extract Functions from Source ────────────────────────────────────────────

function extractFunctions(source, filePath) {
  const functions = [];
  const lines = source.split("\n");

  // Match: export function name, export const name = (, function name, const name = (
  // Also matches arrow functions and method definitions
  const fnPattern =
    /(?:export\s+)?(?:async\s+)?(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(|(\w+)\s*\([^)]*\)\s*\{)/;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(fnPattern);
    if (!match) continue;

    const name = match[1] || match[2] || match[3];
    if (!name || name === "if" || name === "for" || name === "while" || name === "switch") continue;

    // Find the function boundary by counting braces
    let braceCount = 0;
    let started = false;
    let endLine = i;

    for (let j = i; j < lines.length; j++) {
      for (const ch of lines[j]) {
        if (ch === "{") {
          braceCount++;
          started = true;
        }
        if (ch === "}") braceCount--;
      }
      if (started && braceCount <= 0) {
        endLine = j;
        break;
      }
    }

    const body = lines.slice(i, endLine + 1).join("\n");
    functions.push({
      name,
      file: filePath,
      startLine: i + 1,
      endLine: endLine + 1,
      body,
    });
  }

  return functions;
}

// ── Calculate Cyclomatic Complexity ──────────────────────────────────────────

function calculateCC(body) {
  let cc = 1; // Base complexity

  // Count branch points from tokens
  const tokens = body.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, ""); // strip comments
  const patterns = [
    /\bif\s*\(/g,
    /\belse\s+if\s*\(/g,
    /\bcase\s+/g,
    /\bfor\s*\(/g,
    /\bwhile\s*\(/g,
    /\bdo\s*\{/g,
    /\bcatch\s*\(/g,
    /&&/g,
    /\|\|/g,
    /\?\?/g,
    /\?\s*[^:?]/g, // ternary (rough)
  ];

  for (const pattern of patterns) {
    const matches = tokens.match(pattern);
    if (matches) cc += matches.length;
  }

  return cc;
}

// ── Parse LCOV Coverage ──────────────────────────────────────────────────────

function parseLcov(lcovPath) {
  if (!existsSync(lcovPath)) return new Map();

  const content = readFileSync(lcovPath, "utf-8");
  const coverage = new Map(); // file -> Map<lineNumber, hitCount>
  let currentFile = null;

  for (const line of content.split("\n")) {
    if (line.startsWith("SF:")) {
      currentFile = line.slice(3);
      if (!coverage.has(currentFile)) coverage.set(currentFile, new Map());
    } else if (line.startsWith("DA:") && currentFile) {
      const [lineNo, hits] = line.slice(3).split(",").map(Number);
      coverage.get(currentFile).set(lineNo, hits);
    } else if (line === "end_of_record") {
      currentFile = null;
    }
  }
  return coverage;
}

// ── Calculate Function Coverage from LCOV ────────────────────────────────────

function getFunctionCoverage(coverage, filePath, startLine, endLine) {
  // Try exact path and relative path
  const fileCov = coverage.get(filePath) || coverage.get(relative(process.cwd(), filePath));
  if (!fileCov) return 0;

  let coveredLines = 0;
  let totalLines = 0;

  for (let line = startLine; line <= endLine; line++) {
    if (fileCov.has(line)) {
      totalLines++;
      if (fileCov.get(line) > 0) coveredLines++;
    }
  }

  return totalLines > 0 ? coveredLines / totalLines : 0;
}

// ── CRAP Formula ─────────────────────────────────────────────────────────────

function crapScore(cc, coverage) {
  return Math.round((cc * cc * Math.pow(1 - coverage, 3) + cc) * 10) / 10;
}

// ── Main ─────────────────────────────────────────────────────────────────────

const files = findFiles(srcDir);
if (files.length === 0) {
  console.error(`No .ts/.tsx files found in ${srcDir}/`);
  process.exit(1);
}

const coverage = parseLcov(coveragePath);
if (coverage.size === 0) {
  console.error(`Warning: No coverage data found at ${coveragePath}`);
  console.error("Run 'npm run test:coverage' first to generate lcov.info");
  console.error("Proceeding with 0% coverage for all functions.\n");
}

const results = [];

for (const file of files) {
  const source = readFileSync(file, "utf-8");
  const functions = extractFunctions(source, file);

  for (const fn of functions) {
    const cc = calculateCC(fn.body);
    const cov = getFunctionCoverage(coverage, file, fn.startLine, fn.endLine);
    const score = crapScore(cc, cov);

    results.push({
      function: fn.name,
      file: relative(process.cwd(), fn.file),
      line: fn.startLine,
      cc,
      coverage: Math.round(cov * 1000) / 10,
      crap: score,
    });
  }
}

// Sort by CRAP score descending
results.sort((a, b) => b.crap - a.crap);

// Filter by threshold if set
const filtered = threshold > 0 ? results.filter((r) => r.crap >= threshold) : results;

// ── Output ───────────────────────────────────────────────────────────────────

if (outputJson) {
  console.log(JSON.stringify(filtered, null, 2));
} else {
  console.log("CRAP Report");
  console.log("===========\n");
  console.log(
    "Function".padEnd(35) +
    "File".padEnd(45) +
    "CC".padStart(5) +
    "Cov%".padStart(8) +
    "CRAP".padStart(8)
  );
  console.log("-".repeat(101));

  for (const r of filtered) {
    const name = r.function.length > 33 ? r.function.slice(0, 30) + "..." : r.function;
    const file = r.file.length > 43 ? "..." + r.file.slice(-40) : r.file;
    console.log(
      name.padEnd(35) +
      file.padEnd(45) +
      String(r.cc).padStart(5) +
      `${r.coverage}%`.padStart(8) +
      String(r.crap).padStart(8)
    );
  }

  console.log(`\nTotal functions: ${results.length}`);
  if (threshold > 0) console.log(`Above threshold (${threshold}): ${filtered.length}`);
}
