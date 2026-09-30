# Case studies (September 2026)

What notable builders disclosed about how they made their Opus 5.x 3D games and worlds.
Collected from posts, replies and repos; costs are as the builders reported them.

## edwin (@edwinarbus) — Antikythera
Link: https://x.com/edwinarbus/status/2102463453176979794 · playable: claude.ai/artifact/ReCBQGZ4EirKSiEmT8XXfs
- A game about the Antikythera mechanism; everything seen and heard is procedurally generated
  in real time. Single 3 MB HTML file, three.js, published as a Claude artifact.
- Counts he shared: 2,047 fish, 25,000 grass blades, 47,000 particles, a 30-gear / 1,923-tooth
  model of the mechanism — i.e., heavy instancing and GPU particles.
- Not one-shot: "several (verification loops that ran over a weekend)".
- Visible polish: themed loading line ("Polishing the bronze") while shaders compile.

## Meng To (@MengTo) — river valley boat and dragon ship
Links: https://x.com/MengTo/status/2102760783344189761 (valley, full prompt in reply 2103155074705019158) ·
https://x.com/MengTo/status/2103122947133309311 (ship)
- Valley: a ~1,500-word prompt: painterly-cinematic feudal-Japan river valley; landmark list;
  hero boat built part by part; a boatman whose pole must never clip; water as centrepiece
  with its own sub-spec; petals/mist/birds/fireflies; multi-minute day–night loop with a storm;
  synthesized soundscape; autopilot with WASD takeover; chase camera rules; no text anywhere;
  one standalone file; "actually test it in a browser, screenshot morning/storm/golden
  hour/night, fix every issue", then answer briefly. Cost ~$10–15, about a quarter of a 5-hour
  limit. Characters were generated with Higgsfield; everything else Opus.
- Ship: had Opus **score every part** (ship, water, landscape, buildings, sub-parts) and keep
  improving until each reached ≥ 8/10 within his budget. "Let it work as long as possible"
  until it needs a course correction.
- Sound: fine for ambience/sound bites, weakest for real game audio (his words, paraphrased).

## Dan Greenheck (@dangreenheck) — Tidewater (ocean → cozy fishing game)
Links: https://x.com/dangreenheck/status/2102878170089169235 · prompts: https://x.com/dangreenheck/status/2102911556296052788 ·
repo: https://github.com/dgreenheck/tidewater · demo: https://dgreenheck.github.io/tidewater/
- Author of the three.js Water Pro/Fire Pro assets. First prompt asked for an "Unreal-level"
  ocean in three.js with a long bullet list (FFT cascades, shoreline, caustics, wake, boat,
  village, first/third person, volumetric sky, ACES, AO, reef, underwater, UI), a 60 fps target,
  and WebGPU + TSL. Then ~100 short follow-ups: "iterate against references until perfect",
  "caustics are just noise — rewrite from scratch", "look at the Water Pro folder for bow spray",
  "what special polish would push this over the edge?", "what are the agents' termination
  conditions?", "performance is starting to suffer — optimize as you go".
- Result per README: 4-cascade Tessendorf FFT ocean, breaking waves + swash, caustics, light
  shafts, physical atmosphere + volumetric clouds, god rays, lens flare, LOD vegetation with
  impostor fading, whale/birds/fish, boat wake, CSM, TAAU, SSAO, motion blur, dynamic resolution.
- Cost: $1,874 API-equivalent, 59% of his weekly usage on the $200 plan, ~8 h real time, multiple
  subagents; >60 fps at 1440p on his machine. He says almost all his prompts were simple "add
  this" or "this looks weird, improve it" requests — but note how physically specific his
  "looks weird" notes were.

## Max (@maxt3chno) — Far Cry 3-style lagoon
Links: https://x.com/maxt3chno/status/2103426482026566135 (prompt 1) ·
https://x.com/maxt3chno/status/2103961551031996532 (prompt 2, stages 6–11)
- Prompt 1 (~2,000 words, numbered sections): small-but-dense world, the outpost, first-person
  hands and animations, stone throwing with splashes and ripples, weapon and knife interactions,
  crate/harvest/inventory, weather, time of day, a graphics/shaders list, sound list, key map,
  art direction paragraph, "must be playable, no placeholders, core mechanics first", and
  reference images uploaded after the prompt. Cost ~15% of a $20 plan's weekly quota.
- Prompt 2 turned polish into **stages 6–11**, each in a fresh session with a reasoning level
  (High/Max/Medium), global rules (quality flags, don't break earlier stages, keep APIs stable,
  rebuild + one console check), numeric targets (hex palettes, shadow at 15–20% of lit, water
  ≤ 4 ms/frame) and an acceptance line. Stage 7 "flagship water" is a full water spec.
- He used another model to expand his idea into the prompt; wrote no code himself.
- **Part 3** was posted by @mdaman010 (https://x.com/mdaman010/status/2104302207718023547),
  whose parts 1–2 and caption match Max's word for word, so it's the same project either way.
  Total: 8 hours, 58% of the $20 plan's weekly quota. Three hero props (boat, weapon, bed) were
  generated in Meshy and imported; everything else is Opus. What part 3 adds:
  - **Out-of-plan stages** once the planned ones were done: backpack, a carried lamp,
    sleeping, then swimming, a drivable boat and the open sea (effort "extra-high").
  - **Bug reports with a hypothesis**: "inspecting the lamp turns the screen black, probably
    an emissive value blown up by bloom, check how inspected objects are cloned".
  - **Performance rules inside the spec**: reuse the existing point light for the carried
    lamp ("no new lights, no shader recompiles"); boat physics on the CPU at a fixed 60 Hz
    with render interpolation; at most ~1 ms extra render cost; log draw calls at two spots.
  - **Physics that produces the motion**: a 6-DOF boat with buoyancy from ~10 pontoon points,
    different drag along vs. across the hull, bow lift and stern squat, mooring lines as
    springs. Heave, pitch and roll "must come from this, not from animation".
  - **One source of truth for waves**: a CPU mirror of the low FFT modes, so the boat and the
    swimmer feel the waves you see.
  - **Feel details listed explicitly**: slight FOV increase with speed, horizon tilt in
    turns, engine vibration, spray, drops on the lens when slamming, a camera on a spring.
  - **Soft world borders**: a current pushes you back; no invisible walls.
  - **Acceptance as a playthrough**: "swim past the shallows, dive to the reef, climb into the
    boat, cast off, head past the reef, come back, dock, climb out." (That's what
    scripts/playtest.mjs automates.)

## Danny Limanseta (@DannyLimanseta) — co-creating a game with his kids
Link: https://x.com/DannyLimanseta/status/2104215873120764032 · play: wildbrush.vercel.app (desktop)
- His boys described what they wanted, he prompted Opus 5.5, and they played and iterated
  all Saturday: an open-world adventure where the hero's weapon is a giant paintbrush and each
  color is a mechanic (red fire, blue ice, yellow bounce, green vines). You unlock flying on
  the brush by activating 4 crystals.
- By the end of the day: 2 biomes, 3 puzzle dungeons, a cave, 30+ enemies, a giant boss.
  Roughly 30% of his weekly limit.
- The lesson is the loop, not the polish: short cycles of "ask → build → play together", with
  gameplay ideas coming from the players. He calls it the most satisfying game he's made.
- Players noted it heats up a MacBook, and one said a fire power burned down the whole map:
  systemic effects need limits (spread caps, cooldowns).

## S (@Rubzem) — seamless multi-planet space game
Link: https://x.com/Rubzem/status/2104253584737230926
- Claims one prompt on Tesana (a hosted game-building platform he promotes in the thread),
  about $95 for the first output: 80+ planets you fly between and land on, each with its own
  biome, minerals, aliens and weather. No prompt or code shared, so treat it as a claim.
- What it points to technically: planet-scale worlds in three.js need seeded per-planet
  generation (the same planet every visit), streaming terrain LOD as you approach, and a
  floating origin so precision doesn't jitter far from zero. See the cookbook's large-worlds
  section.

## Matt Shumer (@mattshumer_) — Claude of Duty; open-world NYC
Links: https://github.com/mshumer/Claude-of-Duty · https://x.com/mattshumer_/status/2102874271316078841
- Short orchestration prompt: build a CoD-level FPS in three.js, fan out sub-agents, a harsh
  critic compares side by side against the real game, `/loop` until utterly wowed.
- ~55k lines, 11 subsystems, all procedural. ARCHITECTURE.md contract: directory ownership,
  `ctx.get()` instead of imports, seeded RNG, no per-frame allocation, typed event bus,
  surface taxonomy, pre-warmed shaders, constant light counts.
- Harness: headless GPU captures, bit-identical baselines, per-pixel image diffs as gates,
  frame-time profiling with hitch attribution, scripted playtests.
- Lesson: sequential single-owner passes beat parallel fan-out for coupled systems.

## aipulsedaily (@aipulseda1ly) — The Forest-style survival island
Link: https://x.com/aipulseda1ly/status/2103352533657719230
- Claude Code + Opus 5.5, "one and a half prompts": build prompt, then "first pass was mediocre"
  → it pulled real reference photos; ~50 subagents, stopped after ~12 h (usage).
- Waves of agents one per domain + **critic agents that never touched the build** checking
  renders against real photos. Erosion-simulated 2 km island, 44k trees with distance LODs and
  billboards baked at load, CC0 photoscanned bark, astronomically placed sun/moon for 49°N.

## Ryan Sael (@RyanSael) — interactive 3D explainers (lens lab, datacenter, AI museum)
Links: https://x.com/RyanSael/status/2102591147927654847 (lens lab) ·
https://x.com/RyanSael/status/2104371800243405161 (how he does it) · live: lens.lab.sael.net,
datacenter.lab.sael.net, sael.net/ai-museum, sael.net/a-muse-ment
- One-shot runs with no human course correction, all three.js with zero 3D assets:
  - lens lab: 1h26m, $25.66 API-equivalent. Moving the focus ring shifts the glass elements
    and moves the sharp plane through the scene; the aperture is clickable too.
  - datacenter: 1h53m, $38.99. Overload a rack and its GPUs throttle, then follow the heat out.
  - AI museum: 1h30m, $29.78, every room explorable, plus a few follow-up turns of fixes.
  He's on a subscription and gets the API-equivalent cost by running `/usage` after each run.
- **Prompts are short.** He posted his example prompt for a-muse-ment: a reference image plus
  roughly "make this an interactive web page from this image, match the vibe as closely as
  possible, make it lit, it has to be really good, as per usual".
- **His real lever is context.** He runs Claude Code inside a folder of his earlier 3D projects
  and prompts it to scan them (and his unpublished work). New sessions also read previous
  sessions, so his house style carries forward. He says that with zero context it probably
  wouldn't reach the same quality, and he used no skills. (His stance: sharing prompts or
  skills "won't be useful"; the corpus is the point.)
- Priorities he states for his explainers: loads really fast, lightweight, useful for
  learning, visually stunning. He criticized a copy of his style for loading slowly because
  it was "stuffed with too much".
- On accuracy: AI-made STEM visuals can be wrong, and "people trust what looks good, so what
  looks good had better be true". He's planning an open-source repo so domain experts can
  add lessons and fix inaccurate visuals.
- Feedback in his replies: one user's Android Chrome showed a white blob, then a "needs WebGL"
  message (it worked on iPhones). A museum-education reply suggested Exploratorium-style
  "to do and notice" cards.

## Andrei Provkin (@AndreiProvkin) — procedural world, first pass
Link: https://x.com/AndreiProvkin/status/2103919236653428985
- One prompt + one reference photo → a plan; he kicked off 3 plan steps by hand; no correction
  rounds. 3h36m active, 445 requests, +5,010 lines, ~$60 API, effort high. three.js + TSL.

## Others worth knowing
- **Truxat** (https://x.com/ClipCenter101/status/2103277207212929334): Godot game; harsh AI critic
  scores every area and sends it back until 8/10; wave-sim wake, eroded mountains, ray-marched clouds.
- **Pradeep Kapoor** (https://x.com/pradeepXkapoor/status/2103138340598149388): feed text-to-image
  designs as targets; Opus "climbs the hill" (analyse → create → critique → improve).
- **Shikhar** (https://x.com/xikhar/status/2104001664793600012): three.js + Blender + image-gen on
  Opus 5.5 *medium*; about one goal per day over 3 days on a 5x plan; gave it photos of NYC.
- **Ken Lin** (https://x.com/KenLin1985/status/2103866807954399530): Karts.com — characters from
  Nano Banana/ChatGPT → Tripo3D models; tracks with Opus + Blender; assembled in three.js.
- **Denis Shiryaev** (https://x.com/literallydenis/status/2103088660887318850): 40 min with a
  three.js agent skill + fal txt2img for assets and music.
- **Aurelien** (https://github.com/Aureliengmz/clearwater): water matched from a *video* reference.
- **GMI Cloud** (https://x.com/gmi_cloud/status/2102950788641501367): Sakura Crossing rebuilt in
  2 h by Opus 5.5 (24 h with Opus 5); open-sourced. A commenter spotted z-fighting and noted
  models struggle to see it in static images → use motion diffs.
- **jacob / spawn** (https://x.com/jsnnsa/status/2102862008467194151): 26 agents overnight on
  their own engine, multiplayer; Opus scripted geometry from triangles.
- **Majid Manzarpour** threejs-game-skills (https://github.com/majidmanzarpour/threejs-game-skills):
  director/gameplay/graphics/UI/debug/QA skills with evidence requirements (nonblank canvas
  checks, visual scorecards, bot playtests) and optional Tripo/Gemini/ElevenLabs asset skills.
  His Sept 28 update (https://x.com/majidmanzarpour/status/2104536199214088496; details in the
  commit "Tune skills for Claude Opus 5.5, cut QA token cost, and add music generation"):
  - **Routing tested, not guessed:** an 80-run headless Claude Code trial (20 prompts × 2 runs
    per wording variant) showed that describing *request categories* in the skill description
    loaded the right skill for 20/20 broad game requests, vs 18/20 with a trigger-phrase list,
    with no change to specialist routing or unrelated prompts.
  - **QA output cut ~10x:** one summary line per capture instead of full JSON (6.7 KB → 594 B for
    three captures), errors deduplicated and capped, screenshots at CSS scale (about a fifth of
    the image tokens), one browser for all declared captures, `load` instead of `networkidle`,
    and no settle wait for frozen named states.
  - **Opus 5.5 prompt alignment:** updates at each phase boundary, named early stops to avoid,
    named UI patterns to avoid, and goals instead of long step scripts where order doesn't matter.
  - **Music generation** through ElevenLabs, with loops, stingers and crossfades.

- **Aman (@mdaman010), again** (https://x.com/mdaman010/status/2104586890141958641): a harbor
  sunset boat scene made with GPT-6 Astra (not Opus), "inspired by my swamp experience", while
  quoting @stfu0911's viral Astra swamp post. With the Far Cry lagoon posts matching Max's word
  for word too, check who originally made something before treating one account's claims as
  first-hand. Useful takeaway: the same techniques work across models; Astra is strong at water.

- **Fede (@RealFedeURU)** (https://x.com/RealFedeURU/status/2104528289079734492): a kart racer
  with Opus 5.5 whose title screen shows the kart on a lit turntable with Race / Leaderboards /
  How to play / Settings, which makes it read as a finished game. A follow-up used GPT-6 Sol and
  Opus 5.5 with Unreal and Blender.
- **Dan Greenheck** WebGPU/TSL skill: https://github.com/dgreenheck/webgpu-claude-skill

## Simon (@iced_coffee_dev) — a technique-by-technique breakdown
Link: https://x.com/iced_coffee_dev/status/2104596291850584397
- A small three.js Halloween scene (a cloth ghost, a bonfire, a candlelit crypt, a cloud-like
  dog) built with family members giving feedback on the look. He's a graphics programmer with
  tutorial videos (bloom, ground rendering); this is closer to hand-crafted than agent-built.
- The thread names every technique (now in the cookbook's "Named techniques" section) and
  mixes CC0 assets (Poly Haven HDRI, Quaternius trees) with custom shaders.
- His conclusion: without game-dev vocabulary you can't steer AI past "cool" to what you
  actually envisioned. He was also the one asking Dan Greenheck for his prompts.

## Garrett Petersen — skills for shipping an indie game
Link: https://x.com/GarrettPetersen/status/2104671176777937007 · repos:
https://github.com/GarrettPetersen/indie-game-vibe-coding-skills and
https://github.com/GarrettPetersen/indie-game-marketing-skills
- Lessons from shipping his own game, *Marque & Reprisal*, to Steam. The development repo covers
  what comes after the prototype: web-first architecture (pick the renderer from the biggest real
  scene, not the first empty room; DOM/SVG is often right for board games), consent-based
  telemetry, production error recovery, canonical IDs and save migrations, input and
  localization, accessibility, credits, and a playtest-feedback ledger.
- Recurring rules: stable IDs before content multiplies; generated files must be rebuildable;
  game logic runs without the renderer; test real production builds; show the build revision;
  update the feedback ledger along with the code.
- The marketing repo's best idea for anyone building games: **trailer-first vertical slices.**
  Plan the gameplay trailer's beats before production (core fantasy, repeated action, a real
  choice, escalation, progression, variety, payoff), turn each beat into an acceptance scenario,
  and call the slice ready when a competent player can produce that footage in the real game.
  That's the same idea as scripted playtests and named scenarios in this skill.
- AI assets as a fixed cost: if a storefront requires disclosing generative-AI assets, the first
  one pays the whole disclosure penalty and more add little, so go all-in or replace every one;
  a partial replacement that keeps the disclosure buys nothing. His skills never generate
  capsule or key art; the developer supplies it.
- Skill-authoring details worth copying: descriptions say when *not* to use the skill, an
  AGENTS.md keeps the repo's own rules (no project-specific leakage, validate every skill), and
  skills are symlinked per game into `.agents/skills` rather than installed globally.

## Articles
- Gauntlet loop overview: https://we0.ai/articles/claude-opus-5-s-gauntlet-loop
- Claude of Duty breakdown: https://explainx.ai/blog/claude-of-duty-opus-5-procedural-fps-july-2026
- Honest review of Opus for game dev: https://www.soonlab.ai/blog/claude-opus-5-game-development/
