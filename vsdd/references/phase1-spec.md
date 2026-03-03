# Phase 1: Spec Crystallization

Nothing gets built until the contract is airtight and the architecture is verification-ready by design.

## Step 1a: Behavioral Specification

Produce a formal spec document in `vsdd/spec.md` covering:

- **Behavioral Contract**: Preconditions, postconditions, and invariants for each module/function/endpoint
- **Interface Definition**: Input types, output types, error types. No ambiguity. If API: OpenAPI/GraphQL schema. If module: type signature and doc contract
- **Edge Case Catalog**: Exhaustively enumerate boundary conditions. For every input, ask:
  - What if null? Empty? Maximum size? Negative? Zero? Unicode? Concurrent?
  - What if the dependency is down? Slow? Returns garbage?
- **Non-Functional Requirements**: Performance bounds, memory constraints, security considerations

### Spec Format

```markdown
# Spec: [Feature Name]

## Behavioral Contract

### [Module/Function Name]
- **Preconditions**: [what must be true before invocation]
- **Postconditions**: [what must be true after invocation]
- **Invariants**: [what must always hold]

## Interface Definition
[Type signatures, schemas, contracts]

## Edge Cases
| # | Input/Condition | Expected Behavior |
|---|----------------|-------------------|
| 1 | [edge case]    | [behavior]        |

## Non-Functional Requirements
- Performance: [bounds]
- Security: [considerations]
```

## Step 1b: Verification Strategy

Before finalizing design, add a **Verification Strategy** section to the spec answering: *"What properties must be provable, and what architectural constraints does that impose?"*

- **Provable Properties Catalog**: Which invariants and safety properties should be formally verified vs. tested? Prioritize: security boundaries, financial calculations, state machine correctness, parser termination
- **Purity Boundary Map**: Separate the **deterministic, side-effect-free core** (where formal verification and mutation testing work best) from the **effectful shell** (I/O, network, DB). This is the most consequential design decision — it dictates module boundaries and testability
- **Verification Tooling**: Based on language and properties:
  - **Always**: Mutation testing (Stryker for JS/TS, mutmut for Python, cargo-mutants for Rust, etc.), static analysis (Semgrep, ESLint)
  - **When applicable**: Property-based testing (fast-check, Hypothesis, proptest)
  - **When the spec defines user journeys or full-stack flows**: E2E testing (e.g. Playwright, Cypress for web; API e2e for services)
  - **For critical paths**: Formal verification (Kani/Rust, CBMC/C, Dafny, TLA+/distributed)

### Verification Strategy Format

Add to `vsdd/spec.md`:

```markdown
## Verification Strategy

### Provable Properties
| # | Property | Method | Priority |
|---|----------|--------|----------|
| 1 | [invariant] | [formal proof / mutation test / property test] | [critical/high/normal] |

### Purity Boundary
- **Pure Core**: [modules/functions with no side effects]
- **Effectful Shell**: [I/O, network, DB interactions]
- **Boundary Interface**: [how pure core and shell communicate]

### Tooling
- Mutation testing: [tool + config — e.g. Stryker for JS/TS: `npx stryker run`]
- Static analysis: [tool + rules]
- E2E testing: [tool if applicable — e.g. Playwright, Cypress]
- Property-based tests: [tool, if applicable]
- Formal verification: [tool, if applicable]
```

**Why this must happen now**: If side effects are woven through core logic, no amount of Phase 5 heroics will make it verifiable. A function that reads DB, calculates, and writes logs in one block can't be formally verified or effectively mutation-tested. But a pure function that takes data in and returns results — that's a function verification tools can reason about.

## Step 1c: Spec Review Gate

Present the complete spec to the user for review. Then run an **adversarial spec review** using a sub-agent:

Launch a sub-agent with this adversarial prompt (adapt to the specific spec):

```
You are a hyper-critical spec reviewer with zero tolerance for ambiguity.
Review this specification for:

1. Ambiguous language that could be interpreted multiple ways
2. Missing edge cases
3. Implicit assumptions that aren't stated
4. Contradictions between different parts of the spec
5. Properties claimed as "testable only" that should be provable
6. Purity boundary violations — logic marked as "pure" that depends on external state
7. Verification tool mismatches — properties the selected tooling can't actually prove

NO "overall this looks good" preamble. Every piece of feedback is a concrete flaw
with a specific location and a proposed fix. If you cannot find real flaws, say
"No legitimate flaws found" — do NOT invent problems.

SPEC:
[paste full spec here]
```

Iterate the spec until the adversary finds no legitimate flaws. Record all review findings in `vsdd/review-log.md`.

## Exit Criteria

- [ ] Behavioral spec covers all modules with preconditions, postconditions, invariants
- [ ] Edge case catalog is exhaustive (verified by adversarial review)
- [ ] Verification strategy defines purity boundaries and tooling
- [ ] Adversarial spec review found no legitimate flaws
- [ ] User has approved the spec
- [ ] `vsdd/status.md` updated: Phase 1 complete
