/**
 * IndexLegend.tsx — floating colorbar shown when a vegetation-index overlay is active.
 *
 * Called by: MapView.tsx (rendered in controlsTopRight, below IndexSwitcher)
 * Data: activeIndex (VARI | GLI | ExG) → index name + qualitative meaning.
 * Renders a red→yellow→green CSS gradient bar + end labels (Space Mono).
 * Instruction: polish the map UX.
 */
import React from "react";
import type { VegetationIndex } from "./IndexSwitcher.js";
import styles from "./IndexLegend.module.css";

const INDEX_META: Record<Exclude<VegetationIndex, "Ortho">, { meaning: string }> = {
  VARI: { meaning: "vegetation vigor" },
  GLI:  { meaning: "green leaf coverage" },
  ExG:  { meaning: "canopy greenness" },
};

export interface IndexLegendProps {
  activeIndex: Exclude<VegetationIndex, "Ortho">;
}

export function IndexLegend({ activeIndex }: IndexLegendProps) {
  const meta = INDEX_META[activeIndex];

  return (
    <div className={styles.panel} aria-label={`${activeIndex} index legend`}>
      <div className={styles.header}>
        <span className={styles.indexName}>{activeIndex}</span>
        <span className={styles.meaning}>{meta.meaning}</span>
      </div>
      <div className={styles.gradientBar} />
      <div className={styles.endLabels}>
        <span>Stressed / sparse</span>
        <span>Healthy / dense</span>
      </div>
    </div>
  );
}
