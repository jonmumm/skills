# AAA scorecard template

Copy to `critic/aaa/SCORECARD.md` in the game. Replace the references with the 3–6 shipped games
(and, for books or crafts, real-world objects) that define "10" for *this* game's style. Keep an
anchor for 6, 8 and 10 on every row: without anchors, critics drift into opinion.

```markdown
# AAA scorecard (graded like a first-party Nintendo / AAA studio review)

References (the "10"): <e.g. Paper Mario: The Origami King, Tearaway, Yoshi's Crafted World,
Kirby's Epic Yarn, Lost in Play, Robert Sabuda pop-up books>. A 7 = "competent indie demo".
An 8 = "a first-party art director would sign off on shipping this". Grade every row against the
references, never against the previous round. Stop when every row ≥ 8.

## Rows used for Story Nook (a cast party bedtime pop-up book)

| Row | 6 | 8 (ship bar) | 10 |
|---|---|---|---|
| Art direction & cohesion | consistent-ish, generic "vector clip-art" | one unmistakable hand-made style across TV, phones, cards; strong shape language; palette with intent | instantly recognisable key art |
| Illustration quality (characters) | stiff proportions, flat fills | appealing, expressive, on-model characters with charm (eyes, silhouettes, poses) on par with a picture book | characters you'd buy as toys |
| Environments & pop-up craft | flat cards | layered illustrated scenery with real paper construction (thickness, tabs, folds), depth, parallax; each place has identity | Sabuda-level paper engineering |
| Materials & rendering | flat colour, plastic | paper reads as paper (fibre, edge, subtle translucency when backlit), soft shadows, DoF, filmic grade | indistinguishable from a physical craft set |
| Lighting & mood | even or murky | lamplit key, bounce, the subject lit most, bedtime mood that deepens page by page | every frame is a painting |
| Animation & feel | tweens | Nintendo-grade easing, anticipation, squash/stretch on paper, secondary motion, satisfying pop-ups and turns | alive, delightful |
| Camera & composition | wanders or crops | every frame composed (thirds, focal point, headroom), gentle cinematic moves | key-art frames |
| Calm (bedtime) | calm-ish | winds down visibly and audibly, never jolts | you'd yawn |
| Story & read-aloud | template-y | reads like a real picture book; grown-up phone disappears | you'd buy the book |
| Kid & little-kid UX | usable | Nintendo-grade kid UX: huge, readable, juicy feedback on every press; nothing confusing | effortless |
| Phone UI polish | functional | first-party quality UI: typography, motion, hierarchy, no dev feel | invisible |
| Audio | pleasant synth | produced lullaby + foley that fits paper and bedtime, mixed, never harsh | a soundtrack you'd hum |
| Replay & payoff | shelf exists | the ending and shelf feel like a reward; covers you want to collect | kids ask for tomorrow |
| Performance & stability | ok | 30 fps stream at 1080p, no hitches, no glitches | — |

**Required on every game** (add it even though Story Nook's table predates it):

| Row | 6 | 8 (ship bar) | 10 |
|---|---|---|---|
| Onboarding & legibility | a new player needs the rules explained | a first-time player learns by playing and can say what caused every outcome on screen | you understand it from across the room |

The Story Nook rows assume kids at bedtime. Write the game's audience (kids / family / adults)
above the table and drop kid rows for games kids don't play.

Adapt rows to the game: an action game swaps "Calm" for "Game feel / responsiveness" and "Story
& read-aloud" for "Readability of threats"; a puzzle game adds "Puzzle clarity"; a multi-screen
cast game keeps "Phone UI polish" and "Kid UX". Keep Performance as the one row graded mostly by
numbers (frame-time p95, shader programs flat, input latency).

## Log

| Round | Art | Illus | Env | … | Perf | Min | Changed |
|---|---|---|---|---|---|---|---|
| 00 | 5 | 5 | 4 | … | 7 | 4 | baseline (previous build graded at AAA) |

One row per round, appended by the main loop from the critic's log row. The "Changed" cell says
what the pass did and the critic's largest remaining gaps, so the log reads as a story.
```
