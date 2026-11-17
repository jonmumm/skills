"""Make a texture tile seamlessly, or check whether it does.

  python3 -I tileable.py in.png out.png [--band 0.25] [--preview repeat2x2.png]
  python3 -I tileable.py --check in.png        # exit 1 if the wrap seam shows

Image models say "seamless" but rarely wrap (a local Qwen cobblestone: edge-wrap difference 1.4x
the interior's). Per axis, this blends the image with a copy rolled by half its size inside a band
at the edges: the edges come from the rolled copy (which wraps, because its edges were the
original's interior), the centre stays the original (so the rolled copy's seam is never shown).
Size is unchanged. Cross-fading softens detail in the band; keep the band small, and generate the
texture "flat top-down, even lighting, no vignette" so the two halves match in tone.
"""
import sys

import numpy as np
from PIL import Image

LIMIT = 1.3  # wrap difference / interior neighbour difference that still reads as seamless


def seam_ratio(a: np.ndarray) -> float:
    """Wrap difference over the neighbour difference right beside it (both edges), per axis.
    Local on purpose: a blended band lowers the image-wide average and would bias a global ratio."""
    a = a.astype(float)

    def axis_ratio(b: np.ndarray) -> float:  # compares columns
        wrap = np.abs(b[:, -1] - b[:, 0]).mean()
        near = (np.abs(b[:, 1] - b[:, 0]).mean() + np.abs(b[:, -1] - b[:, -2]).mean()) / 2
        return wrap / max(near, 1e-6)

    return max(axis_ratio(a), axis_ratio(a.swapaxes(0, 1)))


def blend_axis(a: np.ndarray, axis: int, band: float) -> np.ndarray:
    n = a.shape[axis]
    rolled = np.roll(a, n // 2, axis=axis)
    d = np.minimum(np.arange(n), n - 1 - np.arange(n)) / max(band * n, 1)  # 0 at edges
    w = np.clip(d, 0, 1)
    w = w * w * (3 - 2 * w)  # smoothstep
    shape = [1] * a.ndim
    shape[axis] = n
    w = w.reshape(shape)
    return a * w + rolled * (1 - w)


def make_tileable(a: np.ndarray, band: float) -> np.ndarray:
    out = blend_axis(a.astype(float), 1, band)
    out = blend_axis(out, 0, band)
    return np.clip(out.round(), 0, 255).astype(np.uint8)


def main(argv: list[str]) -> int:
    args = [x for x in argv]
    if args and args[0] == "--check":
        im = Image.open(args[1])
        r = seam_ratio(np.asarray(im.convert("RGBA" if im.mode == "RGBA" else "RGB")))
        print(f"seam ratio {r:.2f} ({'tiles' if r <= LIMIT else 'visible seam'}; limit {LIMIT})")
        return 0 if r <= LIMIT else 1
    band = float(args[args.index("--band") + 1]) if "--band" in args else 0.25
    preview = args[args.index("--preview") + 1] if "--preview" in args else None
    pos = [x for i, x in enumerate(args) if not x.startswith("--") and (i == 0 or args[i - 1] not in ("--band", "--preview"))]
    if len(pos) != 2:
        print(__doc__, file=sys.stderr)
        return 2
    src, dst = pos
    im = Image.open(src)
    mode = "RGBA" if im.mode == "RGBA" else "RGB"
    out = make_tileable(np.asarray(im.convert(mode)), band)
    Image.fromarray(out, mode).save(dst)
    print(f"{dst}: seam ratio {seam_ratio(np.asarray(im.convert(mode))):.2f} -> {seam_ratio(out):.2f}")
    if preview:
        Image.fromarray(np.tile(out, (2, 2, 1)), mode).save(preview)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
