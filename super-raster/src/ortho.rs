//! Ortho reading, GeoTIFF writing, and coordinate helpers.
//!
//! Mirrors the `read_rgb`, `write_gtiff`, and `bounds_4326` functions in
//! `process_flight.py`.

use std::path::Path;

use anyhow::{anyhow, bail, Context, Result};
use gdal::{
    raster::{Buffer, RasterCreationOptions},
    spatial_ref::{AxisMappingStrategy, CoordTransform, SpatialRef},
    Dataset, DriverManager,
};

const NODATA: f64 = -9999.0;
const NODATA_F32: f32 = -9999.0;

/// Ortho metadata: everything needed after the RGB bands have been consumed.
///
/// `write_gtiff`, `bounds_4326`, `overlay::write_png`, and `zones::aggregate`
/// all operate on this struct; the raw band vecs live only in [`OrthoRgb`].
pub struct OrthoMeta {
    /// Boolean validity mask: `true` where pixel should be processed.
    pub valid: Vec<bool>,
    /// Raster width in pixels.
    pub width: usize,
    /// Raster height in pixels.
    pub height: usize,
    /// GDAL GeoTransform `[x_origin, px_w, rot_x, y_origin, rot_y, px_h]`.
    pub geo_transform: [f64; 6],
    /// WKT projection string from the source dataset.
    pub projection: String,
}

/// Raw RGB band data for the orthomosaic, normalised to `[0, 1]`.
///
/// Consumed by [`crate::indices::compute`] and dropped immediately after so
/// the ~3 × N × 4 bytes of band memory are freed before zone aggregation.
pub struct OrthoRgb {
    /// Red channel.
    pub r: Vec<f32>,
    /// Green channel.
    pub g: Vec<f32>,
    /// Blue channel.
    pub b: Vec<f32>,
}

/// Open and read an RGB(A) orthomosaic.
///
/// Returns `(OrthoMeta, OrthoRgb)` so the caller can drop [`OrthoRgb`] as
/// soon as the index arrays have been computed, mirroring the Python `del R,G,B`.
///
/// Bands 1/2/3 → R/G/B normalised ÷255.
/// Band 4 (alpha, if present) provides the nodata mask; pixels where
/// alpha=0 are excluded.  Pure-black pixels (R+G+B ≤ 1/255) are also
/// excluded to drop camera-edge fill.
pub fn read(path: &Path) -> Result<(OrthoMeta, OrthoRgb)> {
    let ds = Dataset::open(path)?;

    let band_count = ds.raster_count();
    if band_count < 3 {
        bail!("ortho has {} bands; need >=3 (RGB)", band_count);
    }

    let (width, height) = ds.raster_size();
    let n = width * height;

    // Read bands as u8 then cast; avoids a second allocation.
    let read_band_u8 = |idx: usize| -> Result<Vec<u8>> {
        let band = ds.rasterband(idx)?;
        let buf: Buffer<u8> = band.read_band_as::<u8>()?;
        Ok(buf.into_shape_and_vec().1)
    };

    let r_u8 = read_band_u8(1)?;
    let g_u8 = read_band_u8(2)?;
    let b_u8 = read_band_u8(3)?;

    // Alpha mask (band 4 if present).
    let mut valid: Vec<bool> = if band_count >= 4 {
        let alpha = read_band_u8(4)?;
        alpha.iter().map(|&a| a > 0).collect()
    } else {
        vec![true; n]
    };

    // Normalise to [0,1].
    let inv = 1.0_f32 / 255.0;
    let r: Vec<f32> = r_u8.iter().map(|&v| f32::from(v) * inv).collect();
    let g: Vec<f32> = g_u8.iter().map(|&v| f32::from(v) * inv).collect();
    let b: Vec<f32> = b_u8.iter().map(|&v| f32::from(v) * inv).collect();

    // Drop pure-black border fill: R+G+B > 1/255.
    let threshold = inv;
    for i in 0..n {
        if r[i] + g[i] + b[i] <= threshold {
            valid[i] = false;
        }
    }

    let valid_pct = valid.iter().filter(|&&v| v).count() as f64 / n as f64 * 100.0;
    eprintln!(
        "ortho {}x{}, {} bands, {:.1}% valid",
        width, height, band_count, valid_pct
    );

    let geo_transform = ds.geo_transform().context("no geo-transform on ortho")?;
    let projection = ds.projection();

    Ok((
        OrthoMeta {
            valid,
            width,
            height,
            geo_transform,
            projection,
        },
        OrthoRgb { r, g, b },
    ))
}

/// Write a Float32 GeoTIFF with DEFLATE+tiled compression.
///
/// Non-finite values (NaN from nodata) are replaced with `NODATA = -9999`.
pub fn write_gtiff(path: &Path, data: &[f32], ortho: &OrthoMeta) -> Result<()> {
    let options = RasterCreationOptions::from_iter(["COMPRESS=DEFLATE", "TILED=YES"]);

    let driver = DriverManager::get_driver_by_name("GTiff")?;
    let mut ds = driver.create_with_band_type_with_options::<f32, _>(
        path,
        ortho.width,
        ortho.height,
        1,
        &options,
    )?;

    ds.set_geo_transform(&ortho.geo_transform)?;
    ds.set_projection(&ortho.projection)?;

    let mut band = ds.rasterband(1)?;
    band.set_no_data_value(Some(NODATA))?;

    // Replace NaN with nodata sentinel.
    let out: Vec<f32> = data
        .iter()
        .map(|&v| if v.is_finite() { v } else { NODATA_F32 })
        .collect();

    let mut buf = Buffer::new((ortho.width, ortho.height), out);
    band.write((0, 0), (ortho.width, ortho.height), &mut buf)?;

    ds.flush_cache()?;
    Ok(())
}

/// Compute `[west, south, east, north]` in EPSG:4326 from the ortho extent.
///
/// Mirrors the Python `bounds_4326` function: transforms all four corners
/// with traditional (lon/lat) axis order on both ends.
pub fn bounds_4326(ortho: &OrthoMeta) -> Result<[f64; 4]> {
    let gt = &ortho.geo_transform;
    let w = ortho.width as f64;
    let h = ortho.height as f64;

    // Four corner coordinates in the ortho SRS.
    // gt[0] = x_origin, gt[1] = px_width, gt[3] = y_origin, gt[5] = px_height
    let xs = [gt[0], gt[0] + w * gt[1]];
    let ys = [gt[3], gt[3] + h * gt[5]];

    let mut src =
        SpatialRef::from_wkt(&ortho.projection).context("invalid ortho projection WKT")?;
    src.set_axis_mapping_strategy(AxisMappingStrategy::TraditionalGisOrder);

    let mut dst = SpatialRef::from_epsg(4326).context("cannot create EPSG:4326 SpatialRef")?;
    dst.set_axis_mapping_strategy(AxisMappingStrategy::TraditionalGisOrder);

    let ct = CoordTransform::new(&src, &dst)
        .context("cannot create coordinate transform to EPSG:4326")?;

    // Transform all four corners.
    let mut lons = Vec::with_capacity(4);
    let mut lats = Vec::with_capacity(4);

    for &x in &xs {
        for &y in &ys {
            let mut px = [x];
            let mut py = [y];
            ct.transform_coords(&mut px, &mut py, &mut [])
                .with_context(|| format!("coord transform failed for ({x}, {y})"))?;
            lons.push(px[0]);
            lats.push(py[0]);
        }
    }

    let west = lons.iter().cloned().fold(f64::INFINITY, f64::min);
    let east = lons.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
    let south = lats.iter().cloned().fold(f64::INFINITY, f64::min);
    let north = lats.iter().cloned().fold(f64::NEG_INFINITY, f64::max);

    if !west.is_finite() || !east.is_finite() || !south.is_finite() || !north.is_finite() {
        return Err(anyhow!("bounds_4326 produced non-finite values"));
    }

    Ok([west, south, east, north])
}
