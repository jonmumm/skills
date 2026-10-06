#!/usr/bin/env bash
# Email Jon from a local routine (qa-agent, arch-agent) through the sre-notify Worker, authenticated
# with the local key in the Keychain (never printed).
#
#   notify-local.sh <payload.json>
#
# Payload: the Worker's sre shape {repo, runUrl, created, reopened, fixQueued, sourceErrors} or
# {kind:"arch-pr", event:"opened"|"revised", repo, runUrl:"local:<routine>", pr:{number,title,url}, summary}.
set -euo pipefail
payload="${1:?usage: notify-local.sh <payload.json>}"
key="$(security find-generic-password -s sre-notify-local-key -a "$USER" -w)"
status="$(curl -sS -o /dev/null -w '%{http_code}' -X POST https://sre-notify.jonathanrmumm.workers.dev/notify \
  -H "authorization: Bearer $key" -H 'content-type: application/json' --data @"$payload")"
case "$status" in
  202) echo "emailed Jon" ;;
  204) echo "nothing to email" ;;
  *) echo "sre-notify answered $status" >&2; exit 1 ;;
esac
