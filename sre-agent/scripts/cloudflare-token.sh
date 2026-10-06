#!/usr/bin/env bash
# The Cloudflare API token sre-agent reads Workers Logs with (Account → Workers Observability: Edit,
# one account). Kept in the macOS Keychain; never printed, never in argv or history.
#
#   cloudflare-token.sh store            paste a new token (hidden input) into the Keychain
#   cloudflare-token.sh sync [repo ...]  push it to GitHub: the open-game-system org secret (public repos)
#                                        plus a repo secret + CLOUDFLARE_ACCOUNT_ID variable on each private
#                                        or personal repo that runs sre-agent (or on the repos you name)
#   cloudflare-token.sh status           when the stored token was saved, and the org secret's date
#
# After rolling the token in Cloudflare (API Tokens → the token → Roll): store, then sync.
set -euo pipefail

SERVICE="sre-cloudflare-api-token"
SECRET="SRE_CLOUDFLARE_API_TOKEN"
ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-ccf4d9a0a3b76ffae0b6ee048de66f07}"
ORG="open-game-system"
OWNERS=(jonmumm open-game-system)

token() { security find-generic-password -s "$SERVICE" -a "$USER" -w; }

case "${1:-}" in
  store)
    echo "Paste the Cloudflare API token, then press Return (input is hidden)."
    security add-generic-password -U -s "$SERVICE" -a "$USER" -j "saved $(date +%Y-%m-%d)" -w
    echo "Saved to the Keychain as '$SERVICE'. Next: $0 sync"
    ;;
  sync)
    shift
    token >/dev/null || { echo "No token in the Keychain. Run: $0 store" >&2; exit 1; }
    if [ "$#" -gt 0 ]; then
      repos=("$@")
    else
      if token | gh secret set "$SECRET" --org "$ORG" --visibility all \
        && gh variable set CLOUDFLARE_ACCOUNT_ID --org "$ORG" --visibility all --body "$ACCOUNT_ID"; then
        echo "set org secret + CLOUDFLARE_ACCOUNT_ID on $ORG (used by its public repos)"
      else
        echo "Could not set the $ORG org secret. If gh asked for the admin:org scope, run:" >&2
        echo "  gh auth refresh -h github.com -s admin:org" >&2
        echo "then sync again. Continuing with repo secrets." >&2
      fi
      owner_args=()
      for o in "${OWNERS[@]}"; do owner_args+=(--owner "$o"); done
      repos=()
      while IFS= read -r r; do
        [ -n "$r" ] && [ "$r" != "jonmumm/skills" ] || continue   # skills only holds the templates
        vis=$(gh api "repos/$r" --jq .visibility)
        # Free plans: only public org repos can read org secrets; private and personal repos need their own.
        if [ "$vis" = "private" ] || [[ "$r" == jonmumm/* ]]; then repos+=("$r"); fi
      done < <(gh search code "$SECRET" --filename sre-agent.yml "${owner_args[@]}" --json repository --jq '.[].repository.nameWithOwner' | sort -u)
    fi
    for r in ${repos[@]+"${repos[@]}"}; do
      token | gh secret set "$SECRET" --repo "$r" \
        && gh variable set CLOUDFLARE_ACCOUNT_ID --repo "$r" --body "$ACCOUNT_ID" \
        && echo "set repo secret + CLOUDFLARE_ACCOUNT_ID on $r"
    done
    ;;
  status)
    security find-generic-password -s "$SERVICE" -a "$USER" 2>/dev/null | grep -E '"icmt"|"mdat"' || echo "No token stored."
    gh secret list --org "$ORG" 2>/dev/null | grep "$SECRET" || true
    ;;
  *)
    sed -n '2,11p' "$0"
    exit 1
    ;;
esac
