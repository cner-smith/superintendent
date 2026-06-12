/**
 * IndexSwitcher.tsx — floating vegetation index selector + opacity slider.
 *
 * Called by: MapView.tsx (rendered as a floating overlay child)
 * Data: VegetationIndex type, opacity 0–1; drives raster overlay layer (stub)
 * No existing duplicate component found.
 * Instruction: build the v0.1 map + zone-drawing UI
 *
 * NOTE: The raster tile source URL for each index is a TODO stub — the overlay
 * layer is wired and state is live, but actual tile URLs are not yet available.
 */
import React from "react";
import styles from "./IndexSwitcher.module.css";

export type VegetationIndex = "Ortho" | "VARI" | "GLI" | "ExG";

const INDICES: VegetationIndex[] = ["Ortho", "VARI", "GLI", "ExG"];

export interface IndexSwitcherProps {
  activeIndex: VegetationIndex;
  opacity: number; // 0–1
  onIndexChange: (idx: VegetationIndex) => void;
  onOpacityChange: (opacity: number) => void;
}

export function IndexSwitcher({
  activeIndex,
  opacity,
  onIndexChange,
  onOpacityChange,
}: IndexSwitcherProps) {
  return (
    <div className={styles.panel} role="group" aria-label="Vegetation index controls">
      <div className={styles.label}>Index</div>
      <div className={styles.tabs}>
        {INDICES.map((idx) => (
          <button
            key={idx}
            className={`${styles.tab}${activeIndex === idx ? ` ${styles.active}` : ""}`}
            onClick={() => onIndexChange(idx)}
            aria-pressed={activeIndex === idx}
            type="button"
          >
            {idx}
          </button>
        ))}
      </div>

      <div className={styles.divider} />

      <div className={styles.sliderRow}>
        <span className={styles.sliderLabel}>Opacity</span>
        <input
          className={styles.slider}
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={opacity}
          onChange={(e) => onOpacityChange(Number(e.target.value))}
          aria-label="Overlay opacity"
        />
        <span className={styles.sliderValue}>{Math.round(opacity * 100)}%</span>
      </div>

      <div className={styles.indexNote}>Raster source: TODO</div>
    </div>
  );
}
