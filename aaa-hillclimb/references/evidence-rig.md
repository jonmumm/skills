# Evidence rig

One command per round. Reference implementation: `~/src/story-nook/scripts/round.sh`,
`scripts/contact-sheet.ts`, `e2e/record-session.ts`, `e2e/phones-shot.ts`, `scripts/evidence.py`,
`scripts/audio-report.py`.

```zsh
#!/bin/zsh
# scripts/round.sh NN — evidence for one critic round (needs the dev server).
set -euo pipefail
cd "${0:A:h}/.."
OUT=critic/rounds/${1:?round}; mkdir -p $OUT
pnpm -s build:client > /dev/null
pnpm exec tsx scripts/contact-sheet.ts > $OUT/contact-sheet.log 2>&1 || true   # checks may fail; shots still count
cp recordings/contact-sheet.png $OUT/tv-contact-sheet.png
STORY_TV_SIZE=1920x1080 STORY_OUT=$OUT/session.mp4 pnpm exec tsx e2e/record-session.ts > $OUT/session.log 2>&1
cp recordings/raw/perf.json recordings/raw/marks.json $OUT/
ffmpeg -v error -y -i $OUT/session.mp4 -vf "fps=1/6,scale=720:-1,tile=4x8" -frames:v 1 $OUT/session-tiles.png
python3 scripts/evidence.py $OUT        # phones sheet, luma per mark, spectrogram
python3 scripts/audio-report.py $OUT    # loudness / low / treble share / harsh transients per section
```

Run it in the background: a full round (contact sheet + a 3-minute session) can take 15–25 min.

## Contact sheet

- A debug hook (`?hook`) that exposes `loadScenario(name)` / `setView(view)` and **acknowledges**
  what it did, so a shot labeled "boss fight" can never silently be the title screen.
- Named views for every hero moment; shots at 1920×1080; a labeled tile sheet.
- Automatic checks printed to the log, one line each: brightness per beat vs target, framing
  (fraction of frame covered by key objects), shader programs at start vs end (must be flat:
  new programs mid-play = hitches on a cast stream), frame-time p95 per scene state.

## Recorded session (the most valuable evidence)

- Playwright contexts for every screen (TV at 1920×1080, phone, tablet), `recordVideo` on each,
  stitched side by side by ffmpeg with labels, aligned by wall-clock start times.
- Real TV audio: tap the game's master bus into a `MediaStreamDestination` + `MediaRecorder`.
  Launch Chrome with `--autoplay-policy=no-user-gesture-required --disable-audio-output`
  (fake output device: the audio clock runs even when the host's audio stack is hung).
- A bot that plays the whole game like a family: presses the real buttons, waits realistic
  times, marks events (`mark("kid picks")`) into `marks.json`, measures press→screen latency
  from the device's own `pointerdown` timestamp.
- Robustness: break on the end screen; `count()` before clicking; short click timeouts; on a
  stall, screenshot and print the stuck page's text.

## Phones

`phones-shot.ts`: every phone/tablet state at CSS scale (390×844, 820×1180), in one strip. Small
images: the critic and you look at these every round.

## Audio report

Per marked section: RMS/LUFS, low share (<250 Hz), treble share (>3 kHz), tonal onsets/min and
harsh broadband transients/min, plus one spectrogram PNG. Name every field by intent.
