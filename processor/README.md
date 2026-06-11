# processor — Phase-1 flight processor

`process_flight.py` is the v0.1 **Phase-1** vegetation-index processor. It is the
GDAL-based stand-in for the future Rust `super-raster` binary (v0.2); the API calls
it identically — as a subprocess that emits a JSON manifest — so swapping in Rust
later is a drop-in.

## What it does
Given an RGB drone orthomosaic (+ optionally the parcel's zones), it:
1. Computes the visible-band indices **VARI / GLI / ExG**.
2. Writes one full-resolution GeoTIFF + one downsampled colorized overlay PNG per index.
3. Computes per-zone aggregate stats (mean/min/max/stddev/pixel_count).
4. Prints a JSON **manifest to stdout** (progress to stderr). It performs **no DB
   writes** — the Hono API parses the manifest and is the single writer.

### VARI guard
VARI's denominator `(G + R − B)` crosses zero on real orthos and throws pixels to
±1e5, which corrupts zone means. The processor masks `|denominator| < 0.05` to nodata
and clips VARI to `[-1, 1]`. GLI and ExG are bounded and need no guarding. Validated
on a true-color ag ortho (`spikes/vari-thesis/`): VARI max clips at 1.0 with no
outlier spray. See project memory `vari-numerical-instability`.

## Dependencies
Uses the **system** Python with GDAL's bindings (not the spike venv):
- `gdal` 3.12+ with `python3-gdal` (provides `osgeo`)
- `numpy`

Install on Fedora: `sudo dnf install -y gdal python3-gdal` (numpy via pip/dnf).

## Usage
```
python3 process_flight.py --ortho ortho.tif --out OUTDIR [--zones zones.geojson] [--flight-id ID]
```
`--zones` is a GeoJSON FeatureCollection; each feature needs `properties.id`
(the `zones.id` uuid, echoed back in `zone_aggregates[].zone_id`) and a polygon
geometry in EPSG:4326.

## Manifest (stdout)
```jsonc
{
  "flight_id": "string", "width": 16423, "height": 11782,
  "bounds_4326": [west, south, east, north],
  "indices": [
    { "index_kind": "vari|gli|exg", "raster_path": "…/vari.tif",
      "overlay_png": "…/vari.png", "bounds_4326": [w,s,e,n], "display_stretch": [lo,hi] }
  ],
  "zone_aggregates": [
    { "zone_id": "<uuid>", "index_kind": "vari|gli|exg",
      "mean": 0.15, "min": -0.12, "max": 1.0, "stddev": 0.13, "pixel_count": 1574050 }
  ]
}
```
Invoked from the API by `apps/api/src/lib/processor.ts` (`runProcessor`) →
`apps/api/src/lib/ingest.ts` (`processFlight`).
