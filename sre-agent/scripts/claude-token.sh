#!/usr/bin/env bash
# The Claude subscription token (from `claude setup-token`, valid about a year) for every repo that runs
# sre-agent's fix job or arch-agent. Kept in the macOS Keychain; never printed, never in argv or history.
#
#   claude-token.sh store            paste a new token (hidden input) into the Keychain
#   claude-token.sh sync [repo ...]  push it to GitHub: the open-game-system org secret (public repos)
#                                    plus a repo secret on each private or personal repo that uses
#                                    anthropics/claude-code-action (or on the repos you name)
#   claude-token.sh status           when the stored token was saved, and where it was last synced
set -euo pipefail

SERVICE="claude-code-oauth-token"
SECRET="CLAUDE_CODE_OAUTH_TOKEN"
ORG="open-game-system"
OWNERS=(jonmumm open-game-system)

token() { security find-generic-password -s "$SERVICE" -a "$USER" -w; }

case "${1:-}" in
  store)
    echo "Paste the token printed by 'claude setup-token', then press Return (input is hidden)."
    security add-generic-password -U -s "$SERVICE" -a "$USER" -j "saved $(date +%Y-%m-%d); expires about a year later" -w
    echo "Saved to the Keychain as '$SERVICE'. Next: $0 sync"
    ;;
  sync)
    shift
    token >/dev/null || { echo "No token in the Keychain. Run: $0 store" >&2; exit 1; }
    if [ "$#" -gt 0 ]; then
      repos=("$@")
    else
      token | gh secret set "$SECRET" --org "$ORG" --visibility all
      echo "set org secret on $ORG (used by its public repos)"
      owner_args=()
      for o in "${OWNERS[@]}"; do owner_args+=(--owner "$o"); done
      repos=()
      while IFS= read -r r; do
        [ -n "$r" ] && [ "$r" != "jonmumm/skills" ] || continue   # skills only holds the templates
        vis=$(gh api "repos/$r" --jq .visibility)
        if [ "$vis" = "private" ] || [[ "$r" == jonmumm/* ]]; then repos+=("$r"); fi
      done < <(gh search code "anthropics/claude-code-action" "${owner_args[@]}" --json repository --jq '.[].repository.nameWithOwner' | sort -u)
    fi
    for r in ${repos[@]+"${repos[@]}"}; do
      token | gh secret set "$SECRET" --repo "$r" && echo "set repo secret on $r"
    done
    ;;
  status)
    security find-generic-password -s "$SERVICE" -a "$USER" 2>/dev/null | grep -E '"icmt"|"mdat"' || echo "No token stored."
    gh secret list --org "$ORG" 2>/dev/null | grep "$SECRET" || true
    ;;
  *)
    sed -n '2,10p' "$0"
    exit 1
    ;;
esac
