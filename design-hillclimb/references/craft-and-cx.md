# Craft and CX rows (measurable)

Concept rubrics pick a direction. These rows catch the failures users actually reject: tiny
type, broken padding, overcrowded faces, and "it works in a desktop iframe but not at device
size."

Add the rows that apply. Keep **6 / 8 / 10** anchors as observable tests. Prefer
`checks.json` for anything that can be measured.

## Always-on craft rows

| Row | 6 | 8 (ship bar) | 10 |
|---|---|---|---|
| Type floor | some labels readable at device size | body ≥ 12 px (phone) / platform min; primary numeral clearly dominant; no critical label wraps past 2 lines | type would survive a screenshot tweet; numerals tabular and calm |
| Spacing & alignment | mostly aligned; a few cramped edges | consistent rhythm; no accidental collisions; margins match the system | you could overlay a spacing grid and it holds |
| Density | information fits if you squint | one job per glance; secondary data does not compete with the primary | empty space feels intentional, not leftover |
| Hit targets | most controls usable | ≥ 44×44 pt (or Watch HIG minimum) on every primary control; no 2-in-1 "Pause · Skip · End" crumb bar unless each zone is separately hittable | targets feel generous in gloves / motion |
| Clip & overflow | rare clipping | zero clipped text/controls in `checks.json` at declared device size | same under Dynamic Type / larger text |
| Accessibility | some labels | WCAG AA; colour never alone; missing data is a dash + words, never `0` pretending to be real | graded mostly by checks |

## Wearable / Watch extras

| Row | 6 | 8 | 10 |
|---|---|---|---|
| Arm's-length glance | phase readable after a stare | primary time/state readable in <1 s at arm's length; one dominant number | glance works in motion / glare (verify outdoors when claimed) |
| Device-size honesty | looks fine in a marketing mock | craft graded only from true Watch CSS viewport shots, not desktop heroes | matches real hardware screenshots |

## Phone / large-surface extras

Use the scorecard-template surface rows (kid, TV, etc.) when relevant. TV: nothing critical under
24 px. Kid: zero instructional words on no-words surfaces.

## Automatic checks to wire

Put these in `checks.json` (names suggestive — match your shooter):

- `targetsUnder44` (or platform equivalent)
- `contrastFails`
- `clippedText` / overflow outside device bounds
- `typeFloorFails` — body text below the product's declared minimum
- `labelWrapFails` — critical labels wrapping beyond N lines
- `scenarioAckMismatch`

**Prove each check** with a planted fault before round 01 (`hillclimb` Step 1).

## Golden pairs

When the user rejects or prefers a variant, append to `critic/golden.md`:

```markdown
| Pair | A | B | User side | Why (their words) |
|---|---|---|---|---|
| 01 | synthesis-sprint.png | outdoor-e-sprint.png | B | "this looks like shit" on A |
```

Critics must pick the user side on ≥ most pairs before deep climbing. Failures mean the rubric
still rewards concept cleverness over craft.
