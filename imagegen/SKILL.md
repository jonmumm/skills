---
name: imagegen
description: >
  Generate images for games and apps: picture-book pages, character sheets and poses, parallax
  layers, tileable textures, sky plates / equirectangular maps, paint-overs of 3D renders, concept
  art and UI mockups, app icons, OGS art kits, key art, logos, transparent props, and runtime story
  illustrations (including a real child's likeness), plus 3D models from images (Meshy) and voice
  lines (Gemini TTS). Picks the tool per job: the local model on this Mac (Qwen-Image 2.1 Turbo via
  ComfyUI, free, non-commercial), Codex (ChatGPT plan), Grok Imagine and Muse (their CLIs, on
  plan), Gemini image API and fal.ai (paid). Use for "make art", "generate an image/texture/icon/
  sprite/skybox", "use the local model", "use grok/muse/codex/gemini/fal for images", "concept art",
  "paint over this render", "put my son in the story", "turn this into a 3D model", "Meshy".
---

# imagegen

Generated art is only as good as its **art direction** and its **review**. Decide the style once,
generate in kits, look at every image at display size, keep what's consistent. Generation is the
cheap part; the expensive mistakes are permutations, bulk runs before calibration, and assets
that ship under a license that doesn't allow it.

```bash
S=~/src/skills/imagegen/scripts
```

## Pick the tool

Free tools first, local first among them, and **stop and ask before any paid wallet**.

| Tool | Cost | Good at | Limits | Script |
|---|---|---|---|---|
| **Local: Qwen-Image 2.1 Turbo** (ComfyUI on the M5 Max) | $0, no quota | Exploration, calibration, bulk variants, textures, transparent props (real alpha), edits with up to 10 references, text in images | **Non-commercial license** (below). ~45 s/image at 1K warm, ~2–3 min for edits; first run loads ~17 GB | `local.mjs` |
| **Codex** (gpt-image, ChatGPT plan) | $0, plan quota | Hero art, character sheets, logos with spelled titles, icons, transparent PNGs, the most-used tool (≈25 repos) | ~1 min/image; quota runs out (blocked Nov 15→18); size is a request (1254², 1734×907, 1024×1536) | `codex.mjs` |
| **Grok Imagine** (`grok -p`, plan) | $0, plan quota | Edits and repaints (`image_edit`), aspect ratios 1:1 16:9 9:16 3:2 2:3, checks its own tiling | JPEG, ≤~1.4K, no alpha (paint on magenta and key it), references downscaled to ~768 px, can stall >10 min sampling pixels | `kit.mjs` |
| **Muse** (`muse exec`, Meta, plan) | $0, small quota | Tileable textures, sky plates, foam/detail maps | Quota is tiny (3 textures, then `429 Subscription quota exhausted`); ~1920×1280 JPEG whatever you ask; the T3 Muse provider has **no** image tool | `kit.mjs` |
| **Gemini image API** (`GEMINI_API_KEY`) | $0.039 (2.5-flash) – $0.067 (3.1-flash) – $0.134 (3-pro) | Runtime story pages, likeness, true local edits ("make the dragon purple" changes only the dragon); 3.1-flash ~8 s, flash-lite ~4 s | Paid; key must stay server-side | project code |
| **fal.ai** (`FAL_KEY`) | per image | Models the others lack: nano-banana-2/pro, seedream, `fal-ai/z-image/turbo` (~$0.003, runtime), birefnet cutouts (~$0.01), upscalers | Paid wallet shared by every game | `fal.mjs` |

- **"Muse"** means Meta's Muse Code CLI (`muse exec`, models `muse-wonder-1.0`), not Meshy and not
  Microsoft Muse.
- **Free tools run out.** When one answers with a usage limit, move to the next free one
  (`kit.mjs` does it automatically). When every free tool is out, **stop and ask**. Never switch to
  fal, Gemini or Meshy on your own.
- **Runtime generation** (images made while the app runs, per story or per player) is always a
  paid API from a server: Gemini or fal. The local model and the plan CLIs are build-time only.

### Licensing: what the local model may be used for

Qwen-Image 2.1 is under the **Qwen Research License: non-commercial ("research or evaluation")
only**, and that covers its outputs. So:

- **Use it freely for** exploration, style calibration, concept and look boards, critic/judge
  references, hill-climb targets, prototypes, placeholder art, and test fixtures.
- **Don't ship its output** in anything sold or monetized (an App Store app, a paid OGS game,
  marketing for one). Re-render the approved look with Codex/Grok/Muse, or with a commercially
  licensed local model (see "Local models"), before shipping.
- Every `local.mjs` image has `license` in its CREDITS row, and a kit with `"license":
  "commercial"` never routes to it. Before a release, grep CREDITS for `Qwen Research`.
- Check the terms of Codex/Grok/Muse outputs yourself before a commercial launch; don't assume.

## Use cases (what to use, what we learned)

| Use case | First tool | Recipe and lessons |
|---|---|---|
| **Look exploration / concept art** ("5 looks", "8 aesthetics") | local, then Codex/Grok/Muse | One subject in many styles on one sheet. Three tools × three games gave usefully different styles. The winning concept becomes the hill-climb *target* (Boatload G2) |
| **Style calibration** for a kit | local | 4 images at 1K, adjust the prefix until they look like one book. Free and fast to iterate here, then render finals with a ship-licensed tool |
| **Picture-book pages / world backdrops** (gouache, cut-paper, risograph) | Codex; local for drafts | Style prefix on every prompt. "Full bleed, no border" (characters come back framed). Continuity chain below |
| **Parallax layers** | Codex / local | Separate image per layer (sky, far, mid, foreground props), same prefix and seed family, wide aspect for the TV |
| **Character sheets, poses, expressions** | Codex; local edit for variants | Turnaround + 4–5 expressions on a plain background; poses as edits with the sheet as reference; then cut out |
| **Transparent props, logos, emblems** | local `--rgba` / Codex | Local: the model card phrasing (`--rgba` adds it); PNG keeps alpha. Codex: "transparent background" gives real alpha. Grok: paint on flat magenta and key it in Pillow |
| **Tileable textures** (cloth, wood, stone, sand, foam, felt) | local / Muse / Grok | Prompt: "seamless tileable texture, flat top-down orthographic, even lighting, no shadows or vignette, no text". **Models say seamless but rarely wrap**: always `tileable.py --check`, fix with `tileable.py in out --preview p.png`, look at the 2×2. Crop Muse's 3:2 output. Derive normal/roughness in code. Pack to KTX2 (Boatload: 19 layers = 28 MB GPU) |
| **Sky plates / skyboxes / equirectangular maps** | Muse / Codex / local | "flat equirectangular texture map, 2:1". Fix horizon, wrap and sun bearing in code. Bold cloud masses (plates that fill 25% of the frame barely register). A reference image can import its mood (a mauve bank read as dusk) |
| **Paint-overs of 3D renders** (texture projection) | Grok `image_edit`, Codex | Render orthographic views of the *current* sculpt, repaint pixel-aligned, register back (warp/homography + optical flow), project to one atlas. Edit models turn the figure, move props and zoom out on close-ups: check with registration overlays. Mirror symmetric views. Key the background magenta |
| **Texture / prop sheets** (3×3 swatches, 4×2 props) | Codex / local | One image with wide black gutters, crop in code: cheaper and more consistent than one call each |
| **Gameplay / UI mockups** (TV, iPad, phone) | Codex / local | Say "a gameplay screenshot, not key art, not a poster". A reference's content leaks into every frame |
| **App icons** | Codex | "Square iOS app icon, full-bleed 1024x1024, no text, no rounded-corner mask, reads at 40 px"; check at 60 px. Generated lettering drops letters: wordmarks are a font plus a generated texture |
| **OGS art kit** (icon 1:1, cover 2:3, transparent logo, heroClean 16:9) | Codex | Spec in `ogs-game` §7; check on the kit sheet |
| **Key art at device sizes** | Codex / Grok | Make the iPad frame first, other sizes as edits of it |
| **Trailer / marketing backdrops** | Codex | No people, no TV in frame; device mockups drawn on top in code |
| **Runtime story pages, a child's likeness** | Gemini 3.1 flash image (server) | Hero portrait once from photos, then each page with portrait + previous page as references. See "A real child in the story" |
| **Image → 3D** | Meshy | Clean front image first (local/Codex), then `meshy.mjs` preview → review → refine |
| **Critic / judge panels** | Grok, Muse, Codex, Claude mixed | Muse is a calibrated judge (good 5.9 vs bad 3.5). Tell judges "do not crop, sample pixels or run code" (Grok stalls) |

## Scripts

All scripts save into the project, refuse to overwrite without `--force`, log to
`assets/art/CREDITS.json`, and take `--dry`. Tests: `node --test $S/`.

```bash
# Local model (free; non-commercial). Starts ComfyUI itself if it's down.
node $S/local.mjs run --prompt "..." --out assets/art/x.png [--w 1344 --h 768] [--seed 7]
node $S/local.mjs run --prompt "a toy rocket, soft studio light" --rgba --out assets/art/rocket.png
node $S/local.mjs run --prompt "replace her jacket with the one in image 2" --image a.png --image b.png --out e.png
node $S/local.mjs status | serve | stop          # stop frees ~20 GB of unified memory

# A whole kit across the free tools with automatic fallback (local → codex → grok → muse)
node $S/kit.mjs kit.json --dry                  # count and routing, nothing generated
node $S/kit.mjs kit.json [--only a,b]

# Textures
python3 -I $S/tileable.py --check tex.png       # exit 1 if the wrap seam shows
python3 -I $S/tileable.py tex.png tex-tiled.png --preview tex-2x2.png

# Codex single image (plan quota)
node $S/codex.mjs run --prompt "... transparent background" --out assets/art/moon.png [--image ref.png]

# Paid (ask first; caps enforced)
node $S/spend.mjs budget
node $S/fal.mjs run <model-id> --prompt "..." --out x.png --dry
node $S/meshy.mjs preview --prompt "..." --out assets-src/meshy/frog.glb
node $S/gemini-tts.mjs batch --lines lines.json --out-dir public/voice --voice Sulafat --dry
```

**kit.json**:

```json
{
  "outDir": "assets/gen",
  "prefix": "Gouache picture book, soft paper grain, warm palette, no text.",
  "tool": "local",
  "license": "commercial",
  "jobs": [
    { "name": "sky", "tool": "muse", "prompt": "flat equirectangular sky texture map, 2:1" },
    { "name": "rocket", "prompt": "a toy rocket", "rgba": true },
    { "name": "hero-wave", "tool": "codex", "prompt": "waving", "refs": ["refs/sheet.png"] }
  ]
}
```

`license: "commercial"` keeps every job off the local model. Leave it out while exploring.
Concurrency: local 1, codex 1, grok/muse `GEN_PARALLEL` (3). Grok and Muse JPEGs are converted
to PNG. Each tool is called with a fresh temp workspace and references copied in (`--add-dir`
doesn't work for Grok; Muse's workspace must be fresh).

## Local models

**Installed:** `~/src/ComfyUI` (v0.45, `.venv`, PyTorch MPS) with Qwen-Image 2.1 Turbo int8 weights
(`diffusion_models/qwen_image_2.1_turbo_int8_convrot`, `text_encoders/qwen3vl_8b_int8_convrot`,
`vae/qwen_image_2.1_vae_bf16`; 17.3 GB, from `Comfy-Org/Qwen-Image-2.1`). `local.mjs` mirrors the
official turbo template: 8 steps, euler, cfg 1, the distilled sigma schedule. Don't change steps
without the schedule.

- **Speed (M5 Max, 128 GB):** ~3.5 s/step, ~45 s for 1024² warm, ~50 s for 1344×768, ~95–190 s for an
  edit; the first call after a start also loads the models (~55 s). The video's 16 s is a 4080.
- **Native 2K:** 2048² works (4 MP); prefer multiples of 32. Explore at 1K.
- **Transparency:** `--rgba` wraps the prompt: "This is an RGBA format image with transparency. …
  The image has an alpha channel and a transparent background." Edits of a transparent input keep
  alpha (the RGB under transparent pixels can be any colour; composite to check).
  Scene words break it: "cinematic, soft rim light" gave an opaque dark backdrop. Say "a single
  isolated game item … nothing else, no floor, no backdrop" and leave lighting out.
- **Edits:** the output keeps the first reference's aspect at ~1 MP (1672×941 → 1360×768) unless
  `--w/--h` are given. ~120–190 s for a busy 16:9 scene. Removing a HUD while repainting works in
  one pass ("remove every interface element (the badges, top bar, title text)").
- **Style references:** an edit *edits* the reference. "A rowboat in this lantern's style" painted
  the boat inside the lantern. Start the prompt "Image 1 is only a style reference: do not draw the
  lantern. Draw a new, separate object…".
- **Tried Nov 17 on real games (all usable as exploration):** Boatload screenshot → gouache key art
  with the HUD removed; a new Midnight Museum suspect (heron) dropped into the look-reference with
  the cast kept; Library-style rowboat and Museum moonstone with real alpha; a deck-plank texture
  (seam 3.23 → 1.16 after `tileable.py`); a Warship Duel icon concept (flat, fine for direction,
  generic for a final).
- **Not installed:** the prompt enhancer (`qwen3.5_9b_…_pe_t2i`, +9.5 GB); bf16 weights (+31 GB,
  maybe faster on MPS, untested); disk was 97% full on Nov 16.
- **Commercially licensed local options (not installed):** `Tongyi-MAI/Z-Image-Turbo` and
  `Qwen/Qwen-Image` (v1) are Apache-2.0. Add one before relying on local output for shipped art.
- **Draw Things** is installed but only has an SD1.x checkpoint; mflux isn't installed.
- **ComfyUI UI:** http://127.0.0.1:8188, drag in Comfy-Org's
  `templates/image_qwen_image_2_1_turbo_t2i.json` (and `_turbo_image_edit`, `_background_removal`).

## Cost discipline (from the Sep 28–29 sessions that drained fal and Meshy)

In about 36 hours, four games used up fal twice, Meshy (1,100 → 5 credits) and a third of the
ElevenLabs month. Most of that spend was avoidable, and the rules apply to plan quotas too:

| What happened | Waste | Rule |
|---|---|---|
| Bake Shop: 324 premium edits, about 190 of them recolours of the same 7 treats | ~60% | **Generate parts, compose in code.** One base per object plus mask/overlay layers; tint in the shader or on a canvas. Never a cartesian product |
| Every icon at `quality: high`, 1024², shown at ≤256 px | 3–10× | **Match cost to display size.** High/pro only for hero art and TV plates |
| Peekaboo: 36 textured Meshy models after 1 test | ~all of Meshy | **Preview, contact sheet, then refine only what you approved** |
| Story Nook: bulk run 2 minutes after a calibration that still looked wrong; 49 `--force` regenerations | ~30% | **Calibration is a gate, not a step.** Iterate on one asset (locally, free), get approval, then run the kit once |
| Juneau: calibration at 2K | 2× | **Explore cheap**: 1K, local or cheapest model. Re-render finals once |
| Model bake-offs repeated per game | 3–4× | Record the winner per job in "Pick the tool" above; one bake-off per style |
| Four overnight games shared one balance with no caps | stalls | **Caps per project** (`.asset-budget.json`) enforced by the scripts |
| Codex quota spent on exploration, then blocked for 3 days | lost days | **Explore locally**, spend plan quota on finals |

**Before any paid run:**
1. `node $S/spend.mjs budget`: caps and spend. No `.asset-budget.json` means the defaults (fal $5,
   30 Codex images/24h, 100 Meshy credits, 10k ElevenLabs credits, Gemini $2). The owner sets real
   caps; never raise one yourself.
2. Count first (`--dry`). More than ~40 images: show the owner the count, cost and a calibration
   contact sheet, and wait.
3. Ask: can code make this? Recolour, flip, tint, overlay, crop, transform: free. Can the local
   model make it (non-shipping)? Free.
4. Run serially, or at most 4 at a time. Stop the batch on the first 402/403. Don't retry.

```json
// .asset-budget.json at the project root. The owner sets it.
{ "fal_usd": 15, "codex_images": 30, "meshy_credits": 0, "elevenlabs_credits": 8000, "gemini_usd": 2 }
```

**Budget guard (built into the scripts).** `fal.mjs`, `codex.mjs`, `meshy.mjs`, `gemini-tts.mjs` and
`elevenlabs.mjs` check each call against the cap (`exit 3` when over), log to `assets/SPEND.jsonl`
and the machine-wide ledger (`spend.mjs report`), and write an "exhausted" marker on a 402/403 or
usage limit that blocks later runs (`spend.mjs clear <service>` after a top-up or reset). **Project
kit scripts must shell out to these scripts or import `guard`/`record` from `spend.mjs`**; a script
that calls a paid API directly is invisible to the caps (Story Nook's `generate.mjs`). Gemini
image calls from project code need their own ledger and cap (Juneau's Library
`scripts/gen-map-art.mjs`: $4 cap, logs failed calls too, "a failed call may still bill").

**Paid picks (check prices before changing):** cheap exploration `fal-ai/nano-banana-2` (~$0.08) or
seedream (~$0.07) at 1K; hero art `fal-ai/nano-banana-pro` (~$0.15, 2K; 4K costs double, upscale
instead); cutouts `fal-ai/birefnet/v2` (~$0.01); runtime cheap `fal-ai/z-image/turbo` (~$0.003);
gpt-image `quality: high` only when a critic showed `medium` fails. Model ids change monthly: look
up the current one on fal.ai/explore and read its API tab for input fields.

**Gemini direct:** `POST https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent`,
header `x-goog-api-key`, body `generationConfig: { responseModalities: ['IMAGE'], imageConfig: {
aspectRatio } }`, references as `inlineData` parts, the image comes back in `inlineData`. Always set
`aspectRatio` (2.5-flash otherwise copies the input's shape). `gemini-2.5-flash-image` shuts down
Mar 15 2027.

## Keys (always)

- `FAL_KEY`, `MESHY_API_KEY`, `ELEVENLABS_API_KEY`, `GEMINI_API_KEY` live in `~/.zshenv` (or Worker
  secrets: `wrangler secret put …`). Grok, Muse and Codex use their CLI logins.
- Never print them, write them to files, commit them, log them, or put them in a client bundle (no
  Vite `define`, no `VITE_` prefix, **no `Info.plist`**: Story Loom and Juneau's Library currently
  bake `GEMINI_API_KEY` into the iPad build; move generation behind a Worker before release).
- The browser or app never calls a paid image API directly. Runtime generation goes through the
  Worker.

## Workflow

1. **Style bible first** (`docs/art-style.md`): medium, palette, line weight, lighting, a "Never"
   list (text, logos, brand look-alikes, faces on objects, anything a 3-year-old finds creepy), and
   the prompt prefix that encodes it (`prefix` in kit.json).
2. **Calibrate on 4 images** at 1K, locally. Fix the prefix until they look like one book. **Stop:**
   show the calibration sheet with the `--dry` count of the real run, and wait for approval (or a
   fresh critic's pass when the owner said to run unattended).
3. **Kits, not one-offs; parts, not permutations.** List the kit, cross out everything code can
   derive (colour variants, states, mirrored poses, crops).
4. **Consistency test:** each character in 6 scenes with the sheet as reference. If they drift,
   try another tool or more references before continuing. Record the winning settings.
5. **Review every image** at display size, with a fresh critic when the game uses a critic loop.
   Reject extra fingers or limbs, text squiggles, off-style lighting, scary faces, framed borders.
6. **Continuity chain for sequences:** pass the character sheet plus the previous image, and say
   what changed (Little Hero Adventures, Story Loom).

**Calibration lessons:** a style-reference *edit* copies composition, not just style: use the
prefix for style and references only for identity. Characters drift: always pass the sheet, and
re-reference the exact pose for expression variants. Ask for 1 image per call; agent CLIs
sometimes make extras.

## Art kit pipeline (Story Nook: 140 assets; Boatload: 230+ with Grok/Muse/Codex)

- **Manifest** of every asset with its prompt; the style prefix is added automatically. Use
  `kit.mjs` for the free tools; the paid equivalent is `~/src/story-nook/scripts/art/generate.mjs`
  (fix it to go through `fal.mjs` when you copy it).
- **Post-process in code:** cutouts (birefnet, or keying for Grok's magenta plates), `tileable.py`
  for textures, `optimize.py`-style trim to alpha bounds, resize by kind, WebP/KTX2, and a
  `manifest.json` with a **bottom-centre anchor** per piece so cutouts stand on the ground. Raw art
  stays out of git and the deploy.
- **What it cost:** 322 fal calls for 140 shipped assets; 49 were `--force` regenerations while
  fixing prompts on the whole kit. Fix prompts on one asset, then run the kit once.

## A real child in the story

Kids love seeing themselves. Do it carefully:

- **Photos come from a parent**, in the grown-up UI only. Store them in a private bucket. Never in
  git, logs, CREDITS (the scripts scrub data URIs), analytics or share links.
- **Make a hero sheet once** from 2–3 photos, in the book's style; a parent approves it. After
  that, **reference the sheet, not the photos**: more consistent, and photos are sent once.
- **Never send a child's photo to the plan CLIs** (Codex, Grok, Muse): use a paid API whose data
  terms you've checked (no training on inputs, retention), and tell the parent which service. The
  local model is the most private option for drafts.
- **Poses from the sheet** (stand, hop, sit, wave, sleep) with backgrounds removed, so the TV can
  animate without new images.
- **Keep it storybook-stylized**, not photoreal. Likeness is approximate; the parent judges.

## Runtime generation (per story)

- Only from the Worker, which holds the key. Cache in private storage keyed by story and page.
- Generate ahead: the next page's image while the current one is read.
- Always a fallback: the world's background plus the hero pose cutout. The story never blocks.
- Budget per story, cap per family per day in the Worker, cache forever, and a dedicated key with a
  provider-side spend limit.

## Meshy (3D)

- **Preview first** (`meshy.mjs preview`, ≈20 credits, untextured + thumbnail), contact sheet,
  then `refine` (≈10) only approved ones. `meshy-6-lite` (≈5) for small props.
- **One base, many variants in code** (tint in the shader).
- Image-to-3D from a clean front image (plain background, full body, neutral pose), `--lowpoly` for
  web. Check triangles, texture size, scale and pivot in the game scene before keeping.
- Test rigging on one character first; stylized toddlers and animals rig badly.
- **2.5D first:** illustrated parallax plus animated cutouts usually beats generated 3D.

## Voice lines (Gemini TTS)

`gemini-tts.mjs` is billed per second of audio (Number Quest: 1,239 lines ≈ $1.50 on
`gemini-3.8-flash-tts`). Cap `gemini_usd`. `batch --dry` first; existing clips are skipped.
**Never put the style in the text** (it gets spoken); the script passes it as `speech_metadata`.
Calibrate on ~20 lines. **Master after every batch** (Number Quest `scripts/master-voice.sh`): trim
leading/trailing silence and limit to ~−3 dBFS at 64 kbps. The `--dry` estimate ran ~2× low for
templated lines; budget on double. Free local alternative: Kokoro-82M (Apache-2.0, flatter).
**ElevenLabs** spend is measured late: `elevenlabs.mjs` records the request's estimate or polls the
counter; cross-check big runs with `elevenlabs.mjs check` before and after.

## Honest limits

- Hands, small text and exact likeness are the usual failures. Frame shots to avoid close-up hands;
  set real text in code (local Qwen and Codex spell short titles well, but check every letter).
- "Seamless" is a hope, not a property: check it.
- Generation takes seconds to minutes. Design so nobody watches it happen.
