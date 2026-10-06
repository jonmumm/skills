#!/bin/zsh
# Serves the game's `wrangler dev` over HTTPS on the LAN with an mkcert certificate, so iOS Safari
# allows motion sensors (shake) and screen wake lock, and phones/iPads/Chromecast can reach it.
# Run from the game repo:   PORT=8795 ~/src/skills/game-rig/scripts/dev-https.sh
#   PORT        wrangler port (default 8787)
#   PERSIST_TO  own wrangler state dir, so it can run next to `pnpm dev` (e.g. .wrangler/state-https)
#   DRY_RUN=1   print what would run, change nothing
set -euo pipefail

PORT="${PORT:-8787}"
HOST="$(scutil --get LocalHostName 2>/dev/null || hostname -s).local"
IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo 127.0.0.1)"
STAMP="certs/.names"
NAMES="$HOST $IP localhost 127.0.0.1"
CMD=(pnpm exec wrangler dev --ip 0.0.0.0 --port "$PORT" --local-protocol https --https-key-path certs/key.pem --https-cert-path certs/cert.pem)
[[ -n "${PERSIST_TO:-}" ]] && CMD+=(--persist-to "$PERSIST_TO")

if [[ -n "${DRY_RUN:-}" ]]; then
  echo "certs for: $NAMES"
  echo "TV: https://$HOST:$PORT/"
  echo "run: ${CMD[*]}"
  exit 0
fi

mkdir -p certs
if [[ ! -f certs/cert.pem || "$(cat $STAMP 2>/dev/null)" != "$NAMES" ]]; then
  mkcert -cert-file certs/cert.pem -key-file certs/key.pem ${=NAMES}
  echo "$NAMES" > "$STAMP"
fi

echo
echo "  TV (open on this laptop):  https://$HOST:$PORT/"
echo "  Root CA for phones:        $(mkcert -CAROOT)/rootCA.pem"
echo
exec "${CMD[@]}"
