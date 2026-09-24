#!/usr/bin/env node
// Rank tests by what they catch, using a Stryker mutation report
// (mutation-testing-report-schema v2, from the `json` reporter).
//
// The report must come from a run with `coverageAnalysis: "perTest"` and
// `disableBail: true`. Without disableBail, Stryker stops at the first test
// that kills a mutant, so `killedBy` lists one test and every other test
// looks useless.
//
// Usage:
//   node analyze.mjs <mutation.json> [--ignore-mutators StringLiteral,ArrayDeclaration]
//                    [--prefer '<regex on test file path>'] [--tests '<regex>'] [--json out.json]
//
// --ignore-mutators  Mutants from these mutators don't count as "caught bugs".
//                    Default: StringLiteral (a test that asserts a constant
//                    string contains a substring kills these and nothing else).
//                    Pass '' to count every mutator.
// --prefer           When two tests catch the same mutants, keep the one whose
//                    file matches this regex (e.g. integration tests).
// --tests            Test files to judge. Default: every test file with at
//                    least one test that kills a mutant. Tests in other files
//                    are OUT_OF_SCOPE: the run never aimed at them.
//
// Coverage (`coveredBy`) is not used to decide scope: some runners (e.g.
// Vitest in some configs) don't report per-test coverage and run every test
// against every mutant, which leaves `coveredBy` empty.

import { readFileSync, writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
const reportPath = args.find((a) => !a.startsWith('--') && !isFlagValue(a))
if (!reportPath) {
  console.error('usage: analyze.mjs <mutation.json> [--ignore-mutators A,B] [--prefer REGEX] [--json out.json]')
  process.exit(2)
}

function flag(name, fallback) {
  const i = args.indexOf(name)
  return i === -1 ? fallback : args[i + 1]
}
function isFlagValue(a) {
  const i = args.indexOf(a)
  return i > 0 && args[i - 1].startsWith('--')
}

const ignored = new Set(
  flag('--ignore-mutators', 'StringLiteral')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
)
const preferRe = flag('--prefer') ? new RegExp(flag('--prefer')) : null
const testsRe = flag('--tests') ? new RegExp(flag('--tests')) : null
const jsonOut = flag('--json')

const report = JSON.parse(readFileSync(reportPath, 'utf8'))

// test id -> { id, file, name, line }
const tests = new Map()
for (const [file, { tests: defs = [] }] of Object.entries(report.testFiles ?? {})) {
  for (const t of defs) {
    tests.set(t.id, { id: t.id, file, name: t.name, line: t.location?.start?.line })
  }
}

// mutant key -> { key, valued, killers: Set<testId> }
const mutants = []
let multiKillerMutants = 0
let killedMutants = 0
for (const [file, { mutants: ms = [] }] of Object.entries(report.files ?? {})) {
  for (const m of ms) {
    const covered = m.coveredBy ?? []
    for (const id of covered) {
      if (!tests.has(id)) tests.set(id, { id, file: '(unknown)', name: id })
    }
    if (m.status !== 'Killed') {
      mutants.push({ covered, killers: new Set(), valued: false })
      continue
    }
    killedMutants++
    const killers = new Set(m.killedBy ?? [])
    if (killers.size > 1) multiKillerMutants++
    mutants.push({
      key: `${file}:${m.location.start.line}:${m.location.start.column} ${m.mutatorName}`,
      mutator: m.mutatorName,
      valued: !ignored.has(m.mutatorName),
      covered,
      killers,
    })
  }
}

if (killedMutants > 20 && multiKillerMutants === 0) {
  console.error(
    'WARNING: no mutant was killed by more than one test. The run almost certainly had bail on.\n' +
      'Re-run Stryker with --disableBail or every test after the first killer will look useless.\n',
  )
}

const stats = new Map()
for (const t of tests.values()) {
  stats.set(t.id, { ...t, covers: 0, kills: 0, valuedKills: 0, uniqueValued: 0, ignoredOnly: false })
}
for (const m of mutants) {
  for (const id of m.covered) stats.get(id).covers++
  for (const id of m.killers) {
    const s = stats.get(id)
    s.kills++
    if (m.valued) s.valuedKills++
  }
  if (m.valued && m.killers.size === 1) stats.get([...m.killers][0]).uniqueValued++
}
for (const s of stats.values()) s.ignoredOnly = s.kills > 0 && s.valuedKills === 0

const killingFiles = new Set([...stats.values()].filter((s) => s.kills > 0).map((s) => s.file))
const inScope = (file) => (testsRe ? testsRe.test(file) : killingFiles.has(file))

// Greedy set cover: smallest set of tests that still kills every valued mutant.
// Everything outside the set can be deleted together without losing a kill.
const uncovered = new Set(mutants.filter((m) => m.valued && m.killers.size > 0))
const keep = new Set()
const killsOf = new Map([...stats.keys()].map((id) => [id, new Set()]))
for (const m of uncovered) for (const id of m.killers) killsOf.get(id).add(m)

while (uncovered.size > 0) {
  let best = null
  let bestGain = 0
  for (const [id, ms] of killsOf) {
    if (keep.has(id)) continue
    let gain = 0
    for (const m of ms) if (uncovered.has(m)) gain++
    if (gain === 0) continue
    const better =
      gain > bestGain ||
      (gain === bestGain && preferRe && preferRe.test(stats.get(id).file) && !preferRe.test(stats.get(best).file))
    if (better) {
      best = id
      bestGain = gain
    }
  }
  keep.add(best)
  for (const m of killsOf.get(best)) uncovered.delete(m)
}

function verdict(s) {
  if (keep.has(s.id)) return s.uniqueValued > 0 ? 'KEEP_UNIQUE' : 'KEEP_COVER'
  if (!inScope(s.file)) return 'OUT_OF_SCOPE'
  if (s.kills === 0) return 'ZERO_KILLS'
  if (s.ignoredOnly) return 'LITERAL_ONLY'
  return 'REDUNDANT'
}

const rows = [...stats.values()].map((s) => ({ ...s, verdict: verdict(s) }))
const byFile = new Map()
for (const r of rows) {
  if (!byFile.has(r.file)) byFile.set(r.file, [])
  byFile.get(r.file).push(r)
}

// Tests that never touch the mutated files say nothing about their own value:
// the run was scoped away from them. Never list them as delete candidates.
const isCandidate = (r) => !r.verdict.startsWith('KEEP') && r.verdict !== 'OUT_OF_SCOPE'
const deletable = rows.filter(isCandidate)
if (killedMutants === 0) {
  console.error(
    'ERROR: no test killed any mutant. The test runner config probably excludes the tests that\n' +
      'exercise this scope (check the runner include globs), or the scope has no tests.',
  )
  process.exit(1)
}
const hasCoverage = rows.some((r) => r.covers > 0)
const counts = Object.groupBy(rows, (r) => r.verdict)
console.log(`Report: ${reportPath}`)
console.log(`Ignored mutators: ${[...ignored].join(', ') || '(none)'}`)
console.log(`Tests: ${rows.length}  Keep set: ${keep.size}  Delete candidates: ${deletable.length}`)
for (const [v, rs] of Object.entries(counts).sort()) console.log(`  ${v.padEnd(13)} ${rs.length}`)
const skipped = [...new Set(rows.filter((r) => r.verdict === 'OUT_OF_SCOPE').map((r) => r.file))]
if (skipped.length) console.log(`Out-of-scope test files (not judged): ${skipped.join(', ')}`)
console.log('')

for (const [file, rs] of [...byFile].sort(([a], [b]) => a.localeCompare(b))) {
  const cands = rs.filter(isCandidate)
  if (cands.length === 0) continue
  const whole = cands.length === rs.length ? '  [ENTIRE FILE]' : ''
  console.log(`${file}  (${cands.length}/${rs.length} deletable)${whole}`)
  for (const r of cands.sort((a, b) => (a.line ?? 0) - (b.line ?? 0))) {
    const at = r.line ? `L${r.line}  ` : ''
    const cov = hasCoverage ? `, covers ${r.covers}` : ''
    console.log(`  ${r.verdict.padEnd(13)} ${at}${r.name}  (kills ${r.kills}${cov})`)
  }
}

if (jsonOut) {
  writeFileSync(
    jsonOut,
    JSON.stringify({ ignoredMutators: [...ignored], keep: [...keep], tests: rows }, null, 2),
  )
  console.log(`\nWrote ${jsonOut}`)
}
