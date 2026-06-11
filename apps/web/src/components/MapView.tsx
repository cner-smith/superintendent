import React, { useEffect, useRef } from "react";
// maplibre-gl and terra-draw are imported here to ensure they resolve
// at bundle time. The actual map instance is created in Phase 2 when
// a real style URL and tile sources are available.
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// terra-draw is imported for type availability; wired to the map in Phase 2.
import { TerraDraw } from "terra-draw";

/**
 * MapView — placeholder component.
 *
 * Phase 1: renders a grey div container and logs the maplibre + terra-draw
 *   versions to confirm the deps resolve correctly.
 *
 * Phase 2: initialise a MapLibreGL map with a proper style, attach TerraDraw
 *   for zone drawing, and wire up real tile sources for raster_layers.
 */
export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Confirm deps are importable without a live map instance.
    // maplibregl object confirmed present at runtime; version string in pkg.
    void maplibregl;
    console.info("[MapView] maplibre-gl imported OK");
    // TerraDraw is instantiated here only to satisfy the import; remove once
    // wired to a real map in Phase 2.
    void TerraDraw;
    console.info("[MapView] terra-draw imported OK");
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "400px",
        background: "#d0d8e0",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "4px",
        border: "1px solid #b0bec5",
      }}
    >
      <span style={{ color: "#546e7a", fontSize: "0.9rem" }}>
        Map placeholder — wired in Phase 2
      </span>
    </div>
  );
}
