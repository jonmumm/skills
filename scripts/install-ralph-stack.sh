#!/usr/bin/env bash
# Install agent skills + curated companion skills. Ensures required CLIs
# (Linear, Codex, Claude Code) and Playwright MCP in Codex config.
#
# Usage:
#   ./scripts/install-ralph-stack.sh [--global] [--full] [--yes]
#   --global (or -g): install skills to user global dir (default).
#   --project (or -p): install to current project only.
#   --full (or -f):   also offer react-best-practices, skill-creator, etc.
#   --yes (or -y):    non-interactive: use defaults (skip CLI installs, install recommended companions).
set -euo pipefail

GLOBAL=(-g -y)
FULL=false
YES=false
for arg in "${@:-}"; do
  case "$arg" in
    --global|-g) GLOBAL=(-g -y) ;;
    --project|-p) GLOBAL=(-y) ;;
    --full|-f)    FULL=true ;;
    --yes|-y)     YES=true ;;
  esac
done

# --- Helpers ---
cmd_exists() { command -v "$1" &>/dev/null; }
ask() {
  local prompt="$1" default="${2:-n}"
  if [[ "$YES" == true ]]; then
    [[ "$default" == y || "$default" == Y ]]
    return
  fi
  local answer
  read -r -p "$prompt " answer
  answer="${answer:-$default}"
  [[ "$answer" =~ ^[yY] ]]
}

# --- 1. Required CLIs (install if missing) ---
echo "=== CLIs (Linear, Codex, Claude Code) ==="
echo ""

# Linear CLI: @linear/cli provides `lin`
if cmd_exists lin || cmd_exists linear; then
  echo "[OK] Linear CLI found ($(command -v lin 2>/dev/null || command -v linear))"
else
  if ask "Linear CLI not found. Install via npm? (y/n)" n; then
    npm install -g @linear/cli && echo "  → Use 'lin' for issue/branch commands."
  else
    echo "  Skip. Install later: npm i -g @linear/cli (command: lin)"
  fi
fi

# Codex CLI
if cmd_exists codex; then
  echo "[OK] Codex CLI found ($(command -v codex))"
else
  if ask "Codex CLI not found. Install? (y/n)" n; then
    npm install -g @openai/codex
  else
    echo "  Skip. Install later: npm i -g @openai/codex"
  fi
fi

# Claude Code CLI
if cmd_exists claude; then
  echo "[OK] Claude Code CLI found ($(command -v claude))"
else
  if ask "Claude Code CLI not found. Install? (y/n)" n; then
    if [[ "$(uname -s)" == "Darwin" ]] || [[ "$(uname -s)" == "Linux" ]]; then
      curl -fsSL https://claude.ai/install.sh | bash
    else
      echo "  Install manually: https://claude.ai or brew install --cask claude-code"
    fi
  else
    echo "  Skip. Install later: curl -fsSL https://claude.ai/install.sh | bash"
  fi
fi

# --- 2. Playwright MCP in Codex config ---
echo ""
echo "=== Playwright MCP (Codex) ==="
CODEX_CONFIG="${CODEX_CONFIG:-$HOME/.codex/config.toml}"
PLAYWRIGHT_MCP='[mcp_servers.playwright]
command = "npx"
args = ["-y", "@playwright/mcp@latest"]
'

if grep -q '\[mcp_servers\.playwright\]' "$CODEX_CONFIG" 2>/dev/null; then
  echo "[OK] Playwright MCP already in Codex config ($CODEX_CONFIG)"
else
  add_playwright() {
    mkdir -p "$(dirname "$CODEX_CONFIG")"
    echo "$PLAYWRIGHT_MCP" >> "$CODEX_CONFIG"
    echo "[OK] Added Playwright MCP to $CODEX_CONFIG"
  }
  if [[ "$YES" == true ]]; then
    add_playwright
  elif ask "Add Playwright MCP to Codex config ($CODEX_CONFIG)? (y/n)" y; then
    add_playwright
  else
    echo "  Skip. Later: add [mcp_servers.playwright] with command = \"npx\", args = [\"-y\", \"@playwright/mcp@latest\"]"
  fi
fi

# --- 3. This repo's skills ---
echo ""
echo "=== Core skills (this repo) ==="
npx skills add jonmumm/skills --all "${GLOBAL[@]}"

# --- 4. TDD & Testing Companions ---
echo ""
echo "=== TDD & Testing Companions ==="
echo ""

# TDD (vertical slices, red-green-refactor) — ralph-tdd relies on this
if ask "mattpocock/skills@tdd (TDD: vertical slices, red-green-refactor)? (y/n)" y; then
  npx skills add mattpocock/skills@tdd "${GLOBAL[@]}"
fi

# Vitest
if ask "antfu/skills@vitest (Vitest guidance for TDD loop)? (y/n)" y; then
  npx skills add antfu/skills@vitest "${GLOBAL[@]}"
fi

# E2E patterns
if ask "wshobson/agents@e2e-testing-patterns (E2E/Playwright patterns)? (y/n)" y; then
  npx skills add wshobson/agents@e2e-testing-patterns "${GLOBAL[@]}"
fi

# --- 5. Knowledge Infrastructure (supports create-agents-md) ---
echo ""
echo "=== Knowledge Infrastructure (acceptance tests, ADRs) ==="
echo "Powers the docs/ structure that create-agents-md generates."
echo ""

# Gherkin writing (for docs/acceptance/ feature files)
if ask "jzallen/fred_simulations@bdd-gherkin-specification (Gherkin writing guidance; recommended)? (y/n)" y; then
  npx skills add jzallen/fred_simulations@bdd-gherkin-specification "${GLOBAL[@]}"
fi

# ADR writing (for docs/adrs/ decision records)
if ask "existential-birds/beagle@adr-writing (Architectural Decision Records; recommended)? (y/n)" y; then
  npx skills add existential-birds/beagle@adr-writing "${GLOBAL[@]}"
fi

# Playwright BDD (for generating Playwright tests from Gherkin — web projects)
if ask "thebushidocollective/han@playwright-bdd-gherkin-syntax (Gherkin → Playwright test generation)? (y/n)" n; then
  npx skills add thebushidocollective/han@playwright-bdd-gherkin-syntax "${GLOBAL[@]}"
fi

# --- 6. Linear CLI skill (required for ralph-dogfooding) ---
echo ""
echo "=== Linear CLI skill ==="
npx skills add https://github.com/schpet/linear-cli --skill linear-cli "${GLOBAL[@]}"

# --- 7. Full extras ---
if [[ "$FULL" == true ]]; then
  echo ""
  echo "=== Additional Skills (--full) ==="

  if ask "vercel-labs/agent-skills@react-best-practices (React/Next perf)? (y/n)" n; then
    npx skills add vercel-labs/agent-skills@react-best-practices "${GLOBAL[@]}"
  fi
  if ask "vercel-labs/agent-skills@skill-creator (creating skills)? (y/n)" n; then
    npx skills add vercel-labs/agent-skills@skill-creator "${GLOBAL[@]}"
  fi
  if ask "vercel-labs/agent-skills@vercel-composition-patterns (React component refactoring / composition)? (y/n)" n; then
    npx skills add vercel-labs/agent-skills@vercel-composition-patterns "${GLOBAL[@]}"
  fi
  if ask "prd-creator (PRD + task JSON backlog)? (y/n)" n; then
    npx skills add vercel-labs/agent-skills@prd-creator "${GLOBAL[@]}" 2>/dev/null || true
  fi
  if ask "frontend-code-review (structured .tsx/.ts review)? (y/n)" n; then
    npx skills add vercel-labs/agent-skills@frontend-code-review "${GLOBAL[@]}" 2>/dev/null || true
  fi
  if ask "frontend-testing (Vitest + RTL component/hook tests)? (y/n)" n; then
    npx skills add vercel-labs/agent-skills@frontend-testing "${GLOBAL[@]}" 2>/dev/null || true
  fi
fi

echo ""
echo "Done."
echo ""
echo "Next steps:"
echo "  1. Run 'create-agents-md' in your project to bootstrap the knowledge structure"
echo "  2. The skill will detect installed companions and wire them into AGENTS.md"
echo "  3. Use 'swarm' to launch parallel agents, or 'ralph-tdd' for a single TDD loop"
echo ""
