---
name: autodesign
description: >
  Autonomous design iteration loop. Captures screenshots, runs design critique +
  impeccable skills, gets cross-model consensus (Claude + Codex), implements fixes,
  deploys, and repeats. Like autoresearch but for visual design quality instead of
  quantitative metrics. Use when going AFK on design polish, when asked to "autodesign",
  "design loop", "polish loop", "iterate on the design", or "make it look good while
  I'm away".
dependsOn:
  - jonmumm/skills@evals-first
  - jonmumm/skills@codex-review
---

# Autodesign

Autonomous design iteration loop. Captures screenshots of your UI across viewports,
runs design critique and impeccable skills, gets cross-model consensus feedback,
implements the highest-impact fixes, deploys, and repeats until the design converges.

Like autoresearch but for visual design quality — instead of measuring val_bpb and
keeping/reverting experiments, autodesign captures screenshots, evaluates against
design judges, implements improvements, and loops until consecutive passes.

## Concept

```
Phase 1: PREFLIGHT (interactive, human present)
  ├── Understand the design target (what are we designing?)
  ├── Detect context: new design from scratch (→ Exploration phase) vs. iterating existing
  ├── IF new design from Figma:
  │   ├── How many explorations? (default: 10)
  │   └── Confirm Figma file / page to generate into
  ├── Choose capture method (Playwright / Chrome MCP / Maestro / XCUITest / Detox / Storybook)
  ├── Define viewports (mobile 390x844, desktop 1440x900, tablet, etc.)
  ├── Define design judges via /evals-first (LLM judges for subjective criteria)
  ├── Optional: Connect Figma source of truth via Figma MCP
  ├── Confirm deploy command (if applicable)
  └── User confirms → agent takes over

Phase 1.5: EXPLORATION — go wide (Figma new-design mode only)
  ├── Generate N distinct design concepts in Figma (default: 10)
  │   ├── Each concept gets its own named frame: "Exploration 01", "Exploration 02", …
  │   ├── Vary: layout structure, visual direction, tone, typographic voice
  │   └── Aim for genuine diversity — not 10 variations of the same idea
  ├── Get cross-model evaluation of all N designs
  │   ├── Claude: rank and score each design, explain top 3 picks
  │   └── Codex: independently rank and score each design, explain top 3 picks
  ├── Synthesize: which designs do BOTH models agree on?
  ├── Present ranked shortlist (top 3 by consensus) to the user with reasoning
  ├── User selects the direction (or asks for more explorations)
  └── Chosen concept becomes the baseline → continue to Phase 2 LOOP

Phase 2: LOOP — go deep (AFK, autonomous)
  ├── 1. Capture screenshots across all viewports
  ├── 2. Run design eval stack (critique → targeted skills → cross-model review)
  ├── 3. Prioritize findings (critical → high → medium → low)
  ├── 4. Implement top 3-5 fixes
  ├── 5. Deploy (if deploy command configured)
  ├── 6. Re-capture screenshots → verify fixes, check for regressions
  ├── 7. Commit with detailed message
  ├── 8. Each iteration saved as a named Figma frame (see Figma Organization)
  ├── 9. If converged (2+ consecutive no-change passes) → stop
  └── 10. Otherwise → loop to step 1

Phase 3: HANDOFF (waiting for human)
  ├── Design briefing in .autodesign/BRIEFING.md
  ├── Before/after screenshots in .autodesign/captures/
  ├── Figma organized with full exploration + iteration history
  └── Eval gap notes for next run
```

## Exploration Phase (Go Wide Before Going Deep)

When designing something **new** in Figma, autodesign runs an exploration phase before
the polish loop. The goal is divergence first — generate many distinct directions,
evaluate them with two independent models, then converge on the best one.

### How many explorations?

During preflight, ask:

> "How many design explorations should we generate before picking a direction?" (default: 10)

10 is the right number for most cases — enough variety to surface genuinely different
directions, not so many that evaluation becomes noise.

### Generating explorations

Each exploration is a standalone Figma frame. Use Figma MCP to create them:

1. Create a new Figma page called **"Explorations"** (keep existing pages intact)
2. Generate N frames named `Exploration 01` through `Exploration N`
3. For each exploration, genuinely vary:
   - Layout structure (single column vs. grid vs. editorial vs. asymmetric)
   - Visual direction (minimal, rich, typographic, illustrative, photo-forward)
   - Tone (serious/professional, playful/friendly, bold/aggressive, calm/trustworthy)
   - Typographic voice (display-led, body-text-led, oversized numerics, etc.)
   - Color approach (monochrome, brand accent, full palette, neutral + one pop)
4. Aim for diversity — 10 slight variations of the same idea is NOT the goal.
   If you notice yourself repeating a pattern, skip it and invent something different.

### Cross-model evaluation

Once all N explorations exist in Figma, run both models independently:

**Claude evaluation:**
Capture screenshots of all N frames. Ask Claude to:
- Score each design 1-10 across: hierarchy, distinctiveness, fit-for-purpose, polish potential
- Identify top 3 picks with specific reasoning
- Flag any explorations it would discard and why

**Codex evaluation:**
```bash
codex exec \
  -c model_reasoning_effort="xhigh" \
  "You are evaluating $(N) UI design explorations for [target]. Screenshots are at:
   .autodesign/captures/explorations/

   For each design, score it 1-10 on:
   - Visual hierarchy: does the eye go where it should?
   - Distinctiveness: does it avoid generic AI design clichés?
   - Fit-for-purpose: does the visual direction match the product's purpose?
   - Polish potential: how much work would it take to make this production-ready?

   Then rank your top 3 picks with specific reasoning.
   Format: RANK 1: Exploration XX — [reason]. RANK 2: ... RANK 3: ...
   Then list any you'd eliminate immediately and why." \
  2>&1 | tee .autodesign/codex-exploration-review.md
```

### Synthesis and selection

After both reviews:
1. Find consensus: which designs appear in BOTH models' top 3?
2. Rank by consensus score (average rank across both models)
3. Present the top 3 consensus picks to the user with:
   - Side-by-side reasoning from each model
   - What each direction would look like if taken to production
4. User selects one (or asks for more explorations in a different direction)

**If no consensus:** present top 2 from each model separately and let the user decide.

**If user wants more explorations:** generate another batch in the same Figma page
(`Exploration 11`–`Exploration 20`), run the same evaluation, add to the shortlist.

### Figma organization during exploration

```
Figma file
  └── Page: "Explorations"
        ├── [Section: "Round 1"]
        │     ├── Frame: "Exploration 01"
        │     ├── Frame: "Exploration 02"
        │     ├── …
        │     └── Frame: "Exploration 10"
        └── [Section: "Round 2"]  ← if more explorations requested
              ├── Frame: "Exploration 11"
              └── …
```

Winning exploration gets labeled `★ SELECTED` in its frame name.

## Figma Organization (Iteration History)

When going deep on the selected design, every iteration is preserved in Figma.
This creates a clear visual record of the design's progression.

### Page structure

```
Figma file
  ├── Page: "Explorations"       ← All N initial explorations (see above)
  ├── Page: "Iterations"         ← One frame per deep iteration
  │     ├── Frame: "v0 — Baseline"  (the chosen exploration, copied here)
  │     ├── Frame: "v1 — [key change]"
  │     ├── Frame: "v2 — [key change]"
  │     └── …
  └── Page: "Final"              ← Current best version (updated each iteration)
        └── Frame: "Final"
```

### Naming convention

Each iteration frame in the **Iterations** page is named descriptively:

```
v0 — Baseline
v1 — Tightened hierarchy, removed feature card grid
v2 — Dark CTA section → inline strip, footer contrast fix
v3 — Mobile hero padding, copy compression
v4 — CONVERGED (clean pass)
```

The name is written after the iteration completes — it summarizes the primary change,
not the process. This means reading down the Iterations page tells the design story.

### Laying out iteration frames

Arrange iteration frames left-to-right in chronological order on the Iterations page.
Space them with consistent gutters (e.g., 100px) so the progression is clear at a glance.
Include a small annotation below each frame with the date and key eval findings that drove the change.

### Updating the Final page

After each iteration, copy the latest design to the **Final** page and replace the
previous frame. The Final page always shows the current production-bound design.

### Never delete exploration frames

Explorations and earlier iterations must never be removed. They are the design audit trail.
Even discarded explorations stay — they show what was considered and rejected.

## Prerequisites

### Capture Method

Autodesign needs a way to see the UI. During preflight, detect or ask which method to use:

| Platform | Capture Method | Detection |
|----------|---------------|-----------|
| **Web (static/SSR)** | Playwright | `playwright` in deps, or `npx playwright` available |
| **Web (live browser)** | Chrome MCP | `mcp__claude-in-chrome__*` tools available |
| **Web (components)** | Storybook | `storybook` in deps, `.storybook/` dir |
| **iOS (Swift)** | XCUITest screenshots | `*.xcodeproj` with UI test targets |
| **iOS (Expo/RN)** | Maestro / Detox | `maestro` CLI or `detox` in deps |
| **React Native** | Detox | `detox` in package.json |
| **Figma (source)** | Figma MCP | `mcp__claude_ai_Figma__*` tools available |

Multiple capture methods can be combined (e.g., Playwright for web + Figma MCP for design source).

### Screenshot Capture Commands

```bash
# Playwright (web) — full page, multiple viewports
npx playwright screenshot --viewport-size=1440,900 --full-page <url> <output.png>
npx playwright screenshot --viewport-size=390,844 --full-page <url> <output.png>

# Chrome MCP (live browser) — via resize_window + screenshot
mcp__claude-in-chrome__resize_window(width, height, tabId)
mcp__claude-in-chrome__computer(action: "screenshot", tabId)

# XCUITest (iOS) — capture in test
let screenshot = app.screenshot()
let attachment = XCTAttachment(screenshot: screenshot)

# Maestro (iOS/Android)
maestro test flow.yaml  # with takeScreenshot commands

# Storybook — via test runner or Playwright against Storybook URL
npx playwright screenshot http://localhost:6006/iframe.html?id=<story> <output.png>
```

## Design Eval Stack

The eval stack runs in order. Each tier produces findings. Critical/high findings
must be fixed before the iteration is considered passing.

```
Tier 1: /critique (blocking)
  └── Holistic design critique: AI slop detection, hierarchy, composition,
      typography, color, emotional resonance, states, microcopy
  └── Returns prioritized issues with severity

Tier 2: Targeted impeccable skills (blocking for critical findings)
  └── Based on /critique findings, run the most relevant skill:
      ├── /typeset    — typography issues (hierarchy, readability, font choices)
      ├── /arrange    — layout, spacing, visual rhythm issues
      ├── /colorize   — color palette, contrast, purposeful color use
      ├── /clarify    — unclear copy, labels, error messages
      ├── /distill    — over-designed, needs simplification
      ├── /bolder     — too safe/boring, needs more impact
      ├── /quieter    — too aggressive, needs toning down
      ├── /animate    — missing motion, microinteractions
      ├── /harden     — error states, i18n, edge cases, overflow
      ├── /adapt      — responsive issues, cross-device problems
      ├── /polish     — final-pass alignment, consistency, details
      ├── /delight    — missing personality, joy, memorable touches
      ├── /onboard    — first-time UX, empty states, getting-started flow
      ├── /optimize   — performance, loading, rendering issues
      ├── /normalize  — design system inconsistency
      ├── /extract    — opportunities for reusable components/tokens
      └── /overdrive  — technically ambitious effects (shaders, physics, scroll-driven)
  └── Pick 1-3 skills per iteration based on what /critique surfaced

Tier 3: Cross-model consensus (advisory)
  └── Pass the screenshots + critique findings to both Claude and Codex
  └── Look for findings that BOTH models agree on (high confidence)
  └── Discard findings only one model flags (lower confidence)
  └── This replaces /codex-review's code focus with a design focus

Tier 4: Figma diff (optional, if Figma MCP available)
  └── Compare implementation screenshots against Figma source
  └── Flag visual deviations from the design spec
```

### Cross-Model Design Review

The cross-model review is the key differentiator from a simple /critique loop.
Two models reviewing the same screenshots catches more issues than one model
reviewing twice.

**Claude review (primary):**
Run /critique as a sub-agent with the screenshots.

**Codex review (cross-validation):**
```bash
# Build a design review prompt with screenshots encoded
codex exec \
  -c model_reasoning_effort="xhigh" \
  "Review these UI screenshots for design quality. Focus on:
   1. Visual hierarchy — does the eye flow to the most important element?
   2. Consistency — are spacing, colors, typography consistent?
   3. Mobile/responsive — does the mobile version work as well as desktop?
   4. AI slop — does this look like generic AI-generated design?
   5. Polish — alignment, spacing details, edge cases

   Screenshots are at: .autodesign/captures/current/

   Return findings as:
   CRITICAL: [issue] — FIX: [concrete fix]
   HIGH: [issue] — FIX: [concrete fix]
   MEDIUM: [issue] — FIX: [concrete fix]

   Only flag issues you are confident about." \
  2>&1 | tee .autodesign/codex-design-review.md
```

**Consensus filter:**
Only implement findings that BOTH models flag, OR that one model flags as CRITICAL.
This prevents churn from model-specific preferences.

## Design Judges (from /evals-first)

During preflight, define LLM judges for the project's specific design criteria.
These are more specific than /critique's general evaluation.

### Example Judge Prompts

```markdown
# Judge: Brand Consistency
Evaluate whether the UI matches the app's established visual identity.

## Criteria
- Uses the project's color palette (not generic blues/grays)
- Typography matches the app's font family and weight scale
- Interactive elements match the app's button/card/chip styles
- Spacing follows the app's rhythm (not generic 8px grid)

## Verdict
<eval>PASS</eval> or <eval>FAIL: specific deviation</eval>
```

```markdown
# Judge: Mobile Usability
Evaluate the mobile screenshot for touch-friendly design.

## Criteria
- Touch targets >= 44px
- No horizontal scroll (viewport fits content)
- Text is readable without zooming (>= 14px body)
- Primary action is visible without scrolling
- Forms stack vertically with full-width inputs

## Verdict
<eval>PASS</eval> or <eval>FAIL: specific issue</eval>
```

```markdown
# Judge: AI Slop Detection
Evaluate whether this looks like generic AI-generated design.

## Red Flags
- The blue-purple-pink gradient palette
- Gradient text on headings
- Dark mode with glowing neon accents
- Glassmorphism cards with blur
- Hero section with big metrics
- Identical card grids (3 cards, same height)
- Stock-illustration style decorations
- Generic sans-serif (Inter/Poppins with no personality)

## Verdict
<eval>PASS</eval> if distinctive, or <eval>FAIL: specific AI tells detected</eval>
```

Judges are stored in `.autodesign/judges/` and run as parallel sub-agents
against the captured screenshots.

## Convergence Detection

The loop stops when design quality has stabilized:

1. **Hard stop:** 2 consecutive iterations where /critique returns no critical or high issues
2. **Soft stop:** 5 total iterations completed (diminishing returns)
3. **Time stop:** Optional duration limit (e.g., "2 hours")

After convergence, write the handoff briefing and stop.

## Directory Structure

```
.autodesign/
  BRIEFING.md              ← Design briefing for human review
  config.json              ← Saved preflight config (capture method, viewports, etc.)
  judges/
    brand-consistency.md   ← LLM judge prompts
    mobile-usability.md
    ai-slop-detection.md
    custom-*.md            ← Project-specific judges
  captures/
    explorations/          ← Screenshots of all N exploration frames (new design only)
      exploration-01.png
      exploration-02.png
      ...
    baseline/              ← The selected exploration (start of deep iteration)
      desktop.png
      mobile.png
    iteration-1/
      desktop.png
      mobile.png
    iteration-2/
      ...
    current/               ← Latest screenshots (symlinked)
  codex-exploration-review.md  ← Cross-model exploration rankings (new design only)
  codex-design-review.md   ← Latest cross-model iteration review
  eval-gaps.md             ← Gaps found, feeds next run
```

**NEVER commit `.autodesign/` to git.** Add to `.gitignore` during preflight.

## Preflight Checklist

Interactive setup with the human. Formalize requirements into judges.

### Step 0: New design vs. iteration?

**This is the first question.** It determines whether the Exploration phase runs.

- **New design** — nothing exists yet, or the user wants to explore fresh directions.
  → Run Exploration phase (Phase 1.5) before the polish loop.
- **Iterating existing** — there's already a design (Figma, live app, or codebase).
  → Skip Exploration, go directly to Phase 2 LOOP.

If unclear, ask: *"Are we starting fresh or polishing something that already exists?"*

### Step 1: Understand the target

Ask:
- What are we designing? (landing page, app screen, component, full app)
- Is there a Figma source of truth? (if yes, connect via Figma MCP)
- What's the URL or entry point?
- What viewports matter? (default: mobile 390x844 + desktop 1440x900)

**If new design (from Step 0):**
- How many design explorations before picking a direction? (default: **10**)
- Which Figma file should explorations be created in? (create new file if none)
- Any non-negotiable constraints? (brand colors, typography, platform conventions)

### Step 2: Choose capture method

Auto-detect from the project, then confirm:
- Playwright available? → Use for static/SSR web
- Chrome MCP connected? → Use for live browser interaction
- Storybook running? → Use for component-level design
- iOS project? → Use XCUITest or Maestro
- React Native? → Use Detox or Maestro

### Step 3: Define design judges

Run `/evals-first` Phase 1-3 scoped to design criteria:

1. **Collect reference materials** — the app's existing design system, color palette,
   typography scale, component patterns. Read from the codebase or Figma.
2. **Distill into judge criteria** — concrete, evaluatable rules
3. **Write judge prompts** — store in `.autodesign/judges/`

Default judges (always included):
- AI Slop Detection
- Mobile Usability
- Visual Hierarchy

Project-specific judges (defined during preflight):
- Brand Consistency (if the app has an established visual identity)
- Design System Compliance (if a design system exists)
- Figma Fidelity (if Figma source is connected)

### Step 4: Capture baseline

Take screenshots before any changes. Store in `.autodesign/captures/baseline/`.
These are the "before" for the handoff briefing.

### Step 5: Confirm deploy

If the project can be deployed (e.g., Cloudflare Pages, Vercel):
- Confirm deploy command
- Confirm whether to deploy after each iteration or only at the end

### Step 6: Launch

Confirm everything with the user, then start the loop.

## Iteration Loop (Detail)

Each iteration follows this exact sequence:

```
1. CAPTURE
   - Run capture command for each viewport
   - Save to .autodesign/captures/iteration-N/
   - Update .autodesign/captures/current/ symlink

2. EVALUATE
   a. Run /critique on all screenshots
      → Produces prioritized issue list with severity
   b. Run design judges in parallel
      → Each returns PASS/FAIL with evidence
   c. Select 1-3 targeted impeccable skills based on findings
      → Run each, collect additional specific recommendations
   d. Run cross-model review (Claude + Codex)
      → Filter for consensus findings

3. PRIORITIZE
   - Merge all findings into a single list
   - Deduplicate (same issue from multiple sources = higher confidence)
   - Sort: CRITICAL > HIGH > MEDIUM > LOW
   - Select top 3-5 actionable fixes for this iteration
   - Skip LOW items unless nothing else to do

4. IMPLEMENT
   - Apply fixes directly to source code
   - For each fix, note what changed and why
   - Run any feedback commands (typecheck, lint, etc.)

5. VERIFY
   - Re-capture screenshots
   - Quick-check: did the fix actually work? Any regressions?
   - If regression: revert that specific fix, note it

6. DEPLOY (if configured)
   - Run deploy command
   - Wait for deployment to propagate

7. COMMIT
   - Stage changed files (specific paths, not git add .)
   - Commit with descriptive message listing what was fixed
   - Push to remote

8. CONVERGENCE CHECK
   - If /critique returned 0 critical + 0 high issues for 2 consecutive iterations → STOP
   - If iteration count >= 5 → STOP (diminishing returns)
   - If duration limit reached → STOP
   - Otherwise → loop to step 1
```

## Handoff Briefing

`.autodesign/BRIEFING.md` — written for the human, readable in 2 minutes:

```markdown
# Autodesign Briefing — 2026-03-29

## Summary
Ran 4 iterations. Converged after iteration 4 (2 consecutive clean passes).

## What changed
1. **Iteration 1** — Removed redundant feature cards section, dark CTA bookend,
   tighter section padding. (critique: page felt padded, generic bottom half)
2. **Iteration 2** — Compressed "How it works" into inline strip, dark footer
   for seamless bottom half. (critique: disconnected section, jarring footer transition)
3. **Iteration 3** — Removed screenshot heading, tighter language grid, mobile
   hero padding. (critique: redundant heading, sparse grid)
4. **Iteration 4** — No changes needed. Converged.

## Before / After
- Baseline: .autodesign/captures/baseline/
- Final: .autodesign/captures/iteration-4/

## Judge Results (final pass)
- AI Slop Detection: PASS
- Mobile Usability: PASS
- Visual Hierarchy: PASS
- Brand Consistency: PASS

## Remaining (not fixed)
- Page would benefit from an app mockup/screenshot in the hero (requires asset creation)
- "How it works" section is still the most generic part of the page

## Eval Gaps
- No judge for animation quality (waveform timing, easing)
- No judge for dark mode (page is light-only currently)
```

## Configuration

Autodesign can persist settings so you don't re-answer preflight questions:

**Location:** `.autodesign/config.json`

```json
{
  "target": "https://escuchame.app",
  "captureMethod": "playwright",
  "viewports": [
    { "name": "desktop", "width": 1440, "height": 900 },
    { "name": "mobile", "width": 390, "height": 844 }
  ],
  "deployCommand": "CLOUDFLARE_ACCOUNT_ID=xxx npx wrangler pages deploy ./apps/web/public --project-name=escuchame-web --commit-dirty=true",
  "feedbackCommands": [],
  "maxIterations": 5,
  "convergenceThreshold": 2,
  "figmaFileKey": null,
  "judges": ["ai-slop", "mobile-usability", "visual-hierarchy", "brand-consistency"],
  "exploration": {
    "enabled": false,
    "count": 10,
    "figmaFileKey": null,
    "figmaPageName": "Explorations",
    "selectedExploration": null
  }
}
```

## Git Rules

- **NEVER commit `.autodesign/` to git.** Add to `.gitignore` during preflight.
- Use specific file paths when staging (not `git add .`)
- Push after each iteration (don't accumulate commits locally)
- Commit messages should describe the design change, not the process

## Gotchas

- **Screenshots are static.** Playwright captures a frozen moment — animations, hover states,
  and transitions aren't visible. Use Chrome MCP for interactive evaluation when needed.
- **LLM judges can't see subtle alignment issues.** They're good at hierarchy, color, and
  composition but miss 1-2px alignment problems. /polish handles that.
- **Cross-model review adds latency.** Each iteration takes longer with Codex review.
  Skip it for trivial iterations (only CSS spacing changes).
- **Exploration diversity matters more than quantity.** 10 varied explorations beats 20
  slight variations. If you find yourself making minor adjustments across explorations,
  stop — invent a completely different visual direction instead.
- **Don't over-iterate.** 5 iterations is usually enough. After that you're shuffling
  preferences between models, not improving design quality.
- **Capture after deploy, not before.** CDN caching can serve stale content. Hard-refresh
  or add cache-busting to capture commands.
- **Dark mode needs separate captures.** If the app supports dark mode, capture both.
  Add dark mode viewports to the config.

## Composing with Other Skills

| Skill | How it composes |
|-------|----------------|
| **/critique** | Core of the eval stack — runs every iteration |
| **/evals-first** | Preflight judge definition |
| **/codex-review** | Cross-model consensus (design-focused variant) |
| **/nightshift** | Autodesign can run as a post-nightshift polish pass |
| **/teach-impeccable** | Run once before autodesign to establish design context |
| **/frontend-design** | Referenced by /critique for anti-pattern detection |
| **/dogfood** | Complementary — dogfood finds UX bugs, autodesign fixes visual quality |
| **/babysit-pr** | Run autodesign on preview deployments during PR review |

## Launching

### Interactive (recommended)

```
/autodesign
```

The skill runs preflight, then launches the loop.

### With options

```
/autodesign 3h                        — run for 3 hours max
/autodesign --skip-codex              — skip cross-model review (faster iterations)
/autodesign --figma <url>             — use Figma as source of truth
/autodesign --capture chrome-mcp      — force Chrome MCP capture instead of Playwright
/autodesign --explore                 — force exploration phase (go wide first, default: 10)
/autodesign --explore-count 20        — generate 20 explorations instead of default 10
/autodesign --skip-explore            — skip exploration phase, go straight to deep loop
```

### Re-run (skip preflight)

If `.autodesign/config.json` exists from a previous run:

```
/autodesign --resume
```

Loads saved config, skips preflight, starts the loop immediately.
