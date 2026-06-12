//! super-raster — Rust flight processor for visible-band vegetation indices.
//!
//! This is a faithful port of `processor/process_flight.py`. It mirrors that
//! script's CLI, pipeline, and JSON manifest output exactly so the Node API
//! (`apps/api/src/lib/processor.ts`) can use it as a drop-in replacement.
//!
//! Manifest contract: see `processor.ts` and the Zod schema therein.
//! VARI guard: `|G+R-B| < 0.05` → nodata (see project memory
//! `vari-numerical-instability`).

mod indices;
mod manifest;
mod ortho;
mod overlay;
mod zones;

use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use clap::Parser;

use manifest::{IndexEntry, Manifest};

#[derive(Parser, Debug)]
#[command(author, version, about = "Vegetation-index flight processor")]
struct Args {
    /// Path to the RGB(A) orthomosaic GeoTIFF.
    #[arg(long)]
    ortho: PathBuf,

    /// Output directory (created if absent).
    #[arg(long)]
    out: PathBuf,

    /// Optional GeoJSON FeatureCollection of zone polygons.
    #[arg(long)]
    zones: Option<PathBuf>,

    /// Flight identifier echoed into the manifest.
    #[arg(long, default_value = "")]
    flight_id: String,
}

fn main() -> Result<()> {
    let args = Args::parse();

    std::fs::create_dir_all(&args.out)
        .with_context(|| format!("cannot create output dir: {}", args.out.display()))?;

    // --- 1. Read ortho --------------------------------------------------
    let (ortho, rgb) = ortho::read(&args.ortho)
        .with_context(|| format!("failed to open ortho: {}", args.ortho.display()))?;

    // --- 2. Compute indices (consumes rgb, dropping band vecs) ----------
    // Mirrors Python's `del R, G, B` after compute_indices: the raw ~3×N×4 B
    // of band memory is freed before zone aggregation runs.
    let idx_arrays = indices::compute(&ortho, rgb);

    // --- 3. Bounds in EPSG:4326 -----------------------------------------
    let bounds = ortho::bounds_4326(&ortho).context("failed to compute bounds_4326")?;

    // --- 4. Write GeoTIFFs + overlay PNGs, collect manifest entries ------
    let mut index_entries: Vec<IndexEntry> = Vec::new();
    for (kind, arr) in &idx_arrays {
        let tif_path = args.out.join(format!("{kind}.tif"));
        let png_path = args.out.join(format!("{kind}.png"));

        ortho::write_gtiff(&tif_path, arr, &ortho)
            .with_context(|| format!("failed to write GeoTIFF for {kind}"))?;

        let stretch = overlay::write_png(&png_path, arr, &ortho.valid, ortho.width, ortho.height)
            .with_context(|| format!("failed to write PNG overlay for {kind}"))?;

        eprintln!(
            "  {kind}: tif+png written, display stretch {:+.3}..{:+.3}",
            stretch[0], stretch[1]
        );

        index_entries.push(IndexEntry {
            index_kind: kind.clone(),
            raster_path: abs_path(&tif_path),
            overlay_png: abs_path(&png_path),
            bounds_4326: bounds,
            display_stretch: stretch,
        });
    }

    // --- 5. Zone aggregates (optional) -----------------------------------
    let zone_aggregates = if let Some(ref zones_path) = args.zones {
        zones::aggregate(zones_path, &idx_arrays, &ortho).unwrap_or_else(|e| {
            eprintln!("warning: zone aggregates failed: {e:#}; skipping");
            vec![]
        })
    } else {
        vec![]
    };

    // --- 6. Emit manifest to stdout (ONLY) -------------------------------
    let manifest = Manifest {
        flight_id: args.flight_id,
        width: ortho.width,
        height: ortho.height,
        bounds_4326: bounds,
        indices: index_entries,
        zone_aggregates,
    };

    let json = serde_json::to_string_pretty(&manifest).context("failed to serialise manifest")?;
    println!("{json}");

    Ok(())
}

/// Canonicalise path to an absolute string (best-effort; falls back to display).
fn abs_path(p: &Path) -> String {
    std::fs::canonicalize(p)
        .unwrap_or_else(|_| p.to_path_buf())
        .to_string_lossy()
        .into_owned()
}
