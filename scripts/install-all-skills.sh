#!/usr/bin/env bash
# Install all skills from this repo only (no CLIs, no MCP, no companion skills).
#
# Usage:
#   ./scripts/install-all-skills.sh [--global|--project]
#   --global (or -g):  install to user global skills dir (default)
#   --project (or -p): install to current project only
set -euo pipefail

GLOBAL=(-g -y)
for arg in "${@:-}"; do
  case "$arg" in
    --global|-g)  GLOBAL=(-g -y) ;;
    --project|-p) GLOBAL=(-y) ;;
  esac
done

echo "=== Installing all skills from this repo ==="
npx skills add jonmumm/skills --all "${GLOBAL[@]}"
echo ""
echo "Done."
