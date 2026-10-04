---
name: arena
description: >
  Run N parallel attempts at the same task, judge them against a rubric, pick the best as the
  base, and graft the strongest ideas from the others into it. Use for "arena this", design or
  concept rounds, a hill-climb that has plateaued, or any non-trivial artifact where one attempt
  would lock in the wrong shape (an interface, a scene layout, an art direction, a prompt).
---

# Arena

One attempt commits you to its first idea. Several independent attempts show you the design
space; the synthesis keeps the best of each. Adapted from pstack's `arena` (see PSTACK-NOTICE.md).

## 1. Frame (the prompt is the contract)

- Name the artifact every candidate produces and where the shared grounding lives (spec, `how`
  output, evidence from the last round).
- Write a rubric of 3–6 gradeable criteria. Only the judge and you see it; candidates see the task.
  For games, reuse the scorecard rows (`aaa-hillclimb`, `design-hillclimb`).
- Give each candidate its own place to write: a git worktree (`Agent` with `isolation: "worktree"`)
  or `/tmp/arena-<slug>/<n>/`. Shared output dirs contaminate each other.
- Pick runners: 3 by default, mixing families (`fable`, `opus`, `sonnet`). Same model N times is
  fine when the variation should come from the brief (e.g. one art direction per candidate).
- Paid generation: give each candidate an asset budget through `ai-art-assets` caps first.

## 2. Fan out

Spawn all candidates in one message, in the background. Each returns the artifact plus a short
rationale: what it considered and rejected. A candidate that fails is dropped and noted.

## 3. Cross-judge

When all are in, spawn one read-only judge on a different family from yours (or Codex via
`codex exec`). It scores every candidate per criterion and recommends a base. Never judge while
candidates are still writing.

## 4. Pick a base

Read every candidate yourself, score per criterion, compare with the judge. Agreement confirms
the pick; disagreement means a biased reader or a vague rubric: read both rationales. Tie-break
on what a future maintainer can extend without breaking invariants (smaller surface, cleaner seam).

## 5. Graft

Walk each loser once more for the one or two things worth taking. Fold them in by hand so the
result still follows one idea. If all candidates converged, ship the shared shape: that's strong
signal. If they wildly diverged, the framing was too loose: reframe and rerun, don't average.

## 6. Verify

The synthesis is proven like anything else (tests, the repo's verify skill, a re-shot round). A
problem the arena missed means a bad frame (go to 1) or a missed graft (go to 5).

## Output

The artifact plus `ARENA.md` beside it: base and why, judge's verdict, grafts with their source,
rejections, dropouts, verification result.
