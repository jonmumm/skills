# Evidence rig

One command per round. Reference implementation: `~/src/open-game-system/design/`
(`src/harness/*`, `scripts/lib.ts`, `scripts/shoot.ts`, `scripts/flows.ts`, `scripts/sheet.py`,
`scripts/coverage.py`, `scripts/round.sh`). Copy it; don't re-derive it.

```zsh
#!/bin/zsh
# scripts/round.sh NN [concept,…] — evidence for one critic round → critic/rounds/NN/<concept>/
set -euo pipefail
cd "${0:A:h}/.."
OUT=critic/rounds/${1:?round}; mkdir -p $OUT
ARGS=(); [[ -n "${2:-}" ]] && ARGS=(--concept $2)
pnpm -s typecheck || echo "WARN: typecheck failed"
pnpm -s shoot $ARGS --out $OUT      # shots/, sheet-<device>.png, checks.json, coverage.md
pnpm -s flows $ARGS --out $OUT      # flows/<flow>.mp4 + marks.json
```

Run it in the background; a round with several concepts takes 5–15 minutes.

## The prototype harness

- **Concepts as folders**: `src/concepts/<id>/index.tsx` exports `defineConcept<S>({ id, name,
  brief, scenarios, flows, Surface })`. `S` is the concept's own session state; `Surface({device,
  store, shot})` renders one device from it. A closure erases `S` for the registry, so no casts.
- **A virtual module** (`virtual:ogs-concepts`) imports every concept, or only those in the
  `OGS_CONCEPTS` env var, so a shoot of one concept can't be broken by another agent's
  half-finished folder.
- **Scenario switcher**: `?concept&scenario&device=phone|ipad|tv|stage[&shot=1][&flow]`. The app
  writes `data-scenario-ack="<concept>/<scenario>/<device>"` on `<html>` only after rendering
  exactly that (or `data-scenario-error`); the shooter fails on a mismatch.
- **Shot mode** (`shot=1`): a global style sets every animation/transition duration to 0, so
  frozen frames are end states (entrance animations need `fill-mode: both`).
- **Stage** (`device=stage`): every device side by side at fixed scales, sharing **one store**,
  so a tap on the phone visibly changes the TV and tablet. A caption line under the TV shows the
  current mark (`window.__ogsMark`); taps draw a ripple so they're visible in video.
- **Registry on window** (`window.__ogsRegistry`) so scripts read scenario ids, devices and flows
  from the app itself, never from a duplicated list.

## Shooter + automatic checks (`shoot.ts`)

- Builds a private snapshot (`vite build --outDir .cache/dist-<pid>`) and serves it on a random
  port: parallel agents editing the source can't change the app mid-shoot.
- One Playwright context per device at true CSS size (phone 390×844 @2x, tablet 820×1180 @2x, TV
  1920×1080 @1x); `hasTouch` on touch devices.
- Shim `window.__name` with an init script: tsx/esbuild's keepNames wraps functions passed to
  `page.evaluate` in `__name()`, which doesn't exist in the page.
- Waits for ack, `document.fonts.ready`, image decode, 250 ms; JPEG shot per scenario × device.
- Checks (in-page probe + PNG sampling), written to `checks.json` with a summary:
  - `targetsUnder44`: `button, a[href], input, select, [role=button], [data-bot]` under 44 pt
    (not on the TV: nobody touches it);
  - `contrastFails`: WCAG ratio of the computed text colour against the **median of a pixel ring
    just outside the text box** in the screenshot (works over imagery, unlike CSS backgrounds);
    4.5, or 3.0 for ≥ 24 px / ≥ 18.66 px bold;
  - `kidWords`: visible text with letters on the kid surface outside `[data-grownup]` (want 0);
  - `tvSmallText`: TV text under 24 px (3 m readability);
  - `clippedText`: text clipped by overflow or outside the device bounds;
  - `tapsPerFlow`: taps per flow counted from the flow scripts (each step is a real tap).
- `sheet.py`: a labelled tile sheet per device, each tile flagged with its failing checks.
- `coverage.py`: flows × state kinds, each cell listing scenario ids + devices, or MISSING.

## Flow bot (`flows.ts`)

- Opens the stage at the flow's start scenario with `recordVideo`, captions each beat, taps
  `[data-device=<d>] [data-bot=<name>]`, waits so transitions are visible, converts to H.264 MP4.
- A missing `data-bot` writes a `STUCK` mark (visible in the video) and ends the flow instead of
  hanging; errors are captioned too. `marks.json` holds per-flow marks with seconds and taps.
