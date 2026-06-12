//! Manifest types serialised to stdout — must match the Zod schema in
//! `apps/api/src/lib/processor.ts`.

use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct IndexEntry {
    pub index_kind: String,
    pub raster_path: String,
    pub overlay_png: String,
    pub bounds_4326: [f64; 4],
    pub display_stretch: [f64; 2],
}

#[derive(Debug, Serialize)]
pub struct ZoneAggregate {
    pub zone_id: String,
    pub index_kind: String,
    pub mean: f64,
    pub min: f64,
    pub max: f64,
    pub stddev: f64,
    pub pixel_count: usize,
}

#[derive(Debug, Serialize)]
pub struct Manifest {
    pub flight_id: String,
    pub width: usize,
    pub height: usize,
    pub bounds_4326: [f64; 4],
    pub indices: Vec<IndexEntry>,
    pub zone_aggregates: Vec<ZoneAggregate>,
}
