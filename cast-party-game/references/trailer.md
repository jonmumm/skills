# Trailer: a shareable video for the family

Rocket Crew's working pipeline lives in `rocket-crew/scripts/trailer/` (README there has the
exact commands). It makes ~75s: title cards, real gameplay with phone/iPad picture-in-picture,
one continuous soundtrack and a voiceover. Copy it for a new game.

## What made it good (and what went wrong first)

- **Record for the edit.** The recorder takes `ROCKET_TV_SIZE=1920x1080` (full-HD TV) and
  writes `raw/marks.json` with a timestamp for each story beat (launch, mistake, hint, mayday,
  comet shower, landing, sticker). Cuts come from marks, not from scrubbing video. Seed a
  **veteran crew** (`ROCKET_START_MISSIONS=4`) so the panel is full and the ending has a
  promotion and an unlock.
- **One continuous soundtrack, not per-clip audio.** v1 used each clip's own TV audio with
  fades, and the family's first note was "the audio starts and stops a lot". v2 renders the
  whole soundtrack in one take in a browser with the game's own engine (`music.ts` + `sfx`):
  - the mood changes per section (lobby → launch → problem → mayday → success → landing → done);
  - each effect fires at its shot, mapped from `marks.json` (countdown, liftoff 2.6s later,
    alarm, boing, hint, cheer + star pops, siren, comet, rumble, land).
- **Voiceover** via Google Cloud Text-to-Speech, `en-US-Chirp3-HD-Charon` (a warm trailer
  voice), on the `opengame-stream` project (well under a cent). macOS `say` has no good voices
  by default.
  - Card lengths follow their line.
  - Music is ducked under the voice with `sidechaincompress`, then `loudnorm` to -16 LUFS for phones.
- **Cards** are HTML screenshotted at 2× in the game's fonts (Bungee / Fredoka) with its
  hand-drawn icons, over a heavily blurred nebula frame, and given a slow `zoompan` push-in.
  Change cards through a query param, not `#hash` (a hash change doesn't reload the page, so
  every card came out the same).
- **Get names right.** Ask how the child's name is spelled (the first cut had a typo). It appears
  on cards, the PiP label and the voiceover.
- **Check before sharing**:
  - a tile sheet of frames;
  - `silencedetect` for gaps;
  - that no clip ends on an unintended scene (the game returning to the lobby flashed in);
  - that every sound effect lands inside its own clip (an alarm fired over the wrong card).
- Deliver two files: full 1080p, and a ~12 MB 720p copy for texting.
