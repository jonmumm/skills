# Phases 5-6: Formal Hardening & Convergence

The code survived adversarial review. Now harden it with automated verification.

## Phase 5: Formal Hardening

Execute the verification strategy designed in Phase 1b against the battle-tested implementation.

### 5a: Mutation Testing (Required)

Mutation testing is the core verification gate. It ensures tests actually catch bugs, not just exercise code paths.

**Setup by language:**

| Language | Tool | Install | Run |
|----------|------|---------|-----|
| JavaScript/TypeScript | Stryker | `npm i -D @stryker-mutator/core` | `npx stryker run` |
| Python | mutmut | `pip install mutmut` | `mutmut run` |
| Rust | cargo-mutants | `cargo install cargo-mutants` | `cargo mutants` |
| Java/Kotlin | PIT | Maven/Gradle plugin | `mvn pitest:mutationCoverage` |

**Process:**

1. Run mutation testing on files changed during this VSDD cycle
2. Review surviving mutants — each is a potential gap in the test suite
3. For each surviving mutant on touched files:
   - Determine if the mutant represents a real behavioral difference
   - If yes: write a test that kills it, verify the test fails with the mutant
   - If no (equivalent mutant): document why in review-log.md
4. Re-run until mutation score **>= 95%** on touched files

**Interpreting survivors:**

| Survivor Type | Action |
|--------------|--------|
| Real gap — test suite misses a behavior | Write a killing test |
| Equivalent mutant — change doesn't affect behavior | Document and skip |
| Trivial mutant — e.g., log message change | Skip if non-behavioral |

### 5b: Static Analysis (Required)

Run language-appropriate static analysis:

- **Semgrep**: Cross-language security and correctness rules (`semgrep --config auto`)
- **Language linters**: ESLint, Clippy, Pylint, etc. with strict rulesets
- **Type checking**: `tsc --strict`, `mypy --strict`, etc.

Fix all findings or document explicit exceptions with reasoning.

### 5c: Property-Based / Fuzz Testing (Recommended)

If the spec identified properties or invariants over input ranges:

- **JavaScript/TypeScript**: fast-check
- **Python**: Hypothesis
- **Rust**: proptest, cargo-fuzz
- **General**: AFL++, libFuzzer

Focus fuzzing on the pure core identified in the Purity Boundary Map — it's the ideal fuzz target because it has no environmental dependencies.

### 5d: Formal Verification (Optional — Full intensity only)

For correctness-critical paths identified in the Phase 1b Provable Properties Catalog:

| Language | Tool | Use for |
|----------|------|---------|
| Rust | Kani | Memory safety, arithmetic overflow, state machine correctness |
| C/C++ | CBMC | Buffer overflows, undefined behavior |
| Any | Dafny | Algorithm correctness with pre/postconditions |
| Distributed | TLA+ | Consensus, ordering, liveness properties |

Execute proof harnesses drafted in Phase 1b. Failures feed back through Phase 4.

### 5e: Purity Boundary Audit

Final check that purity boundaries from Phase 1b are intact:

- No side effects crept into the pure core during implementation
- The effectful shell properly wraps all I/O
- Dependencies flow inward (shell depends on core, never reverse)

Flag any violations for refactoring.

## Phase 6: Convergence

VSDD is complete when all four dimensions have converged:

| Dimension | Convergence Signal |
|-----------|-------------------|
| **Spec** | Adversary's spec critiques are wording nitpicks, not missing behavior |
| **Tests** | Adversary can't identify meaningful untested scenarios. Mutation score >= 95% |
| **Implementation** | Adversary invents problems that don't exist in the code |
| **Verification** | Mutation testing passes. Static analysis clean. Purity boundaries intact |

### Final Status Update

Update `vsdd/status.md`:

```markdown
# VSDD Status: [Feature Name]

## Phase Completion
- [x] Phase 1: Spec Crystallization — [date]
- [x] Phase 2: TDD Implementation — [date]
- [x] Phase 3-4: Adversarial Review — [N] passes, converged [date]
- [x] Phase 5: Formal Hardening — [date]
  - Mutation score: [X]% on touched files
  - Static analysis: clean
  - Property tests: [N] properties verified
  - Formal proofs: [N/A or results]
- [x] Phase 6: Convergence — [date]

## Traceability
| Spec Item | Test(s) | Implementation | Review Pass | Verification |
|-----------|---------|----------------|-------------|--------------|
| [item]    | [test]  | [file:line]    | Pass [N]    | [result]     |

## Status: ZERO-SLOP
```

Present the final status to the user. The software is considered **Zero-Slop** — every line traces to a spec requirement, is covered by a test, survived adversarial review, and passed verification.

## Exit Criteria

- [ ] Mutation score >= 95% on touched files
- [ ] Static analysis clean (or exceptions documented)
- [ ] Property-based tests pass (if applicable)
- [ ] Purity boundaries intact
- [ ] All four convergence dimensions satisfied
- [ ] `vsdd/status.md` final update complete
- [ ] User informed of Zero-Slop status
