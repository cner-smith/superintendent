#!/usr/bin/env python3
"""Phase-1 flight processor — the GDAL stand-in for the future Rust `super-raster`.

Given an RGB drone orthomosaic (and optionally the parcel's zones), this computes
the visible-band vegetation indices VARI / GLI / ExG, writes one GeoTIFF + one
colorized overlay PNG per index, computes per-zone aggregate statistics, and emits
a JSON manifest on **stdout**. It performs NO database writes — the Hono API parses
the manifest and is the single writer (architecture rule from the v0.1 spec).

VARI is numerically unstable: its denominator (G + R − B) crosses zero on real
orthos and throws pixels to ±1e5, corrupting zone means. We mask |denominator| <
DEN_GUARD to nodata and clip to [-1, 1]. GLI and ExG have bounded denominators and
need no guarding. See project memory `vari-numerical-instability`.

Usage:
    process_flight.py --ortho ortho.tif --out DIR [--zones zones.geojson] [--flight-id ID]

stdout: JSON manifest. stderr: human-readable progress.
Exit non-zero on failure (Hono marks the flight `failed`).
"""
import argparse
import json
import os
import sys

import numpy as np
from osgeo import gdal, ogr, osr

gdal.UseExceptions()

NODATA = -9999.0
DEN_GUARD = 0.05          # VARI denominator guard (see memory: vari-numerical-instability)
OVERLAY_MAX_PX = 2048     # longest edge of the display PNG; GeoTIFFs stay full-res
INDEX_KINDS = ("vari", "gli", "exg")


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def _traditional(srs):
    srs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    return srs


def read_rgb(path):
    ds = gdal.Open(path)
    if ds is None:
        raise SystemExit(f"cannot open ortho: {path}")
    if ds.RasterCount < 3:
        raise SystemExit(f"ortho has {ds.RasterCount} bands; need >=3 (RGB)")
    R = ds.GetRasterBand(1).ReadAsArray().astype(np.float32)
    G = ds.GetRasterBand(2).ReadAsArray().astype(np.float32)
    B = ds.GetRasterBand(3).ReadAsArray().astype(np.float32)
    valid = np.ones(R.shape, bool)
    if ds.RasterCount >= 4:                       # alpha channel = nodata mask
        valid &= ds.GetRasterBand(4).ReadAsArray() > 0
    maxv = 255.0                                  # assume 8-bit RGB ortho
    R /= maxv; G /= maxv; B /= maxv
    valid &= (R + G + B) > (1.0 / maxv)           # drop pure-black borders
    gt, proj = ds.GetGeoTransform(), ds.GetProjection()
    log(f"ortho {ds.RasterXSize}x{ds.RasterYSize}, {ds.RasterCount} bands, "
        f"{valid.mean()*100:.1f}% valid")
    return R, G, B, valid, gt, proj, ds.RasterXSize, ds.RasterYSize


def compute_indices(R, G, B, valid):
    eps = 1e-6
    den = G + R - B
    vari = np.where(np.abs(den) < DEN_GUARD, np.nan, (G - R) / np.where(den == 0, eps, den))
    vari = np.clip(vari, -1.0, 1.0)
    gli = (2 * G - R - B) / (2 * G + R + B + eps)
    tot = R + G + B + eps
    r, g, b = R / tot, G / tot, B / tot
    exg = 2 * g - r - b
    out = {"vari": vari, "gli": gli.astype(np.float32), "exg": exg.astype(np.float32)}
    for k, a in out.items():
        a = a.astype(np.float32)
        a[~valid] = np.nan
        out[k] = a
    return out


def write_gtiff(path, arr, gt, proj):
    h, w = arr.shape
    ds = gdal.GetDriverByName("GTiff").Create(
        path, w, h, 1, gdal.GDT_Float32, options=["COMPRESS=DEFLATE", "TILED=YES"]
    )
    ds.SetGeoTransform(gt)
    ds.SetProjection(proj)
    band = ds.GetRasterBand(1)
    band.WriteArray(np.where(np.isfinite(arr), arr, NODATA).astype(np.float32))
    band.SetNoDataValue(NODATA)
    ds.FlushCache()


def bounds_4326(gt, w, h, proj):
    src = _traditional(osr.SpatialReference()); src.ImportFromWkt(proj)
    dst = _traditional(osr.SpatialReference()); dst.ImportFromEPSG(4326)
    ct = osr.CoordinateTransformation(src, dst)
    xs = (gt[0], gt[0] + w * gt[1])
    ys = (gt[3], gt[3] + h * gt[5])
    pts = [ct.TransformPoint(x, y) for x in xs for y in ys]
    lons = [p[0] for p in pts]; lats = [p[1] for p in pts]
    return [min(lons), min(lats), max(lons), max(lats)]


def colorize_png(path, arr, valid):
    """Downsampled red→yellow→green RGBA overlay for the web map."""
    step = max(1, int(max(arr.shape) / OVERLAY_MAX_PX))
    a = arr[::step, ::step]
    v = valid[::step, ::step]
    fin = np.isfinite(a) & v
    lo, hi = (-1.0, 1.0) if fin.sum() == 0 else (
        float(np.percentile(a[fin], 2)), float(np.percentile(a[fin], 98)))
    norm = np.clip((a - lo) / (hi - lo + 1e-6), 0, 1)
    norm = np.where(fin, norm, 0.0)              # avoid NaN→uint8 cast warning
    rgba = np.zeros((a.shape[0], a.shape[1], 4), np.uint8)
    rgba[..., 0] = np.clip(2 * (1 - norm), 0, 1) * 255   # red at low
    rgba[..., 1] = np.clip(2 * norm, 0, 1) * 255         # green at high
    rgba[..., 3] = np.where(fin, 180, 0)                 # transparent where nodata
    mem = gdal.GetDriverByName("MEM").Create("", a.shape[1], a.shape[0], 4, gdal.GDT_Byte)
    for i in range(4):
        mem.GetRasterBand(i + 1).WriteArray(rgba[..., i])
    gdal.GetDriverByName("PNG").CreateCopy(path, mem)
    return [lo, hi]


def zone_aggregates(zones_path, indices, gt, proj, valid):
    vds = gdal.OpenEx(zones_path, gdal.OF_VECTOR)
    if vds is None:
        log(f"warning: could not open zones {zones_path}; skipping aggregates")
        return []
    lyr = vds.GetLayer(0)
    src = lyr.GetSpatialRef() or _traditional(osr.SpatialReference())
    if lyr.GetSpatialRef() is None:
        src.ImportFromEPSG(4326)
    _traditional(src)
    dst = _traditional(osr.SpatialReference()); dst.ImportFromWkt(proj)
    ct = osr.CoordinateTransformation(src, dst)

    mem = gdal.GetDriverByName("MEM").Create("", 0, 0, 0, gdal.GDT_Unknown)
    mlyr = mem.CreateLayer("z", dst, ogr.wkbPolygon)
    mlyr.CreateField(ogr.FieldDefn("zoneidx", ogr.OFTInteger))
    idmap = {}
    for i, feat in enumerate(lyr, 1):
        geom = feat.GetGeometryRef()
        if geom is None:
            continue
        geom = geom.Clone()
        geom.Transform(ct)
        zid = feat.GetField("id") if feat.GetFieldIndex("id") >= 0 else str(feat.GetFID())
        nf = ogr.Feature(mlyr.GetLayerDefn())
        nf.SetField("zoneidx", i)
        nf.SetGeometry(geom)
        mlyr.CreateFeature(nf)
        idmap[i] = zid

    h, w = valid.shape
    label_ds = gdal.GetDriverByName("MEM").Create("", w, h, 1, gdal.GDT_Int32)
    label_ds.SetGeoTransform(gt)
    label_ds.SetProjection(proj)
    gdal.RasterizeLayer(label_ds, [1], mlyr, options=["ATTRIBUTE=zoneidx"])
    labels = label_ds.GetRasterBand(1).ReadAsArray()

    results = []
    for i, zid in idmap.items():
        mask = (labels == i) & valid
        for kind, arr in indices.items():
            vals = arr[mask]
            vals = vals[np.isfinite(vals)]
            if vals.size == 0:
                continue
            results.append({
                "zone_id": zid, "index_kind": kind,
                "mean": float(vals.mean()), "min": float(vals.min()),
                "max": float(vals.max()), "stddev": float(vals.std()),
                "pixel_count": int(vals.size),
            })
    log(f"zone aggregates: {len(idmap)} zones x {len(indices)} indices -> {len(results)} rows")
    return results


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ortho", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--zones", help="GeoJSON FeatureCollection of zones (props: id, kind)")
    ap.add_argument("--flight-id", default="")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    R, G, B, valid, gt, proj, w, h = read_rgb(args.ortho)
    indices = compute_indices(R, G, B, valid)
    del R, G, B
    bnds = bounds_4326(gt, w, h, proj)

    manifest_indices = []
    for kind, arr in indices.items():
        tif = os.path.join(args.out, f"{kind}.tif")
        png = os.path.join(args.out, f"{kind}.png")
        write_gtiff(tif, arr, gt, proj)
        stretch = colorize_png(png, arr, valid)
        manifest_indices.append({
            "index_kind": kind, "raster_path": tif, "overlay_png": png,
            "bounds_4326": bnds, "display_stretch": stretch,
        })
        log(f"  {kind}: tif+png written, display stretch {stretch[0]:+.3f}..{stretch[1]:+.3f}")

    zagg = zone_aggregates(args.zones, indices, gt, proj, valid) if args.zones else []

    json.dump({
        "flight_id": args.flight_id, "width": w, "height": h, "bounds_4326": bnds,
        "indices": manifest_indices, "zone_aggregates": zagg,
    }, sys.stdout, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
