# Device matrix

Worked example: `~/src/run-set-jimmy/e2e/devices.ts` (`pnpm devices`, `PLAYERS=7 pnpm devices`).
It plays one real game with bots, pauses at each state through the driver's `onMoment` hook,
resizes every page with `page.setViewportSize`, runs the checks below in the page, saves a
screenshot per device and tiles a contact sheet per state with ffmpeg `xstack`.

## Sizes

| Kind | Sizes (CSS px) |
|---|---|
| Phones, portrait | 280×653 (Galaxy Fold), 360×640, 360×740, 375×667 (iPhone SE), 375×812, 393×852, 412×915, 430×932 |
| Phone, landscape | 852×393 |
| Tablets | 744×1133 (iPad mini), 1180×820 (iPad landscape) |
| TV / desktop | 1280×720, 1920×1080, 3840×2160, 1366×768, 1440×900, 1024×768 |

## Checks (run in the page)

- `document.documentElement.scrollWidth > innerWidth`: the page scrolls sideways.
- Key controls outside the viewport. Only on fixed-height screens (a game's play screen); a
  scrolling screen may put things below the fold.
- Overlap between the screen's main regions (header, status, content, actions, hand…), more
  than 2 px both ways.
- Buttons whose text is clipped (`scrollWidth > clientWidth`).
- Tap targets under 40 px (skip intentionally dense items, and say which).
- Text too small: the computed font size of the smallest important text (card ranks, labels)
  under 10 px.
- TV: every leaf element inside the 5% safe area; nothing in the OGS invite corner (220×120 on a
  960×540 reference, 24 px margin, top-right); regions don't overlap; a region's content isn't
  cut off (`scrollHeight > clientHeight`); names aren't ellipsized at normal player counts.

Name the offending element in the issue (class and parent), or the fix is guesswork.

## What it found on Run Set Jimmy (Oct 2026)

267 issues on the first run, 0 after fixes:
- TV lobby's centred title in the invite corner → left-aligned lobby.
- A badge hanging 6 px below the seat strip → outside the safe area in every game state.
- A log ticker under the scoreboard.
- Seven seats overflowing the strip (flex items keep their min-content width: `min-width: 0`).
- Sort buttons 28 px tall; card ranks at 8 px on the Fold and in mini cards.
- Landscape phones couldn't fit the hand → two-column layout; an open builder pushed its buttons
  out of view → sticky button row and a capped, scrolling actions area.
- By eye only: iPad stretched the phone layout → centred 640 px column with bigger cards.
