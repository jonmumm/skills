# Studio board files

Keep them short and machine-friendly. Every team reads the board at the start of a round and
writes to it at the end.

## STUDIO.md

```markdown
# OGS Studio

## Goal (unified, changes only with Jon's approval)
Build a catalog of cozy, beautiful family TV games: TV plus a grown-up phone plus kid devices, cast
through OGS. Kids ask to play them again, and grown-ups and kids talk to each other while playing.

## Studio scorecard (every game is scored on these; anchors at 4 / 6 / 8 / 10)
| Row | 4 | 6 | 8 | 10 |
|---|---|---|---|---|
| Kid can play alone after one demo | … | … | … | … |
| Talking together | … | … | … | … |
| Little-kid delight (youngest player) | … | … | … | … |
| Feedback on every press (device + TV) | … | … | … | … |
| TV beauty vs named references | … | … | … | … |
| Characters and charm | … | … | … | … |
| Audio (produced, mixed, calm where it should be) | … | … | … | … |
| Stream and device performance | … | … | … | … |
| Replay pull (real playtest: asked again?) | … | … | … | … |
| Distinct from the rest of the catalog | … | … | … | … |

## Principles
Kids never read (unless it's a reading game). No losing. Every press answers. Ask before adding
anything not in the spec. Nintendo is a quality bar, not a style to copy.

## Budgets
Studio monthly: fal $__, ElevenLabs __ chars, Runway __ credits, Meshy __. Per team in the registry.

## Gates
Jon approves: new teams, prunes/merges, budget increases, goal changes, deploys to the OGS directory.
```

## REGISTRY.yaml

```yaml
updated: 2026-09-29T21:00-07:00
recording_lock: null          # team name while recording, else null
teams:
  - team: owls
    game: Night Flight
    repo: ~/src/night-flight-owls
    version: "co-op race vs the sun; painted storybook forest"
    status: polishing          # idea | pilot | building | polishing | playtest | shipped | paused | pruned
    port: 8793
    models: { lead: opus, scene: opus, first_pass: sonnet, critic: opus }
    scores: { min: 7, trend: [4,5,6,7], last_round: 24 }
    playtest: { last: 2026-09-28, verdict: "asked again next day" }
    budget: { fal_usd: 10, spent_fal_usd: 0, elevenlabs_chars: 20000 }
    needs_from_jon: ["cast on the real TV and confirm the receiver handshake"]
claims:
  - what: "shared recorder core + evidence pack"
    team: kit
    since: 2026-09-29
```

## FINDINGS.md (append-only)

```markdown
- 2026-09-28 · owls · [perf][adopt] 1% black-frame flicker = NaN from pow() of a negative base,
  smeared by bloom. Guard pow/normalize. shoot now fails on any black frame. (night-flight-owls@4b1c2)
- 2026-09-29 · nook · [kid][adopt] iPad sound buttons read as choices. Round "singing drums" with a
  speaker badge fixed it. (story-nook docs/…)
- 2026-09-29 · nook · [critic][fyi] Re-grading against named AAA references dropped the min from 6
  to 4. That was the honest ceiling of vector clip-art; produced fal art fixed it.
```

One finding per line: date · team · tags · what happened and what to do · a pointer.

## teams/<team>/CHARTER.md

```markdown
# Team <name>: <game or version>
Version of the problem: <the variant this team owns, and how it differs from the others>
Angle to push: <the approach it is prompted to take>
Out of scope: <what the other teams own>
Done when: <studio scorecard rows ≥ 8 and a kid playtest verdict>, or <a pilot question answered>
Budget: <spend caps>. Models: <lead / scene / critic>. Port: <n>.
Skills: cast-party-game, procedural-3d-web-game, ai-art-assets, tdd, grill-me (…)
Rules: read INBOX + new FINDINGS every round; post 1–3 findings every round; claim shared work;
never edit tests to fit a change without flagging it; STATUS.md must always be resumable.
```

## teams/<team>/INBOX.md

The coordinator appends. The team marks each item `done` / `declined: why`.

```markdown
## 2026-09-29 21:40 from coordinator
1. Team nook found produced lullaby beds took Audio 4→7 (FINDINGS 09-29). Your Audio row is 5; try
   the same pipeline. Claim `audio-beds` first; kit is packaging it.
2. Your min has been flat for 2 rounds on "TV beauty". Before another code pass, calibrate a painted
   kit (ai-art-assets) and re-score. Budget raised to $15 (Jon approved).
```
