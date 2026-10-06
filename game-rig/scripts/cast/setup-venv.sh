#!/bin/zsh
# Creates game-rig/.venv with pychromecast (never the user's conda base). Idempotent.
set -euo pipefail
RIG="${0:A:h:h:h}"
VENV="$RIG/.venv"
if [[ ! -x "$VENV/bin/python" ]]; then
  if command -v uv >/dev/null; then uv venv --quiet "$VENV"; else /usr/bin/python3 -m venv "$VENV"; fi
fi
if ! "$VENV/bin/python" -c "import pychromecast" 2>/dev/null; then
  if command -v uv >/dev/null; then uv pip install --quiet --python "$VENV/bin/python" "pychromecast>=14"; else "$VENV/bin/pip" install --quiet "pychromecast>=14"; fi
fi
echo "$VENV/bin/python"
