#!/bin/bash
set -uo pipefail
# NOTE: no `set -e` — we don't want one failed iteration to kill the loop

# ─── autodesign.sh ────────────────────────────────────────────────────────────
# Autonomous Figma design iteration loop. Each iteration spawns a fresh Claude
# subprocess — no context bleed, preserved history via Iterations page.
#
# Usage:
#   autodesign.sh --figma-file <fileKey> --working-frame <nodeId> \
#                 --target "description" [--iterations N] [--wide]
#
# --wide     Prioritize diverse directions over refining one (go wide before deep)
# ──────────────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

FIGMA_FILE=""
WORKING_FRAME=""
TARGET=""
MAX_ITERATIONS="${MAX_ITERATIONS:-10}"
WIDE_MODE="false"

# ─── Parse Arguments ──────────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
  case "$1" in
    --figma-file)    FIGMA_FILE="$2"; shift 2 ;;
    --working-frame) WORKING_FRAME="$2"; shift 2 ;;
    --target)        TARGET="$2"; shift 2 ;;
    --iterations)    MAX_ITERATIONS="$2"; shift 2 ;;
    --wide)          WIDE_MODE="true"; shift ;;
    *)
      echo "Usage: $0 --figma-file <key> --working-frame <nodeId> --target \"description\" [--iterations N] [--wide]"
      exit 1
      ;;
  esac
done

if [[ -z "$FIGMA_FILE" || -z "$WORKING_FRAME" || -z "$TARGET" ]]; then
  echo "Error: --figma-file, --working-frame, and --target are required."
  echo "Usage: $0 --figma-file <key> --working-frame <nodeId> --target \"description\" [--iterations N] [--wide]"
  exit 1
fi

RUN_ID="$(date '+%Y-%m-%dT%H-%M')"
AUTODESIGN_DIR=".autodesign"
RUN_DIR="$AUTODESIGN_DIR/runs/$RUN_ID"
STATE_FILE="$AUTODESIGN_DIR/state.json"
HEARTBEAT="$AUTODESIGN_DIR/HEARTBEAT"
START_TIME="$(date '+%Y-%m-%d %H:%M')"

# ─── Setup ────────────────────────────────────────────────────────────────────

mkdir -p "$RUN_DIR/logs"
mkdir -p "$AUTODESIGN_DIR/captures"

# Initialize state file if starting fresh
if [[ ! -f "$STATE_FILE" ]]; then
  cat > "$STATE_FILE" <<EOF
{
  "figmaFile": "$FIGMA_FILE",
  "workingFrame": "$WORKING_FRAME",
  "target": "$TARGET",
  "iteration": 0,
  "lastSummary": "No iterations yet.",
  "iterationsPageId": null,
  "weaknesses": [],
  "strengths": [],
  "convergence": 0.0
}
EOF
fi

echo "$(date '+%H:%M:%S') | STARTING | setting up autodesign loop" > "$HEARTBEAT"

# Initialize progress log for this run
cat > "$RUN_DIR/progress.md" <<EOF
# Autodesign Run — $RUN_ID

Figma File: $FIGMA_FILE
Working Frame: $WORKING_FRAME
Target: $TARGET
Wide Mode: $WIDE_MODE

EOF

# ─── Cleanup ──────────────────────────────────────────────────────────────────

cleanup() {
  echo ""
  echo "========================================================"
  echo "  Autodesign ending..."
  echo "========================================================"
  END_TIME="$(date '+%Y-%m-%d %H:%M')"
  echo "" >> "$RUN_DIR/progress.md"
  echo "---" >> "$RUN_DIR/progress.md"
  echo "Started: $START_TIME · Ended: $END_TIME" >> "$RUN_DIR/progress.md"
  echo ""
  echo "State:     $STATE_FILE"
  echo "Heartbeat: $HEARTBEAT"
  echo "Logs:      $RUN_DIR/logs/"
  echo "Figma:     https://www.figma.com/design/$FIGMA_FILE"
  echo "(Open the 'Iterations' page to review design history)"
}
trap cleanup EXIT

# ─── Build Per-Iteration Agent Prompt ────────────────────────────────────────

build_prompt() {
  local iteration="$1"

  local wide_guidance=""
  if [[ "$WIDE_MODE" == "true" ]]; then
    wide_guidance="WIDE MODE: Prioritize exploring dramatically different directions over polishing
what's already there. Bold swings only — different layout structure, different
visual metaphor, different color strategy, different hierarchy. Don't just tweak.

After implementing changes, rate how different your direction was from the prior
state: 1 (minor polish) to 5 (completely different direction). Aim for 3-4+."
  else
    wide_guidance="REFINE MODE: Focus on identifying and fixing the most impactful problems
with the current design direction. Incremental improvement over dramatic change."
  fi

  cat <<PROMPT
You are the Autodesign agent — iteration $iteration of $MAX_ITERATIONS.

You have access to:
  - Figma MCP tools: mcp__claude_ai_Figma__*
  - Chrome browser tools: mcp__claude-in-chrome__* (load via ToolSearch first)

FIGMA FILE KEY: $FIGMA_FILE
WORKING FRAME NODE ID: $WORKING_FRAME
DESIGN TARGET: $TARGET
STATE FILE: $(pwd)/$STATE_FILE
HEARTBEAT: $(pwd)/$HEARTBEAT

$wide_guidance

===================================================================
HEARTBEAT — write after EVERY significant action
===================================================================

  echo "HH:MM | ITER $iteration/$MAX_ITERATIONS | STEP: what you're doing" > $(pwd)/$HEARTBEAT

===================================================================
STEP 1: READ STATE
===================================================================

Read $(pwd)/$STATE_FILE. Understand:
- What has already been done (lastSummary, iteration count)
- Current weaknesses to fix
- Strengths to preserve
- The iterationsPageId (if Iterations page already exists)

===================================================================
STEP 2: SCREENSHOT CURRENT STATE
===================================================================

Call mcp__claude_ai_Figma__get_screenshot with:
  fileKey: "$FIGMA_FILE"
  nodeId: "$WORKING_FRAME"

Also call mcp__claude_ai_Figma__get_design_context with:
  fileKey: "$FIGMA_FILE"
  nodeId: "$WORKING_FRAME"

Study what you see. Update heartbeat with a quick assessment.

===================================================================
STEP 3: CRITIQUE THE DESIGN
===================================================================

Analyze the screenshot and design context. Be specific:

- Visual hierarchy: where does the eye go first? Is that right?
- Typography: is there clear distinction between levels?
- Spacing: consistent and intentional, or accidental?
- Color: purposeful, or slapped on everywhere?
- Content: real and specific, or placeholder-feeling?
- AI slop check: 3-equal-card grids? Generic icons? Oversaturated accents?
- Does this serve the target: "$TARGET"?

List the top 3-5 problems ordered by impact. Be concrete ("the hero headline
is the same size as the subheadline" not "hierarchy could be improved").

===================================================================
STEP 4 ⚠️  CRITICAL: COPY TO ITERATIONS PAGE BEFORE ANY CHANGES
===================================================================

You MUST do this before touching the Working frame. No exceptions.

4a. Check if Iterations page exists. Run via mcp__claude_ai_Figma__use_figma:

\`\`\`javascript
// top-level await required — do NOT wrap in async function without awaiting it
const pages = figma.root.children;
const p = pages.find(p => p.name === "Iterations");
p ? "exists:" + p.id : "missing";
\`\`\`

4b. If missing, create it:

\`\`\`javascript
const page = figma.createPage();
page.name = "Iterations";
page.id;
\`\`\`

Save the page ID to $(pwd)/$STATE_FILE under "iterationsPageId".

4c. Duplicate the Working frame to the Iterations page. Name it:
    "v$iteration — {4-8 word summary of what you're about to change}"

\`\`\`javascript
const workingFrame = await figma.getNodeByIdAsync("$WORKING_FRAME");
const clone = workingFrame.clone();
const iterPage = figma.root.children.find(p => p.name === "Iterations");
iterPage.appendChild(clone);
clone.name = "v$iteration — your summary here";
// Stack horizontally so frames don't overlap
clone.x = ($iteration - 1) * (clone.width + 80);
clone.y = 0;
clone.id;
\`\`\`

Only proceed to Step 5 after confirming the clone exists in Iterations.

===================================================================
STEP 5: IMPLEMENT CHANGES ON WORKING FRAME
===================================================================

Modify the Working frame (node: $WORKING_FRAME) to fix the problems
identified in Step 3.

FIGMA MCP RULES:
- Top-level await ONLY — never wrap in async function without awaiting it
- Load fonts before any text: await figma.loadFontAsync({family: "Inter", style: "Regular"})
- Get nodes: await figma.getNodeByIdAsync("nodeId")
- For text auto-resize: t.textAutoResize = 'HEIGHT'; t.resize(width, 50);
- For colors: node.fills = [{type:'SOLID', color:{r,g,b}}]  (r/g/b are 0-1 floats)
- setPluginData is NOT supported — do not use it
- Batch your changes into one or two use_figma calls to reduce round-trips

===================================================================
STEP 6: VERIFY
===================================================================

Take a post-change screenshot:
  mcp__claude_ai_Figma__get_screenshot (same fileKey + nodeId)

Did the changes land? Does it look better? If something looks broken,
fix it now before updating state.

===================================================================
STEP 7: UPDATE STATE FILE
===================================================================

Write updated JSON to $(pwd)/$STATE_FILE:

{
  "figmaFile": "$FIGMA_FILE",
  "workingFrame": "$WORKING_FRAME",
  "target": "$TARGET",
  "iteration": $iteration,
  "lastSummary": "one sentence describing what changed in v$iteration",
  "iterationsPageId": "<the page node id>",
  "weaknesses": ["remaining problem 1", "remaining problem 2"],
  "strengths": ["thing that's working and should be preserved"],
  "convergence": 0.0
}

Set "convergence" to 0.0-1.0 (how close the design is to the target).

===================================================================
STEP 8: SIGNAL
===================================================================

If convergence >= 0.85 AND iteration >= 5, or this is the last iteration:
  Output: <promise>COMPLETE</promise>

If you cannot access Figma or something is broken:
  Output: <promise>BLOCKED:specific reason</promise>

If you need a human decision before continuing:
  Output: <promise>DECIDE:your question</promise>

Otherwise, output nothing — the loop will run the next iteration.
PROMPT
}

# ─── Banner ───────────────────────────────────────────────────────────────────

echo "╔══════════════════════════════════════════════════════╗"
echo "║              AUTODESIGN DISPATCHER                  ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║  Figma File:     $FIGMA_FILE"
echo "║  Working Frame:  $WORKING_FRAME"
echo "║  Iterations:     $MAX_ITERATIONS"
echo "║  Wide Mode:      $WIDE_MODE"
echo "║  Run ID:         $RUN_ID"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "Target: $TARGET"
echo ""

# ─── Main Loop ────────────────────────────────────────────────────────────────

ITERATION=0
FAILURES=0
SIGIL_COMPLETE="<promise>COMPLETE</promise>"

while [[ "$ITERATION" -lt "$MAX_ITERATIONS" ]]; do
  ITERATION=$((ITERATION + 1))
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Autodesign Iteration $ITERATION / $MAX_ITERATIONS"
  echo "  $(date '+%Y-%m-%d %H:%M:%S')"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""

  PROMPT_FILE="$(mktemp)"
  build_prompt "$ITERATION" > "$PROMPT_FILE"
  ITER_LOG="$RUN_DIR/logs/iteration-$ITERATION.log"
  ITER_START="$(date '+%s')"
  > "$ITER_LOG"

  echo "  ▶ Streaming agent output (also logged to $ITER_LOG)"
  echo "  ────────────────────────────────────────────────────"
  echo ""

  (env -u CLAUDECODE claude -p --dangerously-skip-permissions \
    --max-turns 60 \
    < "$PROMPT_FILE" 2>&1) | tee -a "$ITER_LOG" || true
  rm -f "$PROMPT_FILE"

  OUTPUT="$(cat "$ITER_LOG")"

  ITER_ELAPSED=$(( $(date '+%s') - ITER_START ))
  echo ""
  echo "  ────────────────────────────────────────────────────"
  echo "  Iteration $ITERATION complete (${ITER_ELAPSED}s)"
  if [[ -f "$HEARTBEAT" ]]; then
    echo "  ❤  $(cat "$HEARTBEAT")"
  fi
  if [[ -f "$STATE_FILE" ]] && command -v python3 &>/dev/null; then
    CONVERGENCE="$(python3 -c "import json; d=json.load(open('$STATE_FILE')); print(d.get('convergence','?'))" 2>/dev/null || echo "?")"
    LAST_SUMMARY="$(python3 -c "import json; d=json.load(open('$STATE_FILE')); print(d.get('lastSummary',''))" 2>/dev/null || echo "")"
    echo "  Convergence: $CONVERGENCE"
    [[ -n "$LAST_SUMMARY" ]] && echo "  ↳ $LAST_SUMMARY"
  fi
  echo ""

  # Append to progress log
  LAST_SUMMARY="${LAST_SUMMARY:-}"
  echo "## Iteration $ITERATION — $(date '+%H:%M:%S')" >> "$RUN_DIR/progress.md"
  echo "${LAST_SUMMARY}" >> "$RUN_DIR/progress.md"
  echo "" >> "$RUN_DIR/progress.md"

  # Check signals
  if echo "$OUTPUT" | grep -qF "$SIGIL_COMPLETE"; then
    echo ""
    echo "=== Design converged! Autodesign complete after $ITERATION iterations. ==="
    break
  fi

  if echo "$OUTPUT" | grep -qF "<promise>BLOCKED:"; then
    REASON="$(echo "$OUTPUT" | grep -oE '<promise>BLOCKED:[^<]+</promise>' | head -1 | sed 's|<promise>BLOCKED:||;s|</promise>||' || echo "unknown")"
    echo ""
    echo "=== BLOCKED: $REASON ==="
    echo "Fix the issue and re-run. Logs: $RUN_DIR/logs/iteration-$ITERATION.log"
    break
  fi

  if echo "$OUTPUT" | grep -qF "<promise>DECIDE:"; then
    QUESTION="$(echo "$OUTPUT" | grep -oE '<promise>DECIDE:[^<]+</promise>' | head -1 | sed 's|<promise>DECIDE:||;s|</promise>||' || echo "see logs")"
    echo ""
    echo "=== NEEDS HUMAN DECISION ==="
    echo "    $QUESTION"
    echo "Re-run after deciding."
    break
  fi

  # Track empty output failures
  if [[ -z "$OUTPUT" ]]; then
    FAILURES=$((FAILURES + 1))
    echo "WARNING: Empty output (failure #$FAILURES)"
    if [[ "$FAILURES" -ge 3 ]]; then
      echo "ERROR: 3 consecutive failures, stopping."
      break
    fi
  else
    FAILURES=0
  fi

  sleep 5
done

echo ""
echo "=== Autodesign finished after $ITERATION iteration(s) ==="
echo "=== Review Iterations page in Figma: https://www.figma.com/design/$FIGMA_FILE ==="
