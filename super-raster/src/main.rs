//! super-raster — Phase-2 Rust replacement for the Python flight processor.
//!
//! Build-spike only: confirm the `gdal` crate links against the system GDAL and
//! can open a real ortho. If this builds + runs, we proceed to the full impl
//! (VARI/GLI/ExG + per-zone aggregates + JSON manifest, matching process_flight.py).
//! If the crate rejects GDAL 3.12, that's the session-1 tripwire → stay on Python.
use std::path::Path;

use gdal::Dataset;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let path = std::env::args()
        .nth(1)
        .ok_or("usage: super-raster <ortho.tif>")?;
    let ds = Dataset::open(Path::new(&path))?;
    let (w, h) = ds.raster_size();
    println!("opened {path}: {w}x{h}, {} bands", ds.raster_count());
    println!("projection: {}", ds.projection());
    if let Ok(gt) = ds.geo_transform() {
        println!("geotransform: {gt:?}");
    }
    Ok(())
}
