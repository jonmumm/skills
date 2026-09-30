# Brief template

The strongest prompts in the case studies (Meng To's river valley, Max's Far Cry lagoon,
Dan Greenheck's ocean) share an anatomy. They were long (1,000–2,500 words), concrete, and
told the model how to check its own work. Use this template to expand a user's idea into
`BRIEF.md`. Write it in plain, specific language; every line should be something a critic can
check in a screenshot or a playtest.

Tip from the builders: people often expand their idea into a brief with a model first (Max did;
donald dictated for 5 minutes and let the model structure it). Do that for the user, then have
them correct it.

**Short mode.** If the user has a folder of their own past 3D work, a short prompt can match
this template's results (Ryan Sael's approach). Attach the reference image, ask for the
page in a sentence or two ("match the vibe as closely as possible; it has to be really
good"), and do the heavy lifting in `STYLE.md` instead: distill their past projects' palette,
lighting and post chain, UI and type, camera and interaction patterns, and load/performance
tricks. Still write sections 11 (hard constraints) and 12 (self-test) below, since they're
what the critic loop checks against.

---

## 1. Pitch and feeling (3–5 sentences)
What the player does, where, and the emotion. Name the inspirations *and* what to take from each
("the island atmosphere of X, the modern lighting of Y"). Say explicitly: a playable, polished
experience — not a static scene or tech demo. Prefer **small and dense over large and empty**.

## 2. Art direction
- Style: photoreal / painterly-cinematic / stylized / low-poly-premium. One sentence on what
  it is *not* ("not cartoon materials, not generic low-poly, not a milky haze").
- Palette with a few hex anchors (sky zenith → horizon, key water colors, accent color).
- Light mood per time of day. Signature look (e.g. golden hour with god rays through trees).
- Reference images: list them and what each is the reference *for* (composition, palette,
  architecture, water color). The model should analyse them before building.

## 3. The place: one continuous, believable location
Describe the layout as a geographer would (river narrows into a gorge; beach → outpost → jungle;
far ranges fade in layers). Then a **landmark list** — 6–12 specific, named things with physical
detail ("an arched vermilion bridge whose piers stand in the water").

## 4. Hero objects, built part by part
For the 1–3 things the camera lingers on, list their construction: parts, materials, wear,
small-scale details (planks with real thickness, rope lashings, bamboo nodes, iron clamps).
This is what separates "sculpted in code" from primitives.

## 5. The centrepiece system (spec it deeply)
Pick ONE system to be the star (usually water, but could be the mechanism, the city, the
weather). Give it a full sub-spec: the physics/optics it must show, how it interacts with other
things, what it looks like at each time of day. See the cookbook for the vocabulary.

## 6. Life and particles
Wildlife, people, ambient particles (petals, dust in sunbeams, mist banks, fireflies), and how
they react to the player or the weather. Idle worlds look dead in video.

## 7. Time of day and weather
List the states, how long the cycle is, what changes (sun arc, moon as key light at night,
stars, exposure, fog, grade), and how weather changes materials (wet, glossy, puddles, then
drying). States must combine (storm at sunset).

## 8. Player, camera and controls
Perspective, movement feel (momentum, inertia, drag), camera rules (never clips into terrain,
chase with drag-to-orbit), full key map, interaction prompts. Any autopilot/idle behavior.

## 9. Mechanics and interactions
The actual game: core loop, goals, each interaction with its feedback (animation + VFX + SFX).
Say what's out of scope ("no enemy AI").

## 10. Audio
Layers of ambience and which actions have sounds; spatial where possible; mute key.

## 11. Hard constraints (non-negotiable, checkable)
- One standalone HTML file, assets generated in code or embedded; no runtime CDN requests.
- Nothing floats, nothing intersects, nothing clips (name the risky pairs: pole vs hands, boat vs rocks).
- Any text rules (e.g. no text in scene; loader purely graphic).
- Performance target (e.g. 60 fps at 1440p on a mid-range GPU at the default tier; Retina-aware).
- Quality flags: every expensive effect sits behind a tier; low must stay fast.

## 11b. Trailer beats (optional, for anything you'll show people)
From Garrett Petersen's trailer-first approach: list the 5–7 shots a 30-second trailer would
need (the core fantasy, the repeated action, a real choice, escalation, progression, variety, a
payoff). Each beat becomes a named scenario and a playtest. The vertical slice is done when
someone playing normally can produce that footage in the real game.

## 12. Self-test instructions
Tell the builder exactly how to verify: which screenshots (views × times × weather), check the
console, fix every visible or technical issue (list the likely ones: black screens, broken
animation, floating objects, camera problems), verify the final file opens directly. Then:
"finish with a brief response." (With this skill: run `scripts/check.mjs` and `scripts/shoot.mjs`
and the critic loop.)

---

## Staged follow-up prompts ("closing the gap")

After the first full build, the best results came from **stage prompts**, each run in a fresh
session and scoped to one area, with global rules repeated at the top:

```
Stages 1–N are done: <what exists>. What's missing is <the gap, stated visually, vs the reference>.

Global rules for these stages:
- Every new effect behind a quality flag; low stays fast.
- Don't break earlier stages: after each stage, check <two regression states>.
- Keep these APIs compatible: <heightAt(x,z), setSky(...), event names...>.
- Rebuild after every change; one console-error check; run shoot.mjs at the end.
- Do only this stage.

STAGE K — <name> (effort: high|max)
Goal: <one sentence>.
1. <specific, physical, measurable change>
2. ...
Acceptance: <what the hero view must show, in checkable terms>.
Performance: <budget for this system, e.g. water ≤ 4 ms/frame at High>.
```

Order stages by impact per cost: light/atmosphere/grade → centrepiece → terrain & vegetation →
materials → props & hero models → performance + final match against reference.
