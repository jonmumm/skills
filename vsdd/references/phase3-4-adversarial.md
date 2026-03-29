# Phases 3-4: Adversarial Review & Feedback Loop

The code survived testing. Now it faces the gauntlet.

## Phase 3: The Adversarial Roast

Present the spec, test suite, AND implementation to a **fresh-context Claude sub-agent** acting as the Adversary. Fresh context is critical — no accumulated goodwill, no relationship drift.

### Launching the Adversary — Parallel Mode (recommended)

The 5 review dimensions are independent. Launch them as **5 parallel sub-agents** in a
single message for maximum speed. Each agent focuses on one dimension with full depth
rather than one agent spreading attention across all 5.

```
# Single message with 5 parallel Agent tool calls:
Agent(description="Adversary: Spec Fidelity", prompt="[spec fidelity prompt + files]")
Agent(description="Adversary: Test Quality", prompt="[test quality prompt + files]")
Agent(description="Adversary: Code Quality", prompt="[code quality prompt + files]")
Agent(description="Adversary: Security Surface", prompt="[security prompt + files]")
Agent(description="Adversary: Spec Gaps", prompt="[spec gaps prompt + files]")
```

After all 5 return, merge their findings into a single categorized list for Phase 4 routing.

Each agent gets the shared preamble below plus its dimension-specific checklist.

#### Shared preamble (include in every agent prompt)

```
You are Sarcasmotron — a hyper-critical code reviewer with zero patience and
zero tolerance. You've been handed a spec, its test suite, and the implementation.
Your job is to destroy it.

RULES:
- NO "overall this looks good" preamble. EVER.
- Every piece of feedback is a CONCRETE FLAW with a specific file, line, and proposed fix
- If you cannot find real flaws, say "NO LEGITIMATE FLAWS FOUND" — do NOT invent problems
- Do NOT praise. Do NOT soften. Flaws only.

FILES TO REVIEW:
[list all relevant files with their paths]

SPEC:
[paste or reference vsdd/spec.md]
```

#### Dimension-specific prompts

**Agent 1 — SPEC FIDELITY:**
```
YOUR DIMENSION: SPEC FIDELITY
- Does the implementation actually satisfy the spec?
- Did tests inadvertently encode a misunderstanding of the spec?
- Is there implemented behavior not covered by the spec?
```

**Agent 2 — TEST QUALITY:**
```
YOUR DIMENSION: TEST QUALITY
- Are tests actually testing what they claim?
- Would any test pass even if the implementation were subtly wrong?
- Tautological tests (always pass regardless)?
- Tests that mock too aggressively (testing mocks, not code)?
- Tests asserting implementation details rather than behavior?
```

**Agent 3 — CODE QUALITY:**
```
YOUR DIMENSION: CODE QUALITY
- Placeholder comments or TODO items
- Generic error handling (catch-all, swallow errors)
- Inefficient patterns with better alternatives
- Hidden coupling between modules
- Missing resource cleanup (file handles, connections, listeners)
- Race conditions or concurrency issues
- Dead code or unreachable branches
```

**Agent 4 — SECURITY SURFACE:**
```
YOUR DIMENSION: SECURITY SURFACE
- Input validation gaps
- Injection vectors (SQL, command, XSS)
- Authentication/authorization assumption gaps
- Secrets in code or logs
```

**Agent 5 — SPEC GAPS REVEALED BY IMPLEMENTATION:**
```
YOUR DIMENSION: SPEC GAPS
- Behavior that exists in code but wasn't in the spec
- Decisions the implementation made that the spec didn't address
```

### Single-agent fallback

For smaller changes where parallel overhead isn't justified, use a single agent with all
5 dimensions combined:

```
You are Sarcasmotron — a hyper-critical code reviewer with zero patience and
zero tolerance. You've been handed a spec, its test suite, and the implementation.
Your job is to destroy it.

RULES:
- NO "overall this looks good" preamble. EVER.
- Every piece of feedback is a CONCRETE FLAW with a specific file, line, and proposed fix
- If you cannot find real flaws, say "NO LEGITIMATE FLAWS FOUND" — do NOT invent problems
- Do NOT praise. Do NOT soften. Flaws only.

REVIEW DIMENSIONS:
1. SPEC FIDELITY — Does impl satisfy spec? Tests encode misunderstandings? Uncovered behavior?
2. TEST QUALITY — Tautological? Over-mocked? Testing implementation details?
3. CODE QUALITY — TODOs, generic error handling, coupling, resource leaks, dead code?
4. SECURITY SURFACE — Injection, auth gaps, secrets in code/logs?
5. SPEC GAPS — Behavior in code but not in spec? Unspecified decisions?

FILES TO REVIEW:
[list all relevant files with their paths]

SPEC:
[paste or reference vsdd/spec.md]
```

### Processing the Roast

For each flaw the Adversary identifies, categorize it:

| Flaw Type | Action |
|-----------|--------|
| Spec-level flaw | Return to Phase 1. Update spec, re-review |
| Test-level flaw | Return to Phase 2a. Fix/add tests, verify they fail, then fix implementation |
| Implementation flaw | Return to Phase 2c. Refactor, ensure all tests still pass |
| New edge case | Add to spec's Edge Case Catalog, write failing test, implement fix |
| False positive | Record in review-log.md as dismissed with reasoning |

## Phase 4: Feedback Integration Loop

Route each flaw back to the correct phase and iterate:

```
Adversary finds flaw
    │
    ├── Spec flaw? ──────→ Phase 1: Update spec → re-review spec
    ├── Test flaw? ──────→ Phase 2a: Fix tests → verify red → fix impl
    ├── Impl flaw? ──────→ Phase 2c: Refactor → verify green
    ├── New edge case? ──→ Phase 1: Add to catalog → Phase 2: test + impl
    └── False positive? ─→ Dismiss with reasoning in review-log.md
```

After fixing all legitimate flaws, run the Adversary again with fresh context. Repeat until convergence.

### Convergence Signal for Phases 3-4

The adversarial loop has converged when:

- The Adversary's critiques are nitpicks about style, not substance
- The Adversary invents problems that don't actually exist in the code
- The Adversary reports "NO LEGITIMATE FLAWS FOUND"

Record the convergence in `vsdd/review-log.md`:

```markdown
## Adversarial Review Pass [N]
- Date: [date]
- Findings: [count] (spec: [n], test: [n], impl: [n], false positive: [n])
- Status: CONVERGED — adversary hallucinating flaws / no legitimate flaws found
```

## Exit Criteria

- [ ] At least one full adversarial review pass completed
- [ ] All legitimate flaws resolved (routed back through correct phase)
- [ ] Adversarial review has converged (hallucinating flaws or no flaws found)
- [ ] `vsdd/review-log.md` documents all passes and resolutions
- [ ] `vsdd/status.md` updated: Phases 3-4 complete
