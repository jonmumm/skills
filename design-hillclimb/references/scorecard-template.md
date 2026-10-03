# Scorecard template

Copy to `critic/SCORECARD.md`. Replace the references with the 4–8 shipped products that define
"10" for *this* product. Keep anchors for 6, 8 and 10 on every row: without anchors, critics
drift into opinion. Use the patterns of the references, never their trade dress.

```markdown
# Design scorecard (graded like a first-party product + design review)

References (the "10"): <e.g. Nintendo Switch home + user picker, PS5 activity cards, Apple TV +
iPhone continuity, Netflix Kids profiles, NYT Games>. 6 = a competent indie app. 8 = a
first-party product/design lead would sign off shipping it. 10 = reference-grade. Grade every
row against the references, never against the previous round. Stop when every row ≥ 8.

| Row | 6 | 8 (ship bar) | 10 |
|---|---|---|---|
| Mental model & IA | screens make sense one at a time; the user can't say what the parts are | a new user explains the model in one sentence after one use; every kind of thing feels like one system | the model disappears: it's just "how it works" |
| Flow efficiency | key flows work but carry extra steps, confirms and re-entry | taps per key flow counted and each justified; no repeated identity/setup questions | the shortest possible path, with nothing to undo |
| State & continuity | the happy path keeps state; leaving loses some | nothing is lost by leaving; every object's status is legible (paused at, waiting on) | resumes exactly, everywhere, without thinking |
| Trust & safety | settings exist somewhere | who/what/consequence visible at the moment of decision; reversible | trust is ambient; you never wonder |
| Edge & failure states | errors are generic toasts | every listed failure designed: calm, specific, one recovery action | failures feel handled before you notice |
| Visual craft & brand | consistent but generic (rounded dark cards, stock type) | distinctive, cohesive identity across devices; type/spacing/color at first-party level; no AI-slop tells | instantly recognisable; you'd screenshot it |
| Motion & feel | fades and slides | transitions explain cause and effect (what moved where, which device followed) | motion you'd show off |
| Accessibility | some labels | WCAG AA contrast, 44 pt targets, Dynamic Type survives, colour never carries meaning alone | exemplary; graded mostly by checks.json |
| <surface rows: e.g. Kid surfaces, TV surfaces, Async & notifications, Developer integration> | … | … | … |

## Log

| Round | IA | Flow | State | … | A11y | Min | what changed / largest gap |
|---|---|---|---|---|---|---|---|
| 00 | | | | | | | baseline / concept ranking |
```

## Writing good anchors

- The 8 anchor names an **observable test**: "a game swap has zero QR scans and zero role
  picks on kid devices", not "swapping is smooth".
- Each surface row anchors on its users' real limits (a 3-year-old mashing, a TV at 3 m, a
  grown-up with one hand and a crying kid).
- Keep one row graded mostly by numbers (Accessibility via `checks.json`), so at least one row
  can't drift with critic taste.
