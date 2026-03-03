# Phase 2: TDD Implementation

Red → Green → Refactor, enforced strictly. No implementation code exists without a failing test that demanded it.

## Step 2a: Test Suite Generation

Translate the spec directly into executable tests. For each spec item:

**Testing Trophy.** Prefer the testing trophy: **most tests should be integration tests** (multiple units working together; most bang for buck). Fewer unit tests (single unit in isolation). Fewer e2e tests (full user journey; high confidence but slower and more brittle). Design the suite so integration tests cover the majority of behavior; add unit tests for isolated logic and e2e only for critical paths or user journeys the spec calls out.

- **Integration Tests** (primary): Tests verifying module interactions, API + DB, or multi-layer behavior defined in the spec. These should form the bulk of the suite.
- **Unit Tests**: One or more tests per behavioral contract item where a single unit can be tested in isolation. Every postcondition becomes an assertion; every precondition violation becomes a test expecting a specific error.
- **Edge Case Tests**: Every item in the Edge Case Catalog becomes a test (often as integration or unit depending on scope).
- **E2E Tests**: When the spec defines user journeys, full-stack flows, or critical UI/API paths — add end-to-end tests (e.g. Playwright, Cypress for web; API e2e for services). Fewer in number; cover happy paths and key failure modes. Must be red before implementation like all others.
- **Property-Based Tests**: Where the spec identifies invariants over input ranges, generate property-based tests (fast-check, Hypothesis, proptest)

**Do not test what the type system already ensures.** If the type signature guarantees a fact (e.g. "returns a string", "accepts only non-null X"), do not write a test that merely asserts that fact. Focus tests on runtime behavior, invariants across values, and edge cases that types cannot express. Redundant type-level tests add noise and can survive mutations that would break real behavior.

### Test Organization

Mirror the spec structure in the test file:

```
describe('[Module Name]', () => {
  describe('integration', () => {
    // Bulk of tests: module interactions, API + DB, multi-layer behavior
  });
  describe('behavioral contracts', () => {
    // Unit tests per postcondition where isolation is useful
  });
  describe('edge cases', () => {
    // One per edge case catalog entry
  });
  describe('e2e', () => {
    // Full user journey / full-stack when spec defines them
  });
  describe('properties', () => {
    // Property-based tests for invariants
  });
});
```

### The Red Gate

Run all tests. They must ALL FAIL. If a test passes without implementation:

1. The test is suspect — it may test the wrong thing
2. Or the spec item was already satisfied by existing code
3. Flag to the user for review before proceeding

Do not skip this step. Seeing red first is the entire point of TDD.

## Step 2b: Minimal Implementation

Write the *minimum* code to make each test pass, one at a time:

1. Pick the next failing test (work in spec order)
2. Write the smallest implementation that makes it pass
3. Run the full suite — nothing else should break
4. Move to the next failing test
5. Repeat until all green

**Critical discipline**: Do NOT write the full implementation and then run tests. Do NOT write implementation and tests at the same time. One test, one implementation increment, one green check.

## Step 2c: Refactor

After all tests are green:

1. Refactor for clarity, removing duplication
2. Ensure purity boundaries from the spec are respected (pure core has no side effects)
3. Check non-functional requirements from the spec
4. Run full test suite after each refactor — if anything breaks, fix immediately

## Step 2d: Human Checkpoint

Present to the user:

```
Phase 2 complete. Summary:
- [N] integration tests, [N] unit tests, [N] edge case tests, [N] e2e tests, [N] property tests
- All green
- Implementation covers: [list of spec items]

Ready for adversarial review (Phase 3)?
```

The user reviews the test suite and implementation for alignment with the *spirit* of the spec. AI can miss intent even when it nails the letter of the contract.

## Exit Criteria

- [ ] Test suite covers every behavioral contract, edge case, and provable property from the spec (integration tests form the bulk; e2e for user journeys when specified)
- [ ] All tests were red before implementation (Red Gate passed)
- [ ] All tests are green
- [ ] Implementation is minimal — no speculative code
- [ ] Purity boundaries from the spec are respected in the implementation
- [ ] User has reviewed and approved
- [ ] `vsdd/status.md` updated: Phase 2 complete
