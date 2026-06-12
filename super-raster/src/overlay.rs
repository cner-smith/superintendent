//! Colourised overlay PNG generation.
//!
//! Mirrors `colorize_png` in `process_flight.py`.
//!
//! The output is a downsampled RGBA PNG:
//! - Longest edge capped at `OVERLAY_MAX_PX` (2048) via integer step-down.
//! - Red channel = low values; green channel = high values.
//! - Alpha = 180 where valid, 0 where nodata/invalid.
//! - Stretch is 2nd..98th percentile of valid finite pixels.
//!
//! The PNG is written via GDAL's MEM + PNG driver pair so the code path is
//! identical to the Python reference.

use std::path::Path;

use anyhow::{Context, Result};
use gdal::{raster::Buffer, DriverManager};

/// Maximum longest-edge size for the display PNG.
const OVERLAY_MAX_PX: usize = 2048;

/// Write a colourised RGBA overlay PNG and return `[lo, hi]` (display stretch).
///
/// `data` and `valid` must have length `width * height`.
pub fn write_png(
    path: &Path,
    data: &[f32],
    valid: &[bool],
    full_width: usize,
    full_height: usize,
) -> Result<[f64; 2]> {
    debug_assert_eq!(data.len(), full_width * full_height);
    debug_assert_eq!(valid.len(), full_width * full_height);

    // Compute step so longest edge <= OVERLAY_MAX_PX (matches Python's `step`).
    let step = 1usize.max(full_width.max(full_height) / OVERLAY_MAX_PX);
    let out_w = full_width / step;
    let out_h = full_height / step;
    let ds_len = out_w * out_h;

    // Downsample by taking every `step`-th pixel (nearest-neighbour slice).
    let mut ds_data = vec![0.0_f32; ds_len];
    let mut ds_valid = vec![false; ds_len];

    for row in 0..out_h {
        let src_row = (row * step).min(full_height - 1);
        for col in 0..out_w {
            let src_col = (col * step).min(full_width - 1);
            let src_idx = src_row * full_width + src_col;
            ds_data[row * out_w + col] = data[src_idx];
            ds_valid[row * out_w + col] = valid[src_idx];
        }
    }

    // Compute 2nd and 98th percentile over valid finite pixels.
    let [lo, hi] = percentile_stretch(&ds_data, &ds_valid);

    // Build RGBA pixel arrays.
    let mut rgba_r = vec![0u8; ds_len];
    let mut rgba_g = vec![0u8; ds_len];
    let mut rgba_b = vec![0u8; ds_len];
    let mut rgba_a = vec![0u8; ds_len];

    let range = (hi - lo + 1e-6) as f32;

    for i in 0..ds_len {
        let fin = ds_valid[i] && ds_data[i].is_finite();
        if fin {
            // Matches Python formula exactly.
            let norm = ((ds_data[i] - lo as f32) / range).clamp(0.0, 1.0);
            rgba_r[i] = ((2.0 * (1.0 - norm)).clamp(0.0, 1.0) * 255.0) as u8;
            rgba_g[i] = ((2.0 * norm).clamp(0.0, 1.0) * 255.0) as u8;
            rgba_a[i] = 180;
        }
        // else: all channels stay 0 (transparent nodata).
    }
    // Blue channel stays all-zero (matches Python).

    // Write via GDAL MEM dataset → PNG CreateCopy (mirrors Python reference).
    let mem_driver = DriverManager::get_driver_by_name("MEM")?;
    let mut mem_ds = mem_driver.create_with_band_type::<u8, _>("", out_w, out_h, 4)?;

    write_u8_band(&mut mem_ds, 1, &mut rgba_r, out_w, out_h)?;
    write_u8_band(&mut mem_ds, 2, &mut rgba_g, out_w, out_h)?;
    write_u8_band(&mut mem_ds, 3, &mut rgba_b, out_w, out_h)?;
    write_u8_band(&mut mem_ds, 4, &mut rgba_a, out_w, out_h)?;

    let png_driver = DriverManager::get_driver_by_name("PNG")?;
    let opts = gdal::raster::RasterCreationOptions::default();
    let _out = mem_ds.create_copy(&png_driver, path, &opts)?;

    Ok([lo, hi])
}

/// Compute `[p2, p98]` over valid finite pixels; falls back to `[-1.0, 1.0]`.
fn percentile_stretch(data: &[f32], valid: &[bool]) -> [f64; 2] {
    let mut vals: Vec<f32> = data
        .iter()
        .zip(valid.iter())
        .filter_map(|(&v, &ok)| if ok && v.is_finite() { Some(v) } else { None })
        .collect();

    if vals.is_empty() {
        return [-1.0, 1.0];
    }

    vals.sort_unstable_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let n = vals.len();
    [
        percentile_sorted(&vals, n, 2.0) as f64,
        percentile_sorted(&vals, n, 98.0) as f64,
    ]
}

/// Linear-interpolated percentile on a pre-sorted slice (same as `np.percentile`).
fn percentile_sorted(sorted: &[f32], n: usize, p: f64) -> f32 {
    if n == 1 {
        return sorted[0];
    }
    let idx = p / 100.0 * (n as f64 - 1.0);
    let lo_idx = idx.floor() as usize;
    let hi_idx = (lo_idx + 1).min(n - 1);
    let frac = (idx - lo_idx as f64) as f32;
    sorted[lo_idx] + (sorted[hi_idx] - sorted[lo_idx]) * frac
}

fn write_u8_band(
    ds: &mut gdal::Dataset,
    band_idx: usize,
    pixels: &mut Vec<u8>,
    w: usize,
    h: usize,
) -> Result<()> {
    let mut band = ds.rasterband(band_idx)?;
    let mut buf = Buffer::new((w, h), std::mem::take(pixels));
    band.write((0, 0), (w, h), &mut buf)
        .context("failed to write PNG band data")?;
    Ok(())
}
