---
name: evals-first
description: >
  Evals-first development: write evaluations before specs, code, or designs.
  Evals become the guardrails that condition the agent to write better specs,
  clearer requirements, and code that works on the first try. Use when starting
  a new feature, project, or initiative. Use when the user says "evals first",
  "start with evals", "write evals", "evaluation-driven", or wants to establish
  quality guardrails before building. Also use when converting guides, papers,
  or domain knowledge into enforceable evals.
---

# Evals-First Development

Write the evals before the spec. Write the spec before the code.

The insight: when you give a coding agent strong, clear guardrails *first*, it writes
specs and requirements that are easier to follow and leave less room for interpretation.
The agent uses language optimized for its own comprehension — and that makes all the
difference. Almost all code works immediately, design is close to perfect, text is
almost there.

## Why Evals First

Traditional: `plan -> implement -> review -> fix`
Better: `spec -> plan -> implement -> review -> fix -> eval`
Best: **`evals -> spec -> plan -> implement`**

When evals come first:
1. The agent writes its own spec conditioned by the evals — and does better than a human-written spec
2. Guardrails are structural, not advisory — they catch problems before they exist
3. You spend time on *what matters* (the criteria) instead of *what's tedious* (the implementation)
4. Going back to older projects with new evals catches things you didn't intend to introduce

## Workflow

### Phase 1: Define the Eval Surface

Before writing any spec or code, establish what "good" looks like.

1. **Identify the dimensions** — What axes does quality vary along?
   - Functional correctness (does it do the right thing?)
   - Design quality (does it look/feel right?)
   - Code quality (is it maintainable, testable, performant?)
   - UX copy (is the text clear, concise, appropriate?)
   - Accessibility (does it work for everyone?)
   - Domain-specific criteria (compliance, conventions, standards)

2. **Collect reference materials** — Gather guides, papers, style guides, HIG docs,
   design principles, or any authoritative source for each dimension.

3. **Distill into eval criteria** — For each dimension, extract concrete, testable rules.
   Not "the design should be good" but "touch targets must be >= 44pt" or
   "error messages must describe how to fix the problem."

### Phase 2: Classify Eval Types

Sort each eval criterion into the strongest enforcement mechanism available:

| Type | Enforcement | Examples |
|------|------------|---------|
| **Hook** | Automated, blocks commit/push | Linters, type checks, format checks, custom scripts |
| **Test** | Automated, blocks CI | Unit tests, integration tests, snapshot tests, accessibility audits |
| **LLM Judge** | Semi-automated, flags for review | Design quality, UX copy, code style beyond what linters catch |
| **Human Review** | Manual, highest fidelity | Subjective quality, novel edge cases, brand voice |

**Prefer hooks and tests over LLM judges.** A hook that prevents nested conditionals is
stronger than an LLM judge that flags them after the fact. Automated enforcement is
always better than advisory feedback.

Rules of thumb:
- If it can be a linter rule or pre-commit hook → make it a hook
- If it can be a test assertion → make it a test
- If it requires judgment but has clear criteria → make it an LLM judge
- If it's truly subjective → save it for human review

### Phase 3: Build the Eval Suite

For each eval criterion, create the enforcement artifact. Each type has a concrete
execution mechanism that Claude Code, Codex, or any agent can run.

---

#### Hooks (repo-level or harness-level)

**What:** Shell commands that run automatically before commit or push.
**Execution:** Pre-commit hooks, Claude Code hooks in `.claude/settings.json`, or CI checks.

```jsonc
// .claude/settings.json — harness-level hooks
{
  "hooks": {
    "PreCommit": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "npx eslint --rule 'complexity: [error, 5]' --rule 'max-depth: [error, 2]' ."
          },
          {
            "type": "command",
            "command": "npx tsc --noEmit"
          }
        ]
      }
    ]
  }
}
```

```bash
# .husky/pre-commit — repo-level hook
#!/bin/sh
npx lint-staged
npx tsc --noEmit
```

Hooks work fantastically for coding conventions. Less so for business logic, design,
or UX — but where they work, they're the strongest guarantee. The agent cannot commit
code that violates a hook.

**Examples of eval criteria as hooks:**
- No nested conditionals deeper than 2 levels → `max-depth` ESLint rule
- All exports must be typed → `tsc --noEmit`
- No `any` types → `@typescript-eslint/no-explicit-any`
- Max function complexity → `complexity` ESLint rule
- No `console.log` in production → `no-console` ESLint rule
- Custom domain rules → write a custom ESLint plugin or shell script

---

#### Tests (acceptance tests that exist before the code)

**What:** Executable tests that encode eval criteria as pass/fail assertions.
**Execution:** Standard test runner (`vitest`, `jest`, `playwright`, `xctest`).

The agent runs these the same way it runs any test — `npm test`, `vitest run`, etc.
The key difference is these tests are written FROM eval criteria, not from implementation.

```typescript
// eval-encoding acceptance test (Playwright)
// Criterion: "Primary action must be reachable within 1 tap from launch"
test('primary action is immediately accessible', async ({ page }) => {
  await page.goto('/');
  const primaryAction = page.getByRole('button', { name: /create|new|start/i });
  await expect(primaryAction).toBeVisible();
  // No navigation required — it's on the first screen
});

// Criterion: "Touch targets must be >= 44px"
test('all interactive elements meet minimum touch target', async ({ page }) => {
  await page.goto('/');
  const buttons = await page.getByRole('button').all();
  for (const button of buttons) {
    const box = await button.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
});
```

```typescript
// eval-encoding unit test (Vitest)
// Criterion: "Error messages must describe how to fix the problem"
test('validation errors include recovery instructions', () => {
  const result = validateEmail('not-an-email');
  expect(result.error).toContain('Enter a valid email'); // what's wrong
  expect(result.error).toMatch(/e\.g\.|example|like/i);  // how to fix
});
```

**These are not unit tests.** They exist to enforce eval criteria, not to test
implementation details. They are the red in red-green-refactor, but the "red" comes
from the eval, not from a spec.

---

#### LLM Judges (sub-agent evaluation)

**What:** A sub-agent that evaluates output against specific criteria and returns a
structured verdict.
**Execution:** Launch as a sub-agent via the Agent tool, or run via CLI as a separate
Claude/Codex invocation.

There are three concrete execution patterns:

**Pattern A: Review persona sub-agent (parallel evaluation)**

Launch multiple sub-agents, each evaluating a different dimension. Each returns a
structured verdict the orchestrator can parse.

```
# Prompt template for a review persona sub-agent
You are evaluating code changes against a specific quality criterion.

## Criterion
{eval_criterion_from_phase_1}

## Reference Material
{distilled_rules_from_reference_source}

## Changes to Evaluate
{git_diff_or_file_contents}

## Your Task
1. Evaluate the changes against the criterion
2. Cite specific lines that pass or fail
3. Return your verdict in this exact format:

VERDICT: PASS | FAIL
EVIDENCE: [specific lines/patterns that support your verdict]
FIXES: [if FAIL, exactly what must change]
```

The orchestrating agent launches these in parallel and collects verdicts:

```bash
# CLI execution — run judge as a separate agent
claude -p "$(cat judge-prompt.md)" --output-format json 2>&1
```

```bash
# Or via Codex for cross-model consensus
codex -q "$(cat judge-prompt.md)" 2>&1
```

**Pattern B: Adversarial sub-agent (fresh context)**

Launch a sub-agent with NO prior conversation context. It only sees the eval criteria
and the output. Fresh context prevents politeness drift — the adversary has no social
relationship with the builder.

```
# The adversary prompt (given to a fresh sub-agent)
You are an adversarial reviewer. You have never seen this code before.
You have no relationship with the author. Your job is to find problems.

## Eval Criteria
{eval_suite_criteria}

## Code Under Review
{implementation}

## Tests
{test_suite}

Find:
1. Criteria from the eval suite that are NOT covered by tests
2. Tests that would pass even if the criterion were violated
3. Edge cases the eval criteria imply but tests don't cover

Return APPROVE only if you cannot find any genuine issue.
Return REQUEST_CHANGES with specific findings otherwise.
```

**Pattern C: Metric-driven eval loop (autoresearch pattern)**

For criteria with measurable outcomes, run experiments and keep only improvements:

```bash
# The loop pattern (from autoresearch)
while true; do
  # Agent makes a change
  claude -p "Improve $CRITERION. Current score: $SCORE" 2>&1

  # Run the measurement
  NEW_SCORE=$(run_eval_metric)

  # Keep or revert
  if [ "$NEW_SCORE" -gt "$SCORE" ]; then
    git add -A && git commit -m "Improved $CRITERION: $SCORE -> $NEW_SCORE"
    SCORE=$NEW_SCORE
  else
    git checkout -- .
  fi
done
```

This works for any eval with a numeric score: accessibility audit scores, performance
metrics, design token coverage, test coverage, CRAP scores, mutation scores.

---

#### Signal-Based Orchestration

When running eval loops (swarm, nightshift, or custom), agents communicate results
via structured signals the dispatcher can parse:

```
# Agent emits these in its output:
<eval>PASS</eval>           — criterion met, move on
<eval>FAIL: reason</eval>   — criterion not met, iterate
<eval>SCORE: 87</eval>      — numeric score for tracking
<eval>BLOCKED: reason</eval> — cannot evaluate, needs human input
```

The dispatcher script parses these and routes accordingly:

```bash
result="$(claude -p "$eval_prompt" 2>&1)"
if [[ "$result" == *"<eval>PASS</eval>"* ]]; then
  echo "Eval passed, proceeding"
elif [[ "$result" == *"<eval>FAIL:"* ]]; then
  failure=$(echo "$result" | grep -o '<eval>FAIL: [^<]*</eval>')
  echo "Eval failed: $failure — routing back to builder"
fi
```

---

#### Calibrating LLM Judges (validate before trusting)

LLM judges are only useful if they agree with human judgment. Before relying on a
judge in production:

1. **Label 100+ examples by hand** — domain expert, binary Pass/Fail
2. **Split labeled data** — 10-20% train (few-shot examples), 40-45% dev (iterate), 40-45% test (final)
3. **Run judge on dev set** — compare to human labels
4. **Measure TPR and TNR** (not accuracy):
   - TPR = P(judge says Pass | human says Pass) — must be > 90%
   - TNR = P(judge says Fail | human says Fail) — must be > 90%
5. **Inspect disagreements** — refine judge prompt for edge cases
6. **Final measurement on test set** — run once, record, never iterate on test

Use `/evals-skills:validate-evaluator` for the full calibration workflow.
Use `/evals-skills:write-judge-prompt` for structured judge prompt design.

---

#### Human Review (annotation interface)

For criteria that require human judgment, build a simple annotation UI:

Use `/evals-skills:build-review-interface` to create a custom annotation interface.
The interface should show the full trace (input → agent actions → output) and collect
binary Pass/Fail judgments per criterion.

### Phase 4: Condition the Agent

Now — and only now — let the agent write the spec.

**Do not write the spec yourself.** Instead:

1. Set an explicit goal: *"I want you to create [feature]. Here are the evals it must pass."*
2. Provide the eval suite as context
3. Give directional guidance: *"Be more concrete about X, more abstract about Y"*
4. Let the agent generate the spec, plan, and requirements
5. Review the spec against the evals — does it address every criterion?

The agent will use language you wouldn't necessarily use yourself. That language is
optimized for the agent's own comprehension. This is a feature, not a bug.

### Phase 5: Implement with Eval Feedback

With evals in place and an agent-written spec:

1. Implement using your standard workflow (TDD, VSDD, etc.)
2. Run the eval suite continuously during implementation
3. Hooks catch convention violations at commit time
4. Tests catch behavioral violations at test time
5. LLM judges catch quality violations at review time

### Phase 6: Iterate on the Evals

Evals are living artifacts. After each project:

1. **Collect what worked** — Which evals caught real problems? Strengthen those.
2. **Collect what missed** — What slipped through? Add new evals for those gaps.
3. **Run new evals against old projects** — This catches regressions you didn't
   intend to introduce and validates that the new evals are genuinely better.
4. **Use autoresearch** — When there's a way to devise a test or predictable outcome,
   use autoresearch to systematically improve the eval. It works incredibly well when
   the goal is well-established.

Target: ~80% of day-to-day tasks covered with strong evals. Work on evals once a week.
Collect information and experiences from active projects and apply them to new eval versions.

## Converting Reference Materials into Evals

When you find a guide, paper, or set of conventions worth encoding:

1. **Summarize across models** — Let 2-3 different models summarize the material
2. **Extract the most important rules** — What are the concrete, enforceable criteria?
3. **Classify each rule** — Can it be a hook? A test? An LLM judge?
4. **Turn rules into both skills and evals** — Skills teach the agent *how*; evals
   verify the agent *did*

Example sources:
- Platform design guidelines (Apple HIG, Material Design, WCAG)
- Programming convention guides (naming, structure, error handling)
- Color theory papers → design eval criteria
- Domain-specific standards → compliance eval criteria
- Internal style guides → hook + LLM judge criteria

## Anti-Patterns

| Anti-Pattern | Why It Fails | Correct Approach |
|---|---|---|
| Writing specs before evals | Specs lack enforcement teeth | Evals first, then let the agent write the spec |
| Writing the spec yourself | Agent does worse with human-authored specs | Condition the agent with evals, let it write |
| Advisory-only evals | "Should" is weaker than "must" | Turn evals into hooks and tests where possible |
| Single-model eval creation | One model's blind spots become your blind spots | Use 2-3 models to converge on criteria |
| Static evals | Evals rot like any other artifact | Iterate weekly, validate against old projects |
| Over-specifying directly | Too much detail constrains the agent poorly | Set goal + limitations, let agent fill in details |
| Evals without reference materials | Criteria become arbitrary opinions | Ground evals in authoritative sources |
| Never revisiting old projects | New evals are never validated | Re-run new evals on old work to catch surprises |

## Eval Quality Checklist

Before relying on an eval suite:

- [ ] Every criterion is grounded in a reference source (guide, paper, standard)
- [ ] Each criterion is classified: hook, test, LLM judge, or human review
- [ ] Hooks are installed and blocking (pre-commit, CI, harness-level)
- [ ] Acceptance tests encode eval criteria and run in CI
- [ ] LLM judges have calibration examples with expected scores
- [ ] The agent has been conditioned with the evals before writing specs
- [ ] The eval suite has been run against at least one prior project for validation
- [ ] Cross-model consensus was used for subjective criteria

## Integration with Other Skills

| Skill | How Evals-First Integrates |
|---|---|
| `/grill-me` | Run after evals are defined — interrogate the eval-conditioned spec |
| `/vsdd` | Evals become the spec crystallization input for VSDD Phase 1 |
| `/tdd` | Eval-encoding acceptance tests become the red-green-refactor targets |
| `/mutation-testing` | Verify that eval-encoding tests actually catch violations |
| `/swarm` | Eval suite feeds the acceptance agent in the swarm |
| `/autoresearch` | Use when an eval criterion has a testable, measurable outcome |
| `/nightshift` | Eval suite becomes the quality gate for AFK development |
| `/design-principle-enforcer` | Design evals feed the SOLID critique |
| `/seam-tester` | Eval criteria at system boundaries become seam tests |
