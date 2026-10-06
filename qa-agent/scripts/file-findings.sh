#!/usr/bin/env bash
# File a verified qa-agent findings batch as GitHub issues, from this Mac, through the sre-agent runtime:
# one issue per bug, updates instead of duplicates, mute by closing as "not planned", reopen on regression.
#
#   file-findings.sh <repo-dir> <batch.json> [--dry]
#
# Reads <repo-dir>/qa/qa-agent.yml. Uses Jon's own gh login (never printed). --dry writes nothing.
set -euo pipefail

RUNTIME="$(cd "$(dirname "$0")/../../sre-agent/runtime" && pwd)"
repo_dir="${1:?usage: file-findings.sh <repo-dir> <batch.json> [--dry]}"
batch="$(cd "$(dirname "${2:?usage: file-findings.sh <repo-dir> <batch.json> [--dry]}")" && pwd)/$(basename "$2")"
shift 2

config="$repo_dir/qa/qa-agent.yml"
[ -f "$config" ] || { echo "Missing $config (copy qa-agent/templates/qa-agent.config.yml)." >&2; exit 1; }
[ -d "$RUNTIME/node_modules" ] || (cd "$RUNTIME" && pnpm install --frozen-lockfile --silent)

remote="$(git -C "$repo_dir" remote get-url origin)"
slug="$(printf '%s' "$remote" | sed -E 's#.*github\.com[:/]##; s#\.git$##')"

# Email through sre-notify with the local key when it exists (see sre-agent/scripts/notify-local.sh).
SRE_NOTIFY_KEY="$(security find-generic-password -s sre-notify-local-key -a "$USER" -w 2>/dev/null || true)"
export SRE_NOTIFY_KEY
export SRE_RUN_LABEL="${SRE_RUN_LABEL:-qa-agent daily}"

GITHUB_TOKEN="$(gh auth token)" \
GITHUB_REPOSITORY="$slug" \
GITHUB_ACTION_PATH="$RUNTIME" \
QA_FINDINGS_FILE="$batch" \
  node "$RUNTIME/src/main.ts" --config "$config" "$@"
