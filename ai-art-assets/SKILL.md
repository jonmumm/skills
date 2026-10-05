---
name: ai-art-assets
description: >
  Generate game and storybook art with Codex image generation (ChatGPT plan, no per-image cost) or
  fal.ai (images, character sheets, poses, parallax layers, background removal) and 3D models with Meshy, at build time or through a server, with keys kept
  out of the client. Includes putting a real child into a story from family photos (hero sheet,
  consistent likeness, privacy). Use when a game needs illustrations, characters, props, world
  backgrounds, a kid's likeness, or a 3D model from an image ("use fal", "make art with AI",
  "put my son in the story", "turn this into a 3D model", "Meshy", "use codex for art").
---

# AI art assets (Codex, fal.ai, Meshy)

Generated art is only as good as its **art direction** and its **review**. Decide the style once,
generate in kits, look at every image, and keep what's consistent. **Every call costs real money
from a wallet that every game and agent shares**, so read "Cost discipline" before any run.

## Cost discipline (from the Sep 28–29 sessions that drained fal and Meshy)

In about 36 hours, four games used up fal twice, Meshy (1,100 → 5 credits) and a third of the
ElevenLabs month. Most of that spend was avoidable:

| What happened | Waste | Rule |
|---|---|---|
| Bake Shop: 324 premium edits (`gpt-image-2.5/sunburst`, `quality: high`), about 190 of them recolours of the same 7 treats (6 frostings × plain/sprinkled × 2 sponges, 4 bare flavours) | ~60% of the images | **Generate parts, compose in code.** One base per object, plus a frosting mask/layer, plus one sprinkles overlay; tint in the shader or on a canvas. Never generate a cartesian product. |
| Every icon at `quality: high`, 1024², shown at ≤256 px on a phone | 3–10× per image | **Match cost to display size.** Icons and props: low/medium quality or a cheap model (nano-banana-2, seedream). High/pro only for hero art and TV plates. |
| Peekaboo: 1 test model, then 36 textured Meshy models in one bulk run; 4 rejected at review, turtle made 3 times | ~all of Meshy | **Preview, contact sheet, then refine only what you approved** (`meshy.mjs preview` / `refine`). |
| Story Nook: bulk run started 2 minutes after a calibration that still looked wrong; 49 `--force` regenerations while iterating prompts | ~30% of 322 calls | **Calibration is a gate, not a step.** Iterate prompts on one asset at 1K; the bulk run needs the owner's or critic's approval of the calibration sheet. |
| Juneau: calibration at 2K (5–6 MB PNGs) | 2× | **Explore cheap**: 1K, cheapest good model. Re-render finals at full size once. |
| Model bake-offs (the same prompt on 3–4 models), repeated per game | 3–4× per prompt | Record the winner per job in this skill ("Current picks"), and reuse it. Only one bake-off per style. |
| Four overnight games shared one balance with no caps; each hit "Exhausted balance" mid-run and retried | stalls, half-finished kits | **Caps per project** (`.asset-budget.json`) enforced by the scripts, and one exhausted answer stops every agent. |
| Hill-climb rounds regenerated art as a fix, with no limit per round | open-ended | A round's asset budget is part of the round plan (`aaa-hillclimb`). |

**Before any generation run:**
1. `node $S/spend.mjs budget`: the caps and what's spent. No `.asset-budget.json` means the
   defaults ($5 fal, 30 Codex images/24h, 100 Meshy credits, 10k ElevenLabs credits). Ask the owner to set real caps at
   kickoff, and never raise a cap yourself.
2. Count first. Every kit script needs `--dry` that prints the count and the estimated cost.
   More than ~40 images or ~$10 → show the owner the count, the cost and a contact sheet of the
   calibration, and wait.
3. Ask: can code make this? A recolour, a flip, a tint, a layer on top, a crop, a pose from an
   existing pose with a transform: all free. Generate only what code can't make.
4. Run serially, or at most 4 at a time. Stop the batch on the first 403/402. Don't retry.

**Voice lines: Gemini TTS (`gemini-tts.mjs`).** Billed per second of audio, not per character, so
a whole game's voice costs dollars, not an ElevenLabs month (Number Quest: 1,239 lines ≈ $1.50 on
`gemini-3.8-flash-tts`, #4 on the Artificial Analysis TTS arena, Oct 2026). Cap: `gemini_usd`
(default $2). `node $S/gemini-tts.mjs batch --lines lines.json --out-dir public/voice --voice
Sulafat [--style "…"] --dry` first; existing clips are skipped, so re-runs only pay for new lines.
**Never put the style in the text**: 3.8 TTS reads `text` verbatim, so "Say warmly: …" gets
spoken (that mistake made 9-second clips of "Two"). Style goes in a `speech_metadata` annotation on
the `v1beta/interactions` endpoint, which the script does. Calibrate on ~20 lines and check
durations (chars/sec) before the full batch. Open-weight alternatives that run on the Mac for free:
Kokoro-82M (Apache-2.0, flatter, arena ~1064). The top open model, Breeze TTS 2, needs a CUDA GPU
and is non-commercial.

**Codex first for images.** `codex.mjs` uses Codex's built-in image generation (gpt-image) on the
owner's ChatGPT plan: no per-image cost, but ~1 min per image and the plan has usage limits shared
by every game. Its cap is `codex_images` per project over the last 24h (default 30). A "usage
limit" answer blocks codex for 30 min like an exhausted wallet. Don't fall back to fal on your own
then; ask. Use fal when you need a model Codex doesn't have (nano-banana, seedream), exact sizes,
cheap cutouts of existing art, or a big batch that would blow the plan limit.

**Budget guard (built into the scripts).** `fal.mjs`, `codex.mjs`, `meshy.mjs` and `elevenlabs.mjs` check each
call against the project's cap before sending it (`exit 3` when over), log it to
`assets/SPEND.jsonl` and the machine-wide ledger (`spend.mjs report`), and write an "exhausted"
marker on a 402/403 that blocks every later run for 30 min, or until `spend.mjs clear <service>`
after a top-up. **Project kit scripts must go through these scripts** (shell out to `fal.mjs`, as
Bake Shop does) **or import `guard`/`record` from `spend.mjs`.** A kit script that calls fal
directly (Story Nook's `generate.mjs`) is invisible to the caps.

```json
// .asset-budget.json at the project root. The owner sets it.
{ "fal_usd": 15, "codex_images": 30, "meshy_credits": 0, "elevenlabs_credits": 8000 }
```

**Current picks (Sep 2026; check prices with the fal pricing API before changing):**
- Hero art, character sheets, TV plates, transparent props: `codex.mjs` first (free on the plan;
  real alpha when the prompt asks for a transparent background; returns ~1254², so resize in code).
  Pass the sheet with `--image` for consistent characters.
- Exploration, icons, props, recolours that must be generated: `fal-ai/nano-banana-2` ($0.08) or
  seedream v5 ($0.07), at 1K.
- Hero art, character sheets, TV plates: `fal-ai/nano-banana-pro` ($0.15, 2K) or gpt-image
  `quality: high`. 4K costs twice as much. Upscale instead.
- Cutouts: `fal-ai/birefnet/v2` (≈$0.01).
- gpt-image `quality: high` is token-billed and several times the price of `low`/`medium`. Use
  `high` only when a critic showed that `medium` fails.

## Keys (always)

- `FAL_KEY` and `MESHY_API_KEY` live in the shell environment (or Worker secrets:
  `wrangler secret put FAL_KEY`).
- Never print them, write them to files, commit them, put them in a client bundle (no Vite `define`,
  no `VITE_` prefix), log them or ask for them in chat. If one is missing, say so and stop that step.
- The browser never calls fal or Meshy directly. Runtime generation goes through the Worker.

## Scripts

All the scripts save files into the project, refuse to overwrite without `--force` (every run
costs credits), append to a `CREDITS.json`, enforce the project's budget and log spend (see
"Cost discipline"). Every paid command takes `--dry`.

```bash
S=~/src/skills/ai-art-assets/scripts
node $S/spend.mjs budget                    # caps, spent, exhausted services (this project)
node $S/spend.mjs report --days 7           # every project, from the machine-wide ledger
node $S/codex.mjs run --prompt "..." --out assets/art/moon.png --dry        # today's count vs cap
node $S/codex.mjs run --prompt "... transparent background" --out assets/art/moon.png
node $S/codex.mjs run --prompt "pose: waving" --image refs/sheet.png --out assets/art/hero-wave.png
node $S/fal.mjs check
node $S/fal.mjs run <model-id> --prompt "..." --out x.png --dry           # estimate only
node $S/fal.mjs run <model-id> --prompt "..." --out assets/art/sea/sky.png
node $S/fal.mjs run <model-id> --prompt "..." --image refs/sheet.png --image refs/pip.png --out assets/art/pages/p1.png
node $S/fal.mjs run <model-id> --json input.json --out assets/art/x.png   # "@file:path" strings become data URIs
node $S/meshy.mjs preview --prompt "..." --out assets-src/meshy/frog.glb    # ≈20 credits, untextured + thumbnail
node $S/meshy.mjs refine --out assets-src/meshy/frog.glb                     # ≈10 more, only after review
node $S/meshy.mjs image-to-3d --image assets/art/pip-front.png --out assets/models/pip.glb --lowpoly
```

**Model ids change monthly.** Before a run, look up the current best model for the job on
https://fal.ai/explore and read its API tab for the exact input fields (`image_url` vs
`image_urls`, size and aspect options, seed). Record the choice in the project's docs. Kinds to
look for:
- **text-to-image** for world layers and props
- **image editing / multi-reference** for characters in scenes (includes Google's Gemini image
  models, which Little Hero Adventures used)
- **background removal** for cutouts
- **upscalers** for TV-size output

## Workflow

1. **Style bible first** (`docs/art-style.md`): the medium (e.g. gouache picture book, soft
   grain), palette, line weight, lighting, what's never in frame (text, logos). Also the
   prompt prefix that encodes it. Every prompt starts with that prefix.
2. **Calibrate on 4 images** at 1K with the cheap model: generate, put them side by side and fix
   the prefix until they look like one book. **Stop here:** show the calibration sheet with the
   `--dry` count and cost of the bulk run, and wait for approval (or a fresh critic's pass when the
   owner said to run unattended within a cap).
3. **Kits, not one-offs, and parts, not permutations.** List the kit, then cross out everything
   code can derive: colour variants (tint), states (overlays), mirrored poses, crops.
   - **Worlds:** a separate image per parallax layer (sky, far, mid, foreground props), same prefix
     and seed family, wide aspect for the TV.
   - **Characters:** a character sheet (turnaround plus 4 or 5 expressions) on a plain background.
   - **Poses:** full-body images from the sheet, then background removal.
4. **Consistency test before building on it:** put each character in 6 different scenes, using the
   sheet as reference. If they drift (face, hair, colors, proportions), try another model or more
   references before continuing. Keep the winning settings in the docs.
5. **Review every image** at the size it will be shown, with a fresh critic if the game uses the
   `procedural-3d-web-game` critic loop. Reject:
   - extra fingers or limbs
   - text-like squiggles
   - off-style lighting
   - scary faces
   - anything a 3-year-old might find creepy
6. **Continuity chain for sequences** (story pages): pass the character sheet plus the previous page
   image as references, and say what changed. This is Little Hero Adventures' trick: the photo for
   page 1, then the previous image for continuity. The sheet makes it much sturdier.

## Art kit pipeline (proven in Story Nook: 140 assets)

The reference implementation is `~/src/story-nook/scripts/art/`. Copy it until it becomes a
shared kit.
- **`kit.json` manifest:** every asset (character sheets, poses, place layers such as
  sky/hills/ground/landmark, props, icons), each with its prompt. The style prefix is added to
  every prompt automatically.
- **`generate.mjs`:**
  - text-to-image for sheets and layers;
  - the model's **edit** endpoint for poses, with the character sheet as reference;
  - background removal (birefnet) for cutouts;
  - a `calibrate` mode (4 images to judge the style);
  - `--dry` (count and estimated cost, nothing sent);
  - never regenerates without `--force`;
  - logs to CREDITS.json;
  - **goes through the budget guard**: import `guard`/`record` from
    `~/src/skills/ai-art-assets/scripts/spend.mjs`, or shell out to `fal.mjs`. Story Nook's
    original calls fal directly, so fix that when you copy it.
- **`optimize.py`:** trims to the alpha bounds, resizes by kind, converts to WebP and writes
  `manifest.json` with a **bottom-centre anchor** for each piece, so cutouts stand on the ground.
  Raw art stays out of git and out of the deploy.
- **What it cost:** 322 fal calls for 140 shipped assets (nano-banana-pro at $0.15, plus
  birefnet cutouts). 49 of those were `--force` regenerations while prompts were being fixed on
  the whole kit. Fix prompts on one asset, then run the kit once.

**Calibration lessons (Juneau's Adventures, Story Nook)**
- A style-reference *edit* copies the reference's composition, not just its style. Use the text
  prefix for style and references only for identity.
- Character shots tend to come back with a painted frame or border. Say "full bleed, no border"
  and reject framed ones.
- Characters drift off-model across scenes. Always pass the sheet, and re-reference the exact pose
  (e.g. an upright idle) for expression variants.
- Keep a "Never" list in the style bible (no text, no brand look-alikes, nothing a 3-year-old finds
  creepy). The critic checks it.

## A real child in the story

Kids love seeing themselves. Do it carefully:

- **Photos come from a parent**, in the grown-up UI only. Store them in a private bucket (R2, not
  public). Never put them in git, logs, CREDITS files (the script scrubs data URIs), analytics or
  public share links.
- **Make a hero sheet once** from 2 or 3 photos, in the book's style. A parent approves or
  regenerates it. After that, **use the sheet as the reference, not the photos**. It's more
  consistent, and the photos are only sent once.
- **Poses from the sheet** (stand, hop, sit, dig, wave, sleep) with backgrounds removed, so the TV
  can animate him for actions without generating new images.
- **Check the provider's data terms** (no training on inputs, retention) before sending a child's
  photo. Tell the parent which service it goes to.
- **Keep it storybook-stylized**, not photoreal. It's friendlier, and it can't be mistaken for a
  real photo.

## Runtime generation (per story)

- Only from the Worker, which holds the key. Cache results in private storage keyed by story and
  page.
- Generate ahead: start the next page's image while the current page is being read, so there's no
  waiting.
- Always have a fallback: the world's own background plus the hero pose cutout, if generation is
  slow or fails. The story never blocks on an image.
- Budget: count images per story (e.g. 3) and log each run's cost. Runtime generation scales with
  plays, not with builds: cap it per family per day in the Worker, cache forever, and give the
  Worker its own fal key with a spend limit set in the fal dashboard.

## Meshy (3D)

- **Preview first.** `meshy.mjs preview` for every model (untextured, with a thumbnail), one
  contact sheet, reject or re-prompt, then `meshy.mjs refine` only the approved ones. A bulk
  textured run after one sample is how Peekaboo spent 1,100 credits and left Bake Shop with none.
- **One base, many variants in code.** Peekaboo's white-bodied critters tinted in the shader were
  right. Do the same for colours, sizes and accessories.
- Try `meshy-6-lite` (≈5 credits a preview) for small props.

- **Good for:** props, toys, a companion character from a clean front image (plain background,
  full body, neutral pose). Use `--lowpoly` for web games.
- **Check:** triangle count, texture size, scale and pivot. Load the model in the game's scene,
  then screenshot it at game distance before keeping it.
- **Rigging and animation** endpoints exist (see docs.meshy.ai). Test on one character before
  planning around them. Stylized toddlers and animals often rig badly.
- **2.5D first:** for storybook games, illustrated parallax layers plus animated cutouts usually
  look better than generated 3D. Reach for Meshy when the camera really needs to move around
  things.

## Honest limits

- Hands, text and exact likeness are the usual failures. Frame shots to avoid close-up hands, and
  never ask for text in images.
- Likeness is approximate. The parent is the judge of "that's him".
- Generation takes seconds to minutes. Design the experience so nobody watches it happen.
