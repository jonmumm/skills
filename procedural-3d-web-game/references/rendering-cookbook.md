# Rendering cookbook

Technique checklists and steering vocabulary, gathered from what the top builds used
(Tidewater's README, Claude of Duty's ARCHITECTURE.md, Max's stage prompts, Dan Greenheck's
feedback log) plus standard real-time graphics practice. Use it to write stage specs and to
turn a critic's complaint into a concrete fix. Everything here can be done in three.js code.

## Light, atmosphere, grade (do this first — cheapest, biggest win)
- Tone mapping: ACES filmic or AgX; exposure driven by time of day; if you add eye adaptation,
  make sure it doesn't wash the frame back out.
- Key/fill/rim: strong sun, darker cooler ambient so shadow sides sit at ~15–20% of lit
  brightness (readable, never crushed); warm bounce from bright ground.
- Aerial perspective is **blue, never white**; fog lies low (valleys, over water); mountains
  read in 2–3 depth layers, bluer with distance. "Milky haze over clean low-poly" is the #1
  first-pass failure.
- Grade: S-curve contrast, saturation ~×1.1–1.25, warm highlights / cool shadows, subtle
  vignette; bloom threshold high enough never to veil the frame; add sharpening after FXAA/TAA.
- Shadows: cascaded shadow maps (fine near, coarse far), contact shadows / small AO decals
  under props, blend cascades (no hard seams); tighten the frustum near the player.
- AO: SSAO/GTAO where surfaces meet; watch for AO flicker on thin geometry (nets, fences).
- God rays only through occluders (foliage, windows), not across the whole screen.
- Night: moon as key light with shadows, stars and a faint Milky Way band, cratered moon;
  lanterns and windows glow and actually light their surroundings.
- Environment lighting: rebuild a PMREM from the sky only when the sun moves meaningfully.

## Water (the most common centrepiece)
- Waves: sum of Gerstner harmonics with the deep-water dispersion relation for the big swell,
  plus an FFT spectrum (Phillips/JONSWAP, 2–4 cascades at non-multiple sizes, rotated) for
  detail. Tidewater used a 4-cascade Tessendorf FFT. No visible tiling; filter distant normals
  (Toksvig/LEAN) so they don't shimmer.
- CPU `heightAt(x,z)` evaluates the same waves so boats, buoyancy, camera and splashes agree.
- Optics: per-channel Beer–Lambert absorption over the true underwater path length (from the
  depth buffer) + in-scattering color; Schlick Fresnel with F0 = 0.02; screen-space refraction
  with a depth test so above-water objects don't leak in; SSR with sky/PMREM fallback, planar
  reflection for the near area on High; tight GGX sun highlight + sparkle; sunset/moon paths;
  subsurface glow on backlit crests.
- Foam: spawn where the wave Jacobian compresses, along the shoreline, around rocks/piles (depth
  difference); it persists and decays. Use a real bubble/foam texture, not raw noise.
- Shore: waves shoal (steeper, shorter as depth drops), break with a crest that falls *then*
  foams (not foam rolling up the inside of the curl); swash sheet runs up and drains, leaving
  a wet band that dries with delay. Spray comes from breaking, not from every crest.
- Caustics: animated, chromatic split, intensity by depth, projected on everything underwater,
  suppressed in shadow; never "just noise" and never showing a finite-area edge.
- Interaction: a local height-field sim (ping-pong grid following the player) for ripples from
  stones, bullets, rain, footsteps; bow wave + Kelvin wake for boats.
- Under/over water: correct half-in/half-out waterline split, underwater fog + light shafts,
  muffled audio event.

## Sky and clouds
- Physical atmosphere (three's `Sky` for a start; Tidewater used a physically-based atmosphere
  with volumetric clouds). Clouds: broad low-frequency bases with high-frequency detail on top;
  silver linings near the sun; cirrus as a broad subtle texture, not lines; avoid "tall
  marshmallows" and granular/pixelated raymarch noise (use blue-noise jitter + temporal accumulation).
- Lightning lights the clouds and the whole scene; thunder arrives late (speed of sound).

## Terrain and rocks
- Heights: fBm + ridged multifractal, then **simulated erosion** baked offline/at load (the
  Forest-like island carved a 2 km island this way); strata, gullies, ledges.
- Slope/height-based materials: rock on steep faces with vertical streaks, vegetation on
  ledges, wet sand band at the waterline; triplanar mapping on cliffs to avoid stretching.
- Rocks: noise-deformed with ridged facets, clustered 3–7, half-buried, moss on top.
- Scatter debris to sell scale: pebbles, logs, driftwood, shells, fallen leaves.

## Vegetation
- Instancing (`InstancedMesh`) for everything repeated; per-instance scale/rotation/tint.
- Clumping from a low-frequency density noise (groves and clearings), species by altitude/slope.
- One shared, gusting wind field drives grass, leaves, cloth, flags, bells; gusts travel.
- Alpha-tested leaf cards cast shadows (custom depth material with the leaf mask); leaves get
  translucency/subsurface so they glow when backlit.
- LOD: full mesh near, simplified mid, baked billboards/impostors far; fade between LODs with
  a **Bayer/blue-noise dither**, never a hard pop. (The survival island used distance LODs
  and billboards baked at load for 44,000 trees.)
- Kill the "lawn": leaf litter and dark soil under trees, varied grass heights and colors.

## Materials (procedural PBR)
- Generate albedo/normal/roughness/AO maps in code (canvas or GPU) once, cache, tile without
  repetition (stochastic/rotated tiling). Detail must hold up at 0.5 m.
- Wood: stretched-noise grain, knots, cracks, per-plank tone and UV offset, dark seams, sun
  bleaching, worn light edges from curvature — no "zebra stripes".
- Metal: paint → chips → rust driven by curvature/noise masks; rust streaks; scratches.
- Fabric: visible weave, stains, faded folds, torn alpha edges.
- Keep albedo physically plausible (≈0.02–0.9), metals binary (0 or 1).
- Use a small set of shared, named material roles instead of one-off colors (primary body,
  secondary, trim, hazard, reward, glass, emissive signal, ground contact, dark and light
  decals), and take UI signal colors from the same set, so the world and the HUD speak one
  language. Anything conveyed by color also needs a shape, icon or motion.
- Wetness: darker albedo, lower roughness, puddles in low spots; dries over time.
- Allowed shortcut when the user agrees: CC0 photoscanned textures embedded in the bundle
  (the survival island wrapped procedural trees in real scanned bark).

## Architecture, props, characters
- Build from real construction logic: parts with thickness, joinery, tiles, brackets, rope
  lashings. Everything rests on something; nothing floats or intersects (check it).
- Characters/animals are the weakest procedural area. Options: (a) procedural skinned rigs with
  IK and secondary motion (breathing, cloth, hair); (b) image-gen concept → image-to-3D (Tripo,
  Higgsfield) → GLB, embedded; (c) Blender Python scripted by Opus for rigging/animation.
  Feet planted, weight shifts, no hands passing through held objects.
- Animation feel: drive motion with simulation (springs, damping, momentum, flocking) rather
  than linear tweens; critically damped cameras; hit-stop, screen shake and recoil for impacts.

## Named techniques worth asking for (Simon's Halloween scene)
Simon (@iced_coffee_dev) broke down a small three.js scene his family gave feedback on. Each item
below is a technique name you can put in a brief or a critic note; his point is that without
this vocabulary you're "stuck with copying or random iteration".
- **Light the subject, not the world.** One strong key light (moonlight) plus an HDRI for fill,
  with the key's strength falling off exponentially from the hero (full on the ghost, ~20% a
  few meters away). Modulate it with a slowly moving cloud-shadow map (Perlin-Worley noise).
- **Soften low-poly assets** by rounding their normals, so lighting reads soft instead of faceted.
- **One particle system for fire and smoke,** using a premultiplied "add/alpha" blend so each
  particle can be partly additive (flame) and partly alpha (smoke). Light smoke puffs with
  sphere-derived normals so they look volumetric.
- **Ground as one plane:** texture splatting driven by an RGBA mask, material textures in a
  texture array, and parallax occlusion mapping for depth.
- **Grass generated in the vertex shader** from blade indices (Ghost of Tsushima-style), swayed
  by noise. Implement the same noise on the CPU so particles and props drift with the same wind.
- **Soft characters cheaply:** a ball with a cloth simulation draped over it made a convincing
  ghost.
- **Volumetric creatures:** a rough SDF shape raymarched with cloud-rendering techniques
  (Horizon Forbidden West-style), with its shadow composited into the scene.
- **Mostly stock post:** three.js SSAO, a small custom contact-shadow pass, and a tuned bloom.
- **Interactable highlight:** a blurred outline, depth-tested so the glow doesn't bleed through
  objects in front, composited with the bloom. Good for "this is the thing you can use" in
  kids' and party games.

## Physics engine choice
From Majid Manzarpour's skills; three.js is only a renderer.
1. Custom collision for arcade games: triggers, pickups, lanes, bullets, rails, runners.
   Anywhere authored feel matters more than simulation.
2. Rapier (`@dimforge/rapier3d-compat`, WASM) as the default for real physics: golf, pool,
   pinball, platformers, ramps, character controllers, stacks, destructibles, fast bodies (CCD).
3. cannon-es for small rigid-body scenes without WASM. Jolt for advanced cases.
Rules that prevent the usual bugs: step at a fixed 1/60 s with the frame delta clamped to 0.1 s;
sync mesh transforms from bodies in exactly one system; never collide against detailed visual
meshes (use primitive or convex proxies); enable CCD only on fast bodies; sensors need active
collision events or they silently fire nothing; kinematic platforms must move the body, not
just the mesh; restarts dispose bodies.

## Physics, vehicles and game feel
- Motion comes from simulation, not animation: vehicles are rigid bodies whose heave, pitch
  and roll fall out of forces. For a boat: buoyancy sampled at ~10 points along the hull, drag
  that's weak along the hull and strong across it (a keel), angular damping, thrust applied at
  the stern, and speed-dependent turning.
- Run physics on the CPU at a fixed step (60–120 Hz) and interpolate rendering between steps,
  so behaviour doesn't change with frame rate. (The template's engine already has a fixed step.)
- Anything the player touches queries the same function the shader draws: water height and
  normal, terrain height. For FFT water, mirror the low-frequency modes on the CPU.
- Constraints as springs: mooring lines, ropes, a seated camera that lags the vehicle.
- Apply feel in this order, since each layer depends on the one before: input latency (the
  main verb responds within ~100 ms, or no juice will save it) → response curves (acceleration,
  easing, overshoot) → contact feedback (flash, squash, hit-stop) → camera (shake, kick, FOV
  punch) → audio-visual sync (sound on the same frame, with pitch variance).
- Screen shake from "trauma": events add trauma (pickup 0.15, hit 0.4, explosion 0.7, capped at
  1), shake = trauma², and trauma decays each second. Hit-stop scales the gameplay delta for
  60–90 ms but keeps rendering, camera and UI on the real delta. Squash and stretch preserves
  volume (scale the other axes by 1/√s) and settles with an overshoot ease.
- Readability rule: feedback must clarify the next decision, never hide it. Provide a
  reduced-motion option for heavy shake and flashes.
- Feel checklist for movement: FOV widens slightly with speed, the horizon tilts into turns,
  vibration at high throttle, spray and camera kick on impacts, lens drops after splashes,
  audio pitch tied to load. For combat: hit-stop, screen shake, recoil, impact VFX and SFX
  per surface.
- Systemic effects need limits: fire that spreads needs a spread cap and burn-out, or one
  power can wreck the whole map.
- World edges are soft: currents, wind or fog push the player back, with a hint. No invisible
  walls.
- When a feature needs a light (a carried lamp, a muzzle flash), reuse an existing light
  instead of adding one, to avoid shader recompiles.

## Large worlds (planets, open worlds)
- Generate each region or planet from a seed derived from its ID, so it's identical on every
  visit. Store only the player's changes (mined spots, built things) as a diff on top.
- Stream terrain in and out with quadtree LOD (a cube-sphere for planets), generating chunks
  off the main thread (web workers) and fading them in with a dither.
- Use a floating origin: keep the camera near (0,0,0) and move the world, or distant objects
  will jitter from float precision.
- Transitions (space to atmosphere, sea to underwater) are where the illusion breaks; give
  them their own acceptance shots.

## Audio (Web Audio API)
- Ambience from filtered noise layers with slow modulation (surf, wind, rain), spatialized
  one-shots (`PannerNode` HRTF), convolution reverb from a generated impulse, occlusion by
  low-pass. Start on first user gesture; M to mute.
- Builders report synthesized **music and footsteps** sound fake; use CC0 samples or an SFX/TTS
  API when the brief needs them, and keep synthesis for ambience/UI/impacts.
- Jon has an ElevenLabs key in `ELEVENLABS_API_KEY`; `scripts/elevenlabs.mjs` wraps sound
  effects (`POST /v1/sound-generation`, optional loop and duration), music (`POST /v1/music`)
  and text-to-speech (`POST /v1/text-to-speech/{voice_id}`). Prompts that work name the event,
  the source material, the transient and the tail: "soft wooden pop for a kids' cartoon game,
  bright transient, 0.4 s tail, no music, no voice". Mood words alone ("epic") don't.
- Generated music (ElevenLabs' music API, `POST /v1/music`, 3–600 s, optional instrumental
  and composition plan) closes the biggest audio gap. The API has no loop
  flag: generate loops a little long and crossfade at runtime, add short stingers for events,
  layer intensity (calm/tense) and crossfade between layers, and mix music under SFX. Majid
  Manzarpour's threejs-audio-generator skill wraps this.
- Pentatonic generative music (Jon's Rocket Crew) is a good free alternative: every SFX
  harmonizes with it, and moods can follow game phases.

## UI and first impression
- Minimal HUD; graphic or themed loader that hides shader compilation (Antikythera's loader
  line, Tidewater's fishing tips while shaders compile). Controls help reachable from pause.
- A product shell makes a prototype feel like a game: a title screen with the hero object on a
  turntable (Fede's kart racer), and Play / How to play / Settings / Leaderboard or Album.
  Build it after the vertical slice, with the same art direction as the game.

## Performance
- Budget with frame-time percentiles (p95/p99), per-pass breakdown in the F3 overlay.
- Starting budgets for the worst active view (Majid Manzarpour's; document any overrun as a
  tradeoff): desktop ≤ 300 draw calls, ≤ 750k triangles, ≤ 60 textures, ≤ 2 shadow-casting
  lights with maps ≤ 2048, ≤ 2 post passes; mobile ≤ 150 draws, ≤ 300k triangles, ≤ 40
  textures, 1 shadow light at ≤ 1024, 0–1 post passes, pixel ratio capped at 1.5–2.
- Profile one scenario at a time: fix the view and state, take a baseline, classify the
  bottleneck (CPU, draw calls, fragment/overdraw, vertices, memory), apply one change, and
  re-measure the same scenario.
- **Pre-warm shaders** before frame one (`renderer.compileAsync(scene, camera)`), including
  shadow/depth variants. Claude of Duty cut 0.7–1.2 s hitches to under 100 ms this way.
- Lights: changing the number of visible lights recompiles materials — keep a constant count
  and drive intensity to zero instead of toggling visibility.
- No per-frame allocations; dispose geometries/materials/textures; instancing and merged
  geometry for draw calls; half-res for expensive passes (SSR, clouds, AO); distance culling.
- Quality tiers (low/medium/high) chosen by device; optional dynamic resolution (some users
  dislike it — expose a manual setting).
- Measure on the real GPU (`--gpu`), not in headless SwiftShader.

## WebGPU + TSL (when you need compute)
- Import from `three/webgpu` and TSL helpers from `three/tsl`; `await renderer.init()` before
  use; use node materials (`MeshStandardNodeMaterial` with `colorNode`, `normalNode`, ...).
- TSL API drifts between releases (e.g. renamed normals, `PI2` → `TWO_PI`); check the
  installed three version's examples before writing TSL, and prefer patterns from its
  `examples/webgpu_*` files. Dan Greenheck publishes a WebGPU/TSL skill:
  github.com/dgreenheck/webgpu-claude-skill.
- Headless verification of WebGPU needs `--gpu` on real hardware; keep a WebGL fallback path
  or a check that reports "WebGPU unavailable" instead of a black screen.

## Assets strategy
| Strategy | Used by | Pros | Cons |
|---|---|---|---|
| 100% procedural code | edwin (Antikythera), Claude of Duty, Andrei Provkin, Meng To (except characters) | one file, zero deps, "everything is code" wow-factor | characters, music weakest; more iterations |
| Procedural + CC0 textures/sounds | survival island, Dan Greenheck (asked for real sounds), Simon (Poly Haven HDRI, Quaternius trees) | realism jump for bark/rock/foley/lighting | licensing care, bigger file |
| Image-gen refs → Opus replicates | Pradeep Kapoor, Meng To, Shikhar | gives the critic a concrete target | needs an image model |
| Image-gen → image-to-3D models | Ken Lin (Nano Banana → Tripo3D), Meng To (Higgsfield chars), the Far Cry lagoon (Meshy boat, weapon, bed) | good characters and hero props fast | external APIs, file size (Meng To: 12–15 MB) |
| Opus scripts Blender | Shikhar, Chetan Ankola, Stefan 3D AI | best modeling/rigging control | needs Blender installed/MCP |

Paid asset jobs (Tripo, Meshy, ElevenLabs, image models), per Majid Manzarpour's recovery
policy: start them early and keep building while they run; record each job's provider, task ID
and purpose in STATUS.md the moment it's submitted; inspect the concept image before paying for
image-to-3D, and the model before rigging. Retry status checks and downloads with backoff, but
never resubmit a job whose outcome is uncertain: find its task ID first, since a resubmit
charges twice. Credits running out blocks only the dependent work, so disclose the gap and
continue. Test one generated asset at gameplay scale before generating a whole family.
