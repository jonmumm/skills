---
name: verify-on-device
description: >
  Give a project its own scripted proof that the real app works: generate a project-local
  `verify-<app>` skill (Launch, Doctor, Drive, Evidence, Cleanup + a feature map of every role and
  screen), prove it once end to end, and keep it honest with a maintenance pass. Ships
  `av-verdict.mjs`, which fails a recorded clip on black/white screens, frozen video while audio
  plays, and missing or silent audio. Use for "verify on device", "make a verify skill for this
  repo", "prove it works on the TV/iPad", "audit the verify skill", before calling any cast, TV or
  iPad bug fixed, or when a repo has no scripted way to drive the real app.
---

# Verify on device

An agent that can't see the result of its work can't loop on it, and then the user becomes the
test. This skill makes each repo carry its own **verify skill**: one place that says how to start
the real app, check it's healthy, drive it like a player, capture proof, and clean up. Every
agent reuses it instead of writing a new harness each session.

Adapted from Lauren Tan's (@poteto) `create-verification-skill` and
`maintain-verification-skill` in pstack (github.com/cursor/plugins/tree/main/pstack).

## The rule this skill enforces

**Nothing on the TV, cast path or iPad is "fixed" until the repo's verify skill drove it and the
evidence passed.** If a check needs hardware that isn't attached (the Chromecast, the iPad), say
so plainly, keep the fix as "unverified on device", and end with a short manual checklist for the
user. Never state a device's capabilities or a deploy/publish state from memory: run the probe.

## Mode 1: create `.claude/skills/verify-<app>/`

### 1. Read the repo before asking anything

Answer from the code; ask the user only for what you can't observe.

- **Surfaces**: what each player touches (TV scene, grown-up phone, kid iPad, toddler seat,
  cast receiver, native app). Every role is a surface.
- **Run**: the repo's own dev/preview command, ports, HTTPS (`dev-https.sh`), env, seed/room setup.
- **Drive**: harnesses that already exist first: `e2e/record-mission.ts`, `scripts/*-check.ts`,
  `launch-room`, scenario hooks (`?hook`, `?scenario=`), Playwright device contexts, pychromecast
  probes, receiver `GET_STATE`. Write a new one only when nothing covers the surface.
- **Observe**: screenshots, the stitched recording with real TV audio, `stream-check` fps and
  audio energy, receiver state, server logs.
- **Isolate**: can two instances run side by side (ports, rooms, Chrome profiles, GPU stream
  sessions)? If not, the verify skill must refuse to drive an instance it didn't start.

If the checkout doesn't start, fix that first or report exactly why. A verify skill written
against a broken base teaches wrong steps.

### 2. Write the skill

`.claude/skills/verify-<app>/SKILL.md` with frontmatter (`name`, and a `description` naming the
app, its surfaces and "use before calling any change fixed"). Sections, all with real commands
from this repo and no placeholders:

| Section | Contents |
|---|---|
| **Launch** | Exact command(s), the ready signal (log line, port answering, `data-*-ack`), and the matching teardown. |
| **Doctor** | One read-only check: process up, right build/commit, port is ours, keys loaded, device attached (`xcrun devicectl list devices`, cast discovery). Run first, and again after anything surprising. |
| **Drive** | Per surface, the recipe with stable handles (data attributes, ARIA labels, scenario ids), never coordinates. Fake phones emit resting `devicemotion`. iPad is **landscape**. |
| **Evidence** | Where proof goes (`evidence/<timestamp>/`), what proves a feature (the action *and* the resulting state on every affected screen, plus side effects like room state), and the AV gate: `node ~/src/skills/verify-on-device/scripts/av-verdict.mjs <clip> --expect-motion --expect-audio --out verdict.json`. |
| **Cleanup** | Kill what you started, by PID or session id, never by process name. Stop any GPU stream or cloud instance you started and confirm it's gone. Cleanup never deletes evidence. |
| **Cost** | Anything billed (GPU stream, cloud renderer, paid API) gets a hard wall-clock cap and its hourly cost written here. |

Every helper the skill ships is executable and its exact invocation is in the skill body.

### 3. Seed the feature map

`.claude/skills/verify-<app>/features/README.md` (index) plus one file per player-facing feature
(start with the 3–5 that matter most: joining a room, the core turn, the payoff, casting, the
toddler seat). Each file has four sections:

- **Sub-features**
- **How a player gets there** (per role)
- **Driving it** (harness commands, scenario ids)
- **Proof and gotchas** (the observable end state on each screen; known timing traps)

The map is the list a proof must cover. Driving one convenient entry point is incomplete when the
map lists others.

**Every map also has `features/lifecycle.md`.** First-run happy paths pass while the family hits
the second run: the user found every one of these on a real device after a "verified" fix.

- Stop casting, then cast again; switch which phone casts; kill and reopen the app mid-game.
- Permission already granted, and already denied (motion, mic), before the first tap.
- Rejoin from the same browser or profile (must get the same seat, not a second one).
- A long session: play-again ×3 and a full veteran run (Rocket Crew's TV went white "after the
  8th or 9th" problem).
- Cold load on the slowest device with an empty cache (Number Quest's robot voice only played
  before the clip list loaded on the iPad).
- Home / park in the OGS launcher: game audio stops.

**TV safe area.** Real TVs overscan: at the renderer's 1280×720, every piece of content must sit
inside a 5% inset (the OGS TV was "offset and didn't all fit" on a real screen). Evidence for a
TV page includes that check.

### 4. Prove it before handing over

Run the new skill's own steps once: Launch → Doctor → drive **one** mapped feature → capture
evidence → av-verdict → Cleanup. Then confirm the evidence still exists and nothing you started is
still running (ports, Chrome, GPU). Fix what failed and clean up after every failed attempt. A
verify skill that has never run is a draft.

Commit it in the game repo.

## Mode 2: maintain (when the app changed, or "audit the verify skill")

The map goes stale as soon as the game changes. One pass ends in exactly one outcome:
**clean** (nothing to change), **changed** (one commit of proven corrections to the verify skill),
or **blocked** (say precisely what stopped it).

1. Edit only the verify skill's own directory. A feature that no longer works is a product bug:
   report it, don't rewrite the map to match the bug.
2. Fix the index: missing, extra or dead feature files.
3. **Source pass**: one read-only subagent per feature file, in parallel. Each explains how the
   feature works from the code now, cites likely drift, and returns one drive recipe. Subagents
   never drive the app.
4. Check recent commits for player-facing surfaces the map doesn't list (cite the path).
5. **Live pass**, always, even when the source looks clean: the main agent drives every feature at
   least once against one instance it started. Run Doctor before the first drive and after any
   failed one. Evidence survives every cleanup. Re-drive any harness fix before committing it.
6. Triage: wrong description → fix the map; harness can't drive working behaviour → fix the
   harness; behaviour actually broken → tell the user, keep it out of the commit.

## Gotchas

- **Recordings with no sound** are usually a hung CoreAudio, not the game. The recorder falls back
  to silent video; `av-verdict --expect-audio` turns that into a failure instead of a shipped clip.
- **Static lobbies with music are legitimate.** Use `--expect-motion` only on clips that should be
  moving (gameplay, payoff); a menu hold reports `frozen_with_audio` as a warning without it.
- **Short fades are fine.** Black or white spans under 1 s are ignored; a white screen after the
  mission ends is not.
- **Device claims need a probe.** Cast support, receiver publish state, "phone connected": run the
  command and quote its output, or say it's unverified.

## Files

- `scripts/av-verdict.mjs`: AV gate for any recorded clip (JSON verdict, exit 1 on failure).
  Tests: `node --test scripts/`.
