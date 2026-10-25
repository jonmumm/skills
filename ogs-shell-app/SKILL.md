---
name: ogs-shell-app
description: >
  Turn a phone-and-TV web game into its own App Store app on the OGS shell, "in an afternoon":
  `pnpm create ogs-game` (a new game: Worker + one Durable Object per room with actor-kit, TV and
  phone pages, the Expo shell app, CI) or `pnpm create ogs-app` (an existing game), then preview
  deploy, the iOS Simulator with the TV on its external display, the TV performance budget,
  AirPlay / Chromecast / browser-TV tiers, and App Store prep (bundle id, EAS, TestFlight,
  guidelines 4.2.6 and 4.3). Use for "make this game its own app", "ship it on TestFlight",
  "new OGS shell app", "create-ogs-game", "AirPlay the TV", or another app in the OGS network.
---

# Ship a phone-and-TV game as its own app (OGS shell)

The plan behind it: many small apps, each a game under its own name, all embedding OGS (profiles,
casting, the TV launcher, push), so together they form a network. Each one must stand on its own
in the App Store. This skill takes an agent from nothing (or an existing web game) to a TestFlight
build. The generated README is the user-facing version; keep the two in step.

**Check, don't recall.** Package names, tiers and Apple rules below were checked on 2026-10-25.
Before telling the user a tier works, a package is published or a build is on TestFlight, probe it
(`npm view`, `xcrun simctl list`, `eas build:list`, the PR) and quote the output.

## 0. Which generator

| Starting point | Command (from `~/src/open-game-system`, until published) |
|---|---|
| A new game | `node packages/create-ogs-game/dist/bin.mjs <dir> --name "<Name>" [--team-id <TEAM>]` (published: `pnpm create ogs-game`) |
| An existing OGS web game | `node packages/create-ogs-app/dist/bin.mjs app --app-id … --game-url https://…/host` (published: `pnpm create ogs-app`) |

Build both first: `pnpm --filter create-ogs-game vendor && pnpm --filter create-ogs-app --filter create-ogs-game build`.
`vendor` packs the OGS packages that are not on npm yet (profile-kit, cast-kit, the shell and their
workspace deps) into `packages/create-ogs-game/vendor/`; the generator copies them into the new
game's `vendor/` and `app/vendor/` with `pnpm.overrides`.

Ask the user (cap at ~3 questions): the game's **name** (unique; never "Pip"; not "My Game"), the
**audience** (kids or grown-ups: it changes the phone UI), and the **Apple Team ID** if they have
one. Default bundle id: `tv.<appid>.app`. It is permanent once on the store: confirm it.

## 1. Generate, test, play locally (≈5 min)

```bash
create-ogs-game kite-count --name "Kite Count"
cd kite-count && git init && pnpm install
pnpm test          # rules, room machine (SimulatedClock, RESUME), views, routes, token check
pnpm test:seam     # wrangler dev + a whole round over real WebSockets (2 phones + TV)
pnpm dev           # http://<lan-ip>:8787/host on a phone; the lobby links the TV page
```

What the game is made of (copy these patterns when writing the real game):
- `src/game/*.ts`: pure rules → `room.ts` (join/start/pick/advance) → `views.ts` (public view for
  every screen, private view per caller; caller ids never leave the server). Test them first (`/tdd`).
- `src/room.machine.ts`: XState states only arm timers. Deadlines live in the state (`endsAt`);
  `RESUME` (a restarted Durable Object) re-enters the phase; screens send `TICK` after a deadline
  because a hibernating DO never wakes on its own. Both are tested.
- `src/room.server.ts`: verifies an OGS game token (`verifyOgsToken`) before a JOIN reaches the
  machine; `OGS_JWKS_URL` is a Worker var.
- `src/client/phone.tsx`: `phoneHost()` tells a browser, the OGS app and **its own app**
  (`OgsShell/<appId>` in the user agent) apart. In an app: `useCastViewUrl(tvUrl)`. Only in its own
  app: a **Show on TV** button (`CastButton` → the shell's native picker).
- `src/client/tv.tsx`: `onOgsPause` silences it when parked, `reportOgsRoom` lets the couch follow,
  `useOgsSession()` hides the join link on an OGS TV.

## 2. Preview deploy (≈15 s)

`pnpm run deploy:preview` (never `pnpm deploy`). It deploys `<appid>-preview`, sets a random
`ACTOR_KIT_SECRET` on the first deploy, writes the URL to `deploys.json` (the app reads it) and
checks `/healthz`. Then `GAME_ORIGIN=<url> pnpm smoke` plays a round against the deploy.
Production is `pnpm run deploy`; ask before deploying anything that isn't a preview.

## 3. The app in the iOS Simulator, TV on the external display (≈10–15 min, mostly xcodebuild)

```bash
cd app && pnpm install && pnpm e2e:ios
```

`app/e2e/sim.sh`: own simulator → `expo prebuild` → Release `xcodebuild` (JS embedded, no Metro)
→ install → `e2e/external-display.sh` turns on I/O › External Displays (stands in for an Apple TV
with Screen Mirroring; needs Accessibility access for the terminal) → Maestro: name → lobby → Show
on TV → `castPickerDevice-airplay` → Start. Screenshots (`xcrun simctl io <udid> screenshot
--display=external`) and `timings.txt` land in `app/e2e/out/`. Look at the TV screenshots before
saying it works. `SKIP_BUILD=1` reruns the walk on the last build.

Gotchas seen: `pod install` dies on a non-UTF-8 locale and `expo prebuild` still exits 0 (the
script exports `LANG` and checks for the workspace); a seam test that sends two JOINs at once makes
the wrong phone host over a real network (wait for each join).

## 4. TV tiers (status 2026-10-25: check before promising)

| Tier | Who renders the TV page | Status |
|---|---|---|
| Apple TV / AirPlay (`cast: { receiver: "ogs", airplay: true }`) | the host's **phone**, in a second WKWebView on the external display | merged (OGS PR #53); simulator-verified |
| Chromecast (OGS receiver `807AD5E9`) | the Chromecast itself | local rendering in progress on OGS `feat/cast-local-render`; there is **no cloud rendering** |
| Browser TV (`ogs-tv.pages.dev` + code) | that browser | works |

All tiers load the OGS TV launcher with `chrome=none&app=<appId>` in an own app; it frames the
couch session's current game (or else the catalogue `tvUrl`) and sends `ogs:start` /
`ogs:suspend` / `ogs:resume`.

**Known gap, found by the Kite Count proof (2026-10-25):** the shell's single-game cast ignores the
page's `SET_VIEW_URL` (`packages/shell/src/single-cast.ts`) and never sends `game.start` /
`game.view` to the couch session, so the launcher has no current game and an uncatalogued app
has no `tvUrl`: the AirPlay display keeps the native idle card ("Pick a game on your phone…")
while the phone says "On Apple TV / AirPlay". A room game needs the shell to forward the declared
view (as `apps/mobile/services/game-cast-route.ts` does in the OGS app) plus a catalogue entry.
Also seen: the TV window stays 720×480 after `screen.pick_mode` picks 1920×1080 (native log,
`xcrun simctl spawn <udid> log show --info --predicate 'category == "airplay"'`). Check whether
both are fixed before promising a TV in an own app.

## 5. TV performance budget (the phone draws the TV)

- One canvas (2D, or one WebGL context), DOM for text; no video backgrounds, no large
  `backdrop-filter`.
- 30 fps floor, 60 goal, on a 3-year-old iPhone with Screen Mirroring on **while** it runs the
  controller page. A Chromecast is weaker.
- No per-frame allocation; compile every shader in the lobby; fixed light count (see
  `/cast-party-game`).
- TV bundle under ~1 MB JS (starter ≈ 340 kB), WebP images, MP3 audio (not AAC).
- Nothing over the focal area; 5% overscan margin; the TV is the table's clock.

## 6. App Store prep (the user does the account steps)

**Apple rules that decide this plan:**
- **4.2.6**: apps made from a template or app-generation service are rejected unless submitted by
  the content's owner. *Never submit for the developer.* Each game is submitted from **its owner's
  own Apple Developer account**. Do not create App Store Connect records, upload builds or
  submit on the user's behalf; give them the steps.
- **4.3** (spam / near-identical apps): every app needs its own name, icon, screenshots and real
  game content. The starter's kites are placeholder gameplay, the drawn icon is a placeholder:
  `pnpm presubmit` (in `app/`) refuses the placeholder art and missing screenshots.
- **4.2** (minimum functionality): `app/REVIEW_NOTES.md` explains the native parts (AirPlay/Cast
  picker, Sign in with Apple, push, haptics, offline screen). Fill every `[bracket]`.

Steps for the owner (put them in your report as a checklist, with exact commands):
1. Apple Developer account; Team ID into `app/app.config.ts` (`appleTeamId`); confirm the bundle id.
2. Own icon, adaptive icon and splash in `app/assets/`; 3+ screenshots (iPhone 6.9": 1320×2868) of
   the game, phone **and** TV in play, in `app/store/screenshots/`.
3. `pnpm run deploy` (production; `eas.json`'s production profile sets `APP_ENV=production`).
4. `npm i -g eas-cli && eas login`; in `app/`: `eas init`, `eas credentials`.
5. App Store Connect → Apps → New App with that bundle id and a unique name.
6. `eas build --profile production --platform ios --auto-submit` → TestFlight; play a whole game
   on a real iPhone + Apple TV (and a Chromecast or browser TV).
7. Review note, Privacy Nutrition Label (OGS profile name/avatar/id, push token; no tracking).
8. `cd app && pnpm presubmit` passes → submit for review.

## 7. Done when

- `pnpm test`, `pnpm test:seam`, `pnpm smoke` (preview) and `app/ pnpm typecheck` pass.
- `app/e2e/out/` has the TV on the external display (lobby, kites/your scene, question) and the
  timings; you looked at them.
- Committed at each milestone. Say which it is: committed / deployed (preview) / verified in the
  Simulator / on a real device (use `/verify-on-device` for the last).

## Related skills

`/cast-party-game` (designing the game itself), `/ogs-game` (catalogue entry, art kit, profiles,
seam tests against the launcher), `/expo-testing` (devices, Maestro), `/tdd`, `/deploy-verify`,
`/ai-art-assets` (the icon and art: Codex first).
