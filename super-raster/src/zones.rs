//! Zone-aggregate computation.
//!
//! Mirrors `zone_aggregates` in `process_flight.py`.
//!
//! Opens a GeoJSON FeatureCollection, reads each feature's `properties.id`
//! (falling back to FID), reprojects polygons to the ortho SRS, rasterises
//! the integer zone index onto a MEM dataset, then computes per-zone per-index
//! mean/min/max/stddev/pixel_count over valid finite pixels.

use std::path::Path;

use anyhow::{Context, Result};
use gdal::{
    raster::Buffer,
    spatial_ref::{AxisMappingStrategy, CoordTransform, SpatialRef},
    vector::LayerAccess,
    Dataset, DriverManager,
};

use crate::manifest::ZoneAggregate;
use crate::ortho::OrthoMeta;

/// Compute per-zone, per-index statistics.
///
/// Returns an empty `Vec` (with a stderr warning) if the zones file cannot
/// be opened, matching the Python fallback.
pub fn aggregate(
    zones_path: &Path,
    idx_arrays: &[(String, Vec<f32>)],
    ortho: &OrthoMeta,
) -> Result<Vec<ZoneAggregate>> {
    // --- Open the GeoJSON vector dataset ----------------------------------
    let vds = Dataset::open(zones_path)
        .with_context(|| format!("cannot open zones: {}", zones_path.display()))?;

    let mut lyr = vds.layer(0).context("zones file has no layers")?;

    // SRS for the zones layer (default EPSG:4326 if not tagged).
    let src_srs: SpatialRef = match lyr.spatial_ref() {
        Some(mut s) => {
            s.set_axis_mapping_strategy(AxisMappingStrategy::TraditionalGisOrder);
            s
        }
        None => {
            let mut s = SpatialRef::from_epsg(4326)?;
            s.set_axis_mapping_strategy(AxisMappingStrategy::TraditionalGisOrder);
            s
        }
    };

    let mut dst_srs =
        SpatialRef::from_wkt(&ortho.projection).context("invalid ortho projection WKT")?;
    dst_srs.set_axis_mapping_strategy(AxisMappingStrategy::TraditionalGisOrder);

    let ct = CoordTransform::new(&src_srs, &dst_srs)
        .context("cannot create coordinate transform for zones")?;

    // --- Collect features: reproject + build zone-id map -----------------
    // We rasterise using integer zone indices (1-based).  idmap[i] = zone_id.
    let mut geometries: Vec<gdal::vector::Geometry> = Vec::new();
    let mut burn_values: Vec<f64> = Vec::new();
    let mut idmap: Vec<String> = Vec::new(); // idmap[zone_idx-1] = zone_id

    for feature in lyr.features() {
        let geom = match feature.geometry() {
            Some(g) => g.clone(),
            None => continue,
        };

        // Reproject in-place (geom is already owned).
        let mut reprojected = geom;
        reprojected
            .transform_inplace(&ct)
            .context("failed to reproject zone geometry")?;

        // Prefer `properties.id`; fall back to FID string.
        let zone_id: String = feature
            .field_index("id")
            .ok()
            .and_then(|idx| feature.field(idx).ok().flatten())
            .and_then(|v| v.into_string())
            .unwrap_or_else(|| {
                feature
                    .fid()
                    .map_or_else(|| "0".to_string(), |f| f.to_string())
            });

        let zone_idx = (idmap.len() + 1) as f64; // 1-based
        idmap.push(zone_id);
        geometries.push(reprojected);
        burn_values.push(zone_idx);
    }

    if idmap.is_empty() {
        eprintln!("warning: zones file has no features; skipping aggregates");
        return Ok(vec![]);
    }

    // --- Rasterise zone indices onto a MEM Int32 label grid ---------------
    let label_grid = rasterize_zones(&geometries, &burn_values, ortho)?;

    // --- Compute statistics per zone per index ----------------------------
    let mut results: Vec<ZoneAggregate> = Vec::new();

    for (zone_idx_0, zone_id) in idmap.iter().enumerate() {
        let zone_label = (zone_idx_0 + 1) as i32;

        for (kind, arr) in idx_arrays {
            let vals: Vec<f32> = label_grid
                .iter()
                .enumerate()
                .filter_map(|(i, &lbl)| {
                    if lbl == zone_label && ortho.valid[i] {
                        let v = arr[i];
                        if v.is_finite() {
                            Some(v)
                        } else {
                            None
                        }
                    } else {
                        None
                    }
                })
                .collect();

            if vals.is_empty() {
                continue;
            }

            let n = vals.len() as f64;
            let mean = vals.iter().map(|&v| v as f64).sum::<f64>() / n;
            let min = vals.iter().cloned().fold(f32::INFINITY, f32::min) as f64;
            let max = vals.iter().cloned().fold(f32::NEG_INFINITY, f32::max) as f64;
            let variance = vals
                .iter()
                .map(|&v| {
                    let d = v as f64 - mean;
                    d * d
                })
                .sum::<f64>()
                / n;
            let stddev = variance.sqrt();

            results.push(ZoneAggregate {
                zone_id: zone_id.clone(),
                index_kind: kind.clone(),
                mean,
                min,
                max,
                stddev,
                pixel_count: vals.len(),
            });
        }
    }

    eprintln!(
        "zone aggregates: {} zones x {} indices -> {} rows",
        idmap.len(),
        idx_arrays.len(),
        results.len()
    );

    Ok(results)
}

/// Rasterise zone geometries (pre-reprojected into ortho SRS) onto a
/// flat `Vec<i32>` label grid using `GDALRasterizeLayers` with
/// `ATTRIBUTE=zoneidx` semantics, implemented by burning per-geometry
/// integer values via `GDALRasterizeGeometries`.
///
/// Returns a flat row-major `Vec<i32>` of length `width * height`.
fn rasterize_zones(
    geometries: &[gdal::vector::Geometry],
    burn_values: &[f64],
    ortho: &OrthoMeta,
) -> Result<Vec<i32>> {
    // Create a MEM dataset for the Int32 label raster.
    let mem_driver = DriverManager::get_driver_by_name("MEM")?;
    let mut label_ds = mem_driver
        .create_with_band_type::<i32, _>("", ortho.width, ortho.height, 1)
        .context("cannot create label MEM dataset")?;

    label_ds
        .set_geo_transform(&ortho.geo_transform)
        .context("cannot set geo-transform on label dataset")?;
    label_ds
        .set_projection(&ortho.projection)
        .context("cannot set projection on label dataset")?;

    // Burn each geometry with its zone index (1-based integer).
    // We use the high-level `rasterize` function which calls GDALRasterizeGeometries.
    gdal::raster::rasterize(&mut label_ds, &[1], geometries, burn_values, None)
        .context("GDALRasterizeGeometries failed for zone labels")?;

    // Read back the label band.
    let band = label_ds.rasterband(1).context("cannot access label band")?;
    let buf: Buffer<i32> = band
        .read_band_as::<i32>()
        .context("cannot read label band")?;

    Ok(buf.into_shape_and_vec().1)
}
