---
name: game-rig
description: >
  Shared, versioned evidence and QA rig for the family cast-party games (Bake Shop, Story Nook,
  Rocket Crew, Peekaboo Garden, Night Flight, Juneau's Number Quest...). One per-game config file
  (game-rig.config.ts) drives: a screen × viewport contact sheet; automatic checks for DOM overlays
  on the TV's focal area, clipped text, repeated labels, taps with no feedback, hold-only controls
  without a hint and the TV overscan safe area; a recorded multi-device session with real TV audio
  judged by av-verdict (black/frozen/silent, camera jerk, pop-in, speech match); CRAP; HTTPS dev
  server; stream-check; a Chromecast launcher with a hard timeout. Use instead of copying
  stream-check.ts / dev-https.sh / crap.* / contact-sheet / record scripts between game repos.
---

# game-rig

Game repos call this rig; they don't copy it. A fix here reaches every game on the next
`git pull` of ~/src/skills. The only per-game file is `game-rig.config.ts` at the repo root:
URLs, roles, how to reach each screen, and the bot that plays a session. Start from
[examples/game-rig.config.ts](examples/game-rig.config.ts) (written for Bake Shop).

```zsh
RIG=~/src/skills/game-rig/bin/game-rig.mjs     # first time: (cd ~/src/skills/game-rig && pnpm install)
$RIG check                 # every screen × viewport: shots, sheet.png, report.json; exit 1 on findings
$RIG sheet                 # the same shots and sheet, no checks
$RIG record                # session → recordings/latest.mp4 + av-verdict, then `open` (--no-open; CI skips it)
$RIG verdict clip.mp4 --expect-motion --expect-audio [--expect-smooth] [--busy spans.jsonl] [--expect-speech words.txt]
$RIG crap --coverage coverage/coverage-final.json --threshold 8
PORT=8795 $RIG https       # wrangler dev over HTTPS (mkcert) for the iPad / phones; PERSIST_TO=… for its own state
$RIG cast list|launch|bridge|stop --device "Chromecast HD" [--minutes 10] [--keep]
$RIG stream-check receiver.html out.png --game URL --stream-server URL --confirm-paid   # PAID
```

Point the config at a dev server you started on a free port (`GAME_RIG_URL=http://127.0.0.1:PORT`
overrides `baseUrl`), and kill it by PID afterwards.

## The config

| Field | What |
|---|---|
| `roles` | `{ tv: { kind: "tv" }, mom: { kind: "phone" }, kid: { kind: "tablet", label: "Kid iPad" } }`; `offCamera: true` leaves a device out of the video. Viewports default per kind: TV 1920×1080 + 1280×720; iPad landscape 4:3 (1080×810, 1024×768, 1366×1024); phones 393×852, SE 375×667, Safari-bars 393×659, landscape 852×393. |
| `screens` | `{ name, role, path?, setup?(rig), checks?, focal?, settleMs? }`. `setup` gets `{ page, open(role, path?), baseUrl, wait, viewport }` and brings that screen up from scratch (host a room, join on other devices, press the buttons). Every screen state a player sees gets an entry. |
| `focal` | Expression for the TV's focal rect. Default `window.__focalRect?.() ?? null`: **games should expose `window.__focalRect()`** (the rect the camera frames: characters, the cake, the rocket). Screens with no 3D scene set `focal: false`. |
| `ignore`, `allowRepeatedLabels`, `tapSelector`, `holdSelector`, `maxTapsPerScreen`, `safeAreaInset`, `chromeArgs` | Tuning. `tapSelector` adds the game's own controls (e.g. `[data-key]` picture keys). |
| `session(rig)` | The bot that plays the whole flow: `rig.pages[role]`, `rig.mark(label)`, `rig.wait(ms)`. Pages are already recording. |
| `audioTap` / `audioRole` / `record` | Audio comes from a Web Audio tap installed in the TV page (anything sent to `ctx.destination`); set `audioTap` to the game's own master-bus `MediaStream` expression if it has one. `record.expectSpeech` = words file for the speech check. |

## The checks (each proven to fail on a bad fixture, pass on a good one: `pnpm test`)

- **overlay**: any painted fixed/absolute DOM element (or its text) over the focal rect, per
  screen at every TV size. A panel is reported once, not once per child. No focal rect = failure.
- **text**: text overflowing its box (ellipsis, line-clamp, hidden/scroll overflow), and the same
  visible label (≥2 letters) twice in one viewport. Labels hidden under another screen don't count.
- **tap**: taps every visible `button`/`[role=button]` (+ `tapSelector`) on a fresh copy of the
  screen; needs a DOM change not seen in a 300 ms idle baseline, a pixel change clearly above the
  scene's own motion, or a Web Audio / media / speech start, within 300 ms. Hold-only controls
  (`[data-hold]` or "hold" in the label) must show new text (a hint) within 1 s of a plain tap.
- **safe-area**: on the TV at 1280×720, all text, images, buttons and media inside a 5% inset.
  Full-bleed art (≥ half the screen) may run into the overscan.
- **av-verdict** (in ../verify-on-device/scripts/av-verdict.mjs, shared with verify skills):
  black/white screens, frozen picture with audio, silent; `camera_jerk` (whole frame changes ≥9×
  the median, ≤3 frames) and `pop_in` (centre jumps, edges don't) are warnings unless
  `--expect-smooth`; `--busy` spans (harness time, like escuchame's video-qa) don't count as frozen;
  `--expect-speech` runs a local ASR (whisper.cpp with `WHISPER_CPP_MODEL`, or openai-whisper with
  a cached model; it never downloads one) and fails below a 0.6 in-order word match. With no ASR
  it says `speech_unverified`. `record` marks the time before the first page load as busy.

## Cast

`scripts/cast/` (from rocket-crew's cast-bridge.py) runs in its own venv, `game-rig/.venv`, never
conda base (`scripts/cast/setup-venv.sh`, run for you). Every launch stops the receiver app after
`--minutes` (default 10, max 180) unless `--keep`, and always on exit. The first message is
`GET_STATE`, so the receiver never falls back to its default cloud view (a billed GPU stream).
`LOAD_VIEW` (cloud rendering, ~$1.4/h) needs `--view URL --stream-server URL --confirm-paid`.
`bridge` speaks JSON lines on stdin/stdout for device harnesses.

## Money

`stream-check` and `cast --view` start a billed GPU stream; both refuse without `--confirm-paid`
and have hard timeouts. Nothing else here calls a paid service.

## Not here (still per game)

Trailers (cards, VO, soundtrack: game-specific art direction), per-game critic packs, and the
bot's game logic (it lives in the config's `session`). The OGS repos' crap.mjs (TypeScript 5 API +
lcov) stays with them; the games use TypeScript 7, so this rig's CRAP parses with Babel.

## Developing the rig

`pnpm test` (vitest: judges, real-Chromium fixture pages, a fixture game served locally, record
with audio), `pnpm test:py` (cast helper with a fake pychromecast), `pnpm typecheck`,
`node --test ../verify-on-device/scripts/*.test.mjs`. TDD: a new check ships with a bad fixture
that fails it.
