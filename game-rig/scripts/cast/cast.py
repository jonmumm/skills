#!/usr/bin/env python3
"""game-rig cast: see castlib.py. Run with the rig's venv: scripts/cast/setup-venv.sh once."""
import sys

import castlib

if __name__ == "__main__":
    sys.exit(castlib.main(sys.argv[1:]))
