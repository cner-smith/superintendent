//! Vegetation index computation: VARI, GLI, ExG.
//!
//! Mirrors `compute_indices` in `process_flight.py`.
//!
//! VARI guard: where `|G+R-B| < DEN_GUARD` the pixel is NaN (nodata) and the
//! final clip to `[-1, 1]` is applied after.  This prevents the ±1e5 runaway
//! that would otherwise corrupt zone means (project memory
//! `vari-numerical-instability`).

use crate::ortho::{OrthoMeta, OrthoRgb};

/// Denominator guard for VARI (mirrors Python's `DEN_GUARD = 0.05`).
const DEN_GUARD: f32 = 0.05;
/// Small epsilon used in GLI and ExG denominators.
const EPS: f32 = 1e-6;

/// Compute all three indices and return them in a deterministic order.
///
/// Returns `Vec<(name, pixels)>` in the same order the Python produces:
/// `["vari", "gli", "exg"]`.
///
/// Invalid pixels (where `meta.valid` is `false`) are `f32::NAN`.
///
/// The `rgb` value is consumed and dropped on return, freeing the raw band
/// memory before the caller proceeds to zone aggregation (mirrors Python's
/// `del R, G, B`).
pub fn compute(meta: &OrthoMeta, rgb: OrthoRgb) -> Vec<(String, Vec<f32>)> {
    let n = meta.valid.len();
    let r = &rgb.r;
    let g = &rgb.g;
    let b = &rgb.b;
    let valid = &meta.valid;

    let mut vari = vec![f32::NAN; n];
    let mut gli = vec![f32::NAN; n];
    let mut exg = vec![f32::NAN; n];

    for i in 0..n {
        if !valid[i] {
            continue;
        }

        let ri = r[i];
        let gi = g[i];
        let bi = b[i];

        // --- VARI: (G-R)/(G+R-B) with denominator guard ------------------
        let den = gi + ri - bi;
        if den.abs() >= DEN_GUARD {
            let v = (gi - ri) / den;
            vari[i] = v.clamp(-1.0, 1.0);
        }
        // else: vari[i] stays NaN (nodata)

        // --- GLI: (2G-R-B)/(2G+R+B+eps) ----------------------------------
        gli[i] = (2.0 * gi - ri - bi) / (2.0 * gi + ri + bi + EPS);

        // --- ExG: 2g - r - b  (chromatic coords) -------------------------
        let tot = ri + gi + bi + EPS;
        let rc = ri / tot;
        let gc = gi / tot;
        let bc = bi / tot;
        exg[i] = 2.0 * gc - rc - bc;
    }

    // rgb is dropped here, freeing ~3 × n × 4 bytes of band memory.
    drop(rgb);

    vec![
        ("vari".to_owned(), vari),
        ("gli".to_owned(), gli),
        ("exg".to_owned(), exg),
    ]
}
