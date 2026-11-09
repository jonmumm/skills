# Propose ideas before implementing

After critics merge a gap list, the parent drafts ideas and a **fresh judge panel picks one**
before any fix owner edits pixels.

## Parent writes `critic/rounds/NN/proposals.md`

```markdown
# Round NN proposals — largest gap: <one line>

## Idea A — <name>
- Changes: <what moves on which shots>
- Keeps: <what must not change>
- Rows aimed: <Type floor, Spacing, …>
- Risk: <low|med|high>

## Idea B — …
## Idea C — …
## Idea D — … (optional)
```

Rules for good ideas:
- 2–4 ideas, mutually distinguishable (not three opacities of the same tweak).
- Each names shots and scorecard rows.
- Stay inside any user constraint ("climb Timer cathedral", "no yellow").
- No "polish everything" — one primary bet per idea.

## Judge prompt (fresh panel)

```text
You are judging design directions, not grading the whole product again.
Read critic/SCORECARD.md anchors, critic/rounds/NN/ evidence (shots + checks.json), and
critic/rounds/NN/proposals.md. Do not read source code. You are not told a target score.

Pick exactly one idea (or a named hybrid of two: "B+C: …"). Say:
1. The pick and why it best closes the largest gap against the anchors.
2. What must stay true from the current face so identity doesn't drift.
3. Acceptance tests for the fix owner (shot names + observable checks).
4. Which rejected ideas to revisit next round if this fails.

Do not invent a fifth idea unless all proposals miss the gap; if so, say so and stop.
```

Log: `propose|NN|<idea id>|chosen` in `critic/decisions.tsv`.
