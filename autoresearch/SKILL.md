---
name: autoresearch
description: >
  A hypothesis-generating loop that validates itself. Claude Code proposes a
  change, runs a fixed-budget experiment, measures a deterministic metric, then
  git-commits wins and git-reverts losses — repeating ~10–100x while you're AFK.
  Use whenever there's a single scalar metric to push (lower KL / RMSE / loss /
  latency, higher accuracy / score / win-rate / pass-rate) and the validation
  runs end-to-end without human judgment. The pattern is the skill — no special
  package, no ML required. Works on simulators, fitting routines, portfolio
  optimizers, eval pass rates, hyperparameter tuning, solver tuning, fuzzing,
  perf budgets, prompt scores — anything optimizable. Triggers: "autoresearch",
  "run autoresearch", "optimize this overnight", "AFK optimize", "autonomous
  experiments", "iterate until <metric> hits <target>".
---

# Autoresearch — Self-Validating Hypothesis Loop

Autoresearch is a **pattern**, not a package. The shape is: agent generates a
hypothesis → agent runs a bounded experiment → the experiment produces a number →
git keeps the change if the number improved (and regressions still pass), reverts
otherwise. Repeat for hours.

The agent is **Claude Code itself**, running in your project. There is no
separate framework, no Python harness to install. You wire the four steps with
whatever scripts already exist in the repo, write a `program.md` describing the
metric and the rules, and tell Claude to run the loop.

It applies to anything where:

1. A single scalar metric defines "better" (lower or higher).
2. One run of the validation script produces that metric, end-to-end, without human input.
3. The metric is reproducible (or stable enough that noise < signal per run).

> **Goodhart warning.** The agent will optimize the metric *exactly*, including
> degenerate paths (overfitting val set, exploiting timing noise, removing safety
> checks). Define the metric so the only way to move it is the way you want, and
> always pair it with a regression test suite that must also pass before commit.

## Canonical example: f1-dk race-model fitting

The f1-dk codebase **is already running autoresearch** — every recent commit on
`main` is a kept experiment:

```
9c731f1 Drop per-driver alphas (parameterless win): -22 params, -2.25 held-out KL
2ea6592 Extend Powell+bounds to Phase 1 + Phase 3 (codex Rank 6 fully applied)
1baf367 Multi-start + ensemble — best held-out KL yet (53.05)
```

The shape:

| Loop piece | f1-dk implementation |
|---|---|
| **Metric** | Held-out KL on a frozen race set (lower better, current best 53.05) |
| **Validator** | `python train.py …` printing the KL, deterministic with fixed seeds |
| **Modifiable** | `train.py` — parameterization, optimizer choice, multi-start, bounds |
| **Frozen** (per `CLAUDE.md`) | `prepare.py`, `config.py`, scoring rules in `test_scoring.py` |
| **Regression gate** | `pytest test_scoring.py -v` (DK 2026 rules must still pass) |
| **Keep/revert ledger** | `git log` — commit messages carry the metric delta |
| **Agent** | Claude Code, running locally |

No language models were trained. No GPU. No special framework. The loop is just
"propose a change in `train.py`, run the fitter, parse KL, compare to last
commit, run pytest, commit or revert." Run that for a night and the agent claws
the metric down a slice at a time.

## When to reach for autoresearch

✅ **Good fit** — deterministic and/or optimizable:
- Numerical fitting / inference: f1-dk's Thurstone race model, any MLE/MAP loop with held-out likelihood
- Simulators with a fitness metric: portfolio expected value, betting-odds RMSE, lineup `mean(max-score-per-sim)`
- Hyperparameter search where grid/random is too coarse
- Algorithmic tuning: solver iterations, beam width, sampling temp, ensemble weights
- Performance budgets: bundle size, p99 latency, peak RSS
- Fuzzing/property-test minimization: shortest counterexample, highest crash count
- Eval pass-rate against a frozen rubric or labeled set
- ML training (Karpathy's original use case) — see footnote recipe

❌ **Wrong fit:**
- Subjective quality (UI polish, copy tone) — use `/autodesign` or a calibrated LLM judge
- Tasks needing human-in-the-loop confirmation each step
- Metrics that aren't reproducible or whose run cost is hours, not minutes
- Anywhere "kept" experiments can break unrelated behavior without the regression gate noticing

## Core loop

```
human writes program.md (metric, modifiable files, frozen files, regression gate, budget)
    ↓
Claude Code reads program.md and current code
    ↓
proposes a change (architecture, hparam, prompt, algorithm…)
    ↓
runs the validator: bounded budget (5 min / N sims / fixed seed)
    ↓
parses metric → compares vs. last committed best
    ↓
improved AND regression tests pass → git commit
not improved OR regressions → git reset --hard HEAD
    ↓
repeat (~10–100 experiments per session)
```

`git log --oneline` is the results table. Every commit is a real improvement on
a real metric.

## Setup pattern (works in any project)

Four pieces in the repo. Build once, then the loop runs itself.

### 1. `program.md` — the agent's standing orders

Your leverage point. Specify:

- **Goal** — single scalar metric, direction (lower/higher better), current best,
  target if you have one. *"Lower held-out KL on `data/2026/holdout.yaml`. Current
  best 53.05. Target < 50."*
- **What's fair game** — files the agent may modify. *"Modify only `train.py` and
  `model.py`. `prepare.py`, `config.py`, `scoring.py` are frozen."*
- **Validation command** — exact command, exact line that holds the metric.
  *`python train.py --quiet | tail -1`* and *"line is `KL=<float>`"*.
- **Time budget per experiment** — wall-clock cap so attempts are comparable.
- **Regression gates** — tests that must pass before commit.
- **Heuristics** — "small changes first", "if 3 attempts in a direction fail
  switch directions", "explain the hypothesis in 2 sentences before each change",
  "after a kept commit try a *different* axis."

### 2. Validation script — deterministic, bounded, single number

- Print the metric on its own parseable line (`METRIC=0.4523` or similar).
- Fix all randomness (seeds, data order). Noise must be smaller than the
  improvements you care about.
- Cap runtime. If validation can blow past the budget, the loop stalls.

### 3. Regression tests — `pytest` (or equivalent) that must pass

Run *before* committing. If the metric improved but tests fail, discard.
This is the guard against Goodhart.

### 4. `loop.sh` — the harness

```bash
#!/usr/bin/env bash
set -euo pipefail

BEST_FILE=.autoresearch/best
BUDGET_SEC=${BUDGET_SEC:-300}
mkdir -p .autoresearch

prev_best=$(cat "$BEST_FILE" 2>/dev/null || echo "inf")

# 1. Run validation under time budget
metric=$(timeout "$BUDGET_SEC" python validate.py | grep -oE 'METRIC=[0-9.]+' | cut -d= -f2)

# 2. Compare (lower-is-better here; flip for higher-is-better)
better=$(python -c "print(float('$metric') < float('$prev_best'))")

# 3. Regression gate + commit/revert
if [[ "$better" == "True" ]] && pytest -q; then
  echo "$metric" > "$BEST_FILE"
  git add -A && git commit -m "autoresearch: $metric (was $prev_best)"
else
  git reset --hard HEAD
fi
```

## Launch

From the project root:

```bash
claude
```

Then prompt:

```
Read program.md. We are running autoresearch. The validation command, the
metric definition, and the rules for kept/discarded experiments are all there.
Run fully autonomously — do not ask for confirmation between experiments.
After each experiment run loop.sh, then propose the next change. Keep going
until I come back or you've made 50 attempts without improvement.
```

> **First-time check.** Watch the first 2–3 experiments before going AFK. Verify
> Claude is actually running `loop.sh`, that the metric is being parsed, and
> that commits/reverts are happening. The most common failure is silent: the
> agent "tries" changes but never actually invokes the validator.

## More recipes

### Recipe: Portfolio / lineup optimization (f1-dk)

- **Metric**: `python eval_portfolio.py --quiet` → `mean(max(lineup_score per sim))`. Higher better.
- **Modifiable**: `portfolio.py`, `optimize.py`.
- **Frozen**: scoring rules, race model.
- **Regression gate**: `pytest test_scoring.py` + a lineup-validity check (salary cap, roster rules).
- **Budget**: `--sims 10000` cap.

### Recipe: Hyperparameter / solver tuning

- **Metric**: solver objective on a held-out instance set.
- **Modifiable**: a single `config.yaml`.
- **Regression gate**: solver still produces a feasible solution on every instance.
- **Budget**: per-instance timeout × number of instances.

### Recipe: Performance budgets

- **Metric**: p99 latency / bundle size / peak RSS.
- **Modifiable**: hot-path code, build config.
- **Regression gate**: full functional test suite + golden output diff. *Do not* skip — this recipe is the easiest to silently break correctness.
- **Budget**: per-bench wall-time × repetitions for noise control.

### Recipe: Prompt / eval-set tuning

- **Metric**: pass-rate or F1 against a frozen labeled set, judged by a frozen LLM judge (`temperature=0`, pinned model version).
- **Modifiable**: prompt files.
- **Regression gate**: held-out canary set the agent never sees.
- **Budget**: cost-cap (max $X per experiment) since judge calls dominate.
- Watch Goodhart hard — judges are gameable. Calibrate against human labels first.

### Recipe (footnote): Karpathy's overnight LLM training

If you happen to want a tiny LLM trained overnight on val_bpb, the wiring already
exists at [`miolini/autoresearch-macos`](https://github.com/miolini/autoresearch-macos)
(Apple Silicon) or [`karpathy/autoresearch`](https://github.com/karpathy/autoresearch)
(NVIDIA). `uv sync && uv run prepare.py && uv run train.py`, then point Claude at
its `program.md`. This is one instantiation of the pattern, not the pattern itself.

## Tips for getting real results

1. **Smoke-test the validator first.** One manual run, end-to-end. If you can't reliably get a metric out, the agent can't either.
2. **Tighten `program.md` over time.** Most "agent wandered" failures are underspecified instructions.
3. **Most experiments fail.** 10–20 keepers per 100 attempts is normal. The git log filters to wins automatically.
4. **Watch for noise > signal.** If repeated runs of the same code give different metrics by more than a typical improvement, fix the seed / increase samples / lengthen the budget *before* starting the loop.
5. **Strict comparison.** Use `<` / `>` not `≤` / `≥`. Otherwise the agent drifts on within-noise "neutral" changes.
6. **Commit message = experiment description.** Have Claude write a one-line hypothesis in each commit message. `git log` becomes a research diary.

## Output artifacts after a session

- **`git log --oneline`** — chronological list of wins, each with the metric in its message.
- **`.autoresearch/best`** — current best metric.
- **`results.tsv`** (optional, recommended) — every attempt with metric, duration, kept/discarded, hypothesis. Lets you plot metric vs. experiment number.

## Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| Agent never invokes the validator | `program.md` underspecifies the loop | Make `loop.sh` mandatory; the agent must call it after every change. |
| Metric improves but tests break | Missing regression gate | Add `pytest`/equivalent step before `git commit`. Revert if it fails. |
| Same metric forever | Validator is too noisy or too short | Fix seed; lengthen budget; aggregate over multiple seeds. |
| Agent loops on the same change | Not tracking what's been tried | Append every attempt to `results.tsv`; instruct it to read the file before proposing. |
| All experiments time out | Budget too tight or change exploded runtime | Lower problem size; raise budget; cap memory. |
| Massive metric jump that looks fake | Goodhart — agent gamed the metric (overfit, removed asserts, hardcoded answer) | Inspect the diff. Add the gamed path as a regression test. |
