#!/usr/bin/env python3
"""VARI / GLI / ExG thesis spike.

Reads an RGB raster (GeoTIFF via tifffile, or JPG/PNG via imageio), computes the
three visible-band vegetation indices from the v0.1 spec, prints per-index stats,
and renders PNGs so the signal can be inspected by eye.

This is a *validation harness*, not the production pipeline. It deliberately uses
numpy rather than GDAL so the index math can be confirmed before the real
GDAL/Rust path exists. Run:  python indices.py <image> [outdir]
"""
import sys, os
import numpy as np

EPS = 1e-6


def load_rgb(path):
    """Return float32 H x W x 3 in 0..1, plus a valid-data mask."""
    ext = os.path.splitext(path)[1].lower()
    if ext in (".tif", ".tiff"):
        import tifffile
        a = tifffile.imread(path)
    else:
        import imageio.v3 as iio
        a = iio.imread(path)
    a = np.asarray(a)
    # normalise axis order to H x W x C
    if a.ndim == 3 and a.shape[0] in (3, 4) and a.shape[2] not in (3, 4):
        a = np.moveaxis(a, 0, -1)
    if a.ndim == 2:
        a = np.stack([a, a, a], axis=-1)
    c = a.shape[2]
    rgb = a[..., :3].astype(np.float32)
    # valid mask: drop alpha==0 and pure-black nodata borders
    valid = np.ones(rgb.shape[:2], bool)
    if c == 4:
        valid &= a[..., 3] > 0
    if np.issubdtype(a.dtype, np.integer):
        maxv = float(np.iinfo(a.dtype).max)
    else:
        maxv = float(rgb.max()) or 1.0
    rgb /= maxv
    valid &= rgb.sum(axis=-1) > (1.0 / maxv)  # not pure black
    return rgb, valid


def indices(rgb):
    R, G, B = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    vari = (G - R) / (G + R - B + EPS)
    gli = (2 * G - R - B) / (2 * G + R + B + EPS)
    tot = R + G + B + EPS
    r, g, b = R / tot, G / tot, B / tot
    exg = 2 * g - r - b
    return {"VARI": vari, "GLI": gli, "ExG": exg}


def summarize(name, arr, valid):
    v = arr[valid]
    v = v[np.isfinite(v)]
    pct = lambda p: float(np.percentile(v, p))
    print(f"  {name:5s}  n={v.size:>9,}  "
          f"min={v.min():+.3f}  p05={pct(5):+.3f}  median={pct(50):+.3f}  "
          f"p95={pct(95):+.3f}  max={v.max():+.3f}  mean={v.mean():+.3f}")
    return v


def render(path, rgb, valid, idx, outdir):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    os.makedirs(outdir, exist_ok=True)
    base = os.path.splitext(os.path.basename(path))[0]

    # true-colour reference
    disp = np.clip(rgb / max(np.percentile(rgb[valid], 99), EPS), 0, 1)
    plt.imsave(os.path.join(outdir, f"{base}_rgb.png"), disp)

    for name, arr in idx.items():
        a = arr.copy()
        v = a[valid][np.isfinite(a[valid])]
        lo, hi = np.percentile(v, 2), np.percentile(v, 98)
        a = np.clip((a - lo) / (hi - lo + EPS), 0, 1)
        a[~valid] = np.nan
        plt.figure(figsize=(7, 6))
        plt.imshow(a, cmap="RdYlGn")
        plt.title(f"{base} — {name}  (stretch {lo:+.2f}..{hi:+.2f})")
        plt.axis("off"); plt.colorbar(fraction=0.046)
        plt.tight_layout()
        plt.savefig(os.path.join(outdir, f"{base}_{name}.png"), dpi=90)
        plt.close()

    # simple vegetation mask off ExG (threshold at mean as a first cut)
    exg = idx["ExG"]; ev = exg[valid]
    thr = float(np.nanmean(ev) + 0.0)
    veg = (exg > thr) & valid
    frac = veg.sum() / max(valid.sum(), 1)
    mask_img = np.zeros(rgb.shape, np.float32)
    mask_img[veg] = (0.1, 0.8, 0.2)
    mask_img[valid & ~veg] = (0.6, 0.45, 0.3)
    plt.imsave(os.path.join(outdir, f"{base}_vegmask.png"), np.clip(mask_img, 0, 1))
    return thr, frac


def main():
    if len(sys.argv) < 2:
        print("usage: python indices.py <image> [outdir]"); sys.exit(1)
    path = sys.argv[1]
    outdir = sys.argv[2] if len(sys.argv) > 2 else "out"
    rgb, valid = load_rgb(path)
    print(f"loaded {path}: {rgb.shape[1]}x{rgb.shape[0]} px, "
          f"{valid.sum()/valid.size*100:.1f}% valid pixels")
    idx = indices(rgb)
    print("index distributions (valid pixels only):")
    for name, arr in idx.items():
        summarize(name, arr, valid)
    thr, frac = render(path, rgb, valid, idx, outdir)
    print(f"vegetation mask (ExG>{thr:+.3f}): {frac*100:.1f}% of valid pixels classed vegetated")
    print(f"PNGs written to {outdir}/")


if __name__ == "__main__":
    main()
