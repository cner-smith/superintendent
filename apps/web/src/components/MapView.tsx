/**
 * MapView.tsx — MapLibre GL map with TerraDraw zone drawing, index switcher,
 * zone rendering, and graceful no-backend fallback.
 *
 * Called by: App.tsx
 * Data: parcels/:id/zones (GET on mount, POST on zone save), GeoJSON FeatureCollection
 * No existing duplicate map component found.
 * Instruction: build the v0.1 map + zone-drawing UI
 */
import React, { useEffect, useRef, useState, useCallback } from "react";
import maplibregl, { type Map as MapLibreMap, type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { TerraDraw, TerraDrawPolygonMode, TerraDrawRenderMode } from "terra-draw";

/** terra-draw internal type — string | number per store.d.ts */
type FeatureId = string | number;
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";
import { IndexSwitcher, type VegetationIndex } from "./IndexSwitcher.js";
import { ZoneForm, type SavedZone, type ZoneKind } from "./ZoneForm.js";
import styles from "./MapView.module.css";

// ── Constants ─────────────────────────────────────────────────────────────

/** Map default — matches the seeded demo parcel (Pine Hollow Garden). */
const DEFAULT_CENTER: [number, number] = [-86.576, 39.269];
const DEFAULT_ZOOM = 16;

/**
 * No-API-key base map style.
 * demotiles.maplibre.org hosts a free vector tile demo style.
 */
const BASE_STYLE = "https://demotiles.maplibre.org/style.json";

/** Parcel ID used for API calls in this v0.1 build. */
const PARCEL_ID = "1";

/** MapLibre source/layer IDs for existing zones. */
const ZONES_SOURCE = "superintendent-zones";
const ZONES_FILL_LAYER = "superintendent-zones-fill";
const ZONES_OUTLINE_LAYER = "superintendent-zones-outline";

/** MapLibre source/layer IDs for the raster index overlay (stub). */
const OVERLAY_SOURCE = "superintendent-overlay";
const OVERLAY_LAYER = "superintendent-overlay-layer";

// ── Zone kind colours (fill) ──────────────────────────────────────────────

const KIND_FILL: Record<ZoneKind, string> = {
  bed:           "rgba(19,138,99,0.32)",
  lawn:          "rgba(47,162,104,0.28)",
  native_border: "rgba(31,142,158,0.30)",
  rough:         "rgba(184,136,26,0.28)",
  green:         "rgba(19,138,99,0.45)",
  other:         "rgba(76,108,90,0.22)",
};

const KIND_STROKE: Record<ZoneKind, string> = {
  bed:           "#138a63",
  lawn:          "#2fa268",
  native_border: "#1f8e9e",
  rough:         "#b8881a",
  green:         "#138a63",
  other:         "#4c6c5a",
};

const LEGEND_ENTRIES: { kind: ZoneKind; label: string }[] = [
  { kind: "bed",           label: "Bed" },
  { kind: "lawn",          label: "Lawn" },
  { kind: "native_border", label: "Native border" },
  { kind: "rough",         label: "Rough" },
  { kind: "green",         label: "Green" },
  { kind: "other",         label: "Other" },
];

// ── Types ─────────────────────────────────────────────────────────────────

interface ApiZone {
  id: string;
  parcelId: string;
  name: string;
  kind: ZoneKind;
  geom: string; // GeoJSON geometry string or WKT from DB
}

interface PendingZone {
  geometry: GeoJSON.Polygon;
  /** terra-draw feature id — kept so we can remove it after save/cancel */
  featureId: FeatureId;
}

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Attempt to parse a zone's `geom` field as a GeoJSON Polygon.
 * The DB stores the geometry as a GeoJSON string.
 */
function parseGeom(raw: string): GeoJSON.Polygon | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      "type" in parsed &&
      (parsed as { type: string }).type === "Polygon"
    ) {
      return parsed as GeoJSON.Polygon;
    }
    return null;
  } catch {
    return null;
  }
}

function zonesToFeatureCollection(zones: ApiZone[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const z of zones) {
    const geom = parseGeom(z.geom);
    if (!geom) continue;
    features.push({
      type: "Feature",
      id: z.id,
      geometry: geom,
      properties: { id: z.id, name: z.name, kind: z.kind },
    });
  }
  return { type: "FeatureCollection", features };
}

// ── MapView component ─────────────────────────────────────────────────────

export interface MapViewProps {
  onError?: (msg: string) => void;
}

export function MapView({ onError }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const drawRef = useRef<TerraDraw | null>(null);

  // Zones loaded from API
  const [zones, setZones] = useState<ApiZone[]>([]);

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [pendingZone, setPendingZone] = useState<PendingZone | null>(null);

  // Index switcher state — drives overlay layer (stub source URL)
  const [activeIndex, setActiveIndex] = useState<VegetationIndex>("Ortho");
  const [overlayOpacity, setOverlayOpacity] = useState(0.7);

  // Track whether map + draw are ready
  const [mapReady, setMapReady] = useState(false);

  // ── Load existing zones ────────────────────────────────────────────────
  const loadZones = useCallback(async () => {
    try {
      const res = await fetch(`/api/parcels/${PARCEL_ID}/zones`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { data: ApiZone[] };
      setZones(json.data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      onError?.(`Could not load zones — ${msg}`);
    }
  }, [onError]);

  // ── Initialise map ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASE_STYLE,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: { compact: true },
    });

    mapRef.current = map;

    map.on("load", () => {
      // ── Zones GeoJSON source + layers ──────────────────────────────────
      map.addSource(ZONES_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.addLayer({
        id: ZONES_FILL_LAYER,
        type: "fill",
        source: ZONES_SOURCE,
        paint: {
          "fill-color": [
            "match",
            ["get", "kind"],
            "bed",           KIND_FILL.bed,
            "lawn",          KIND_FILL.lawn,
            "native_border", KIND_FILL.native_border,
            "rough",         KIND_FILL.rough,
            "green",         KIND_FILL.green,
            KIND_FILL.other,
          ],
          "fill-opacity": 1,
        },
      });

      map.addLayer({
        id: ZONES_OUTLINE_LAYER,
        type: "line",
        source: ZONES_SOURCE,
        paint: {
          "line-color": [
            "match",
            ["get", "kind"],
            "bed",           KIND_STROKE.bed,
            "lawn",          KIND_STROKE.lawn,
            "native_border", KIND_STROKE.native_border,
            "rough",         KIND_STROKE.rough,
            "green",         KIND_STROKE.green,
            KIND_STROKE.other,
          ],
          "line-width": 1.5,
          "line-opacity": 0.85,
        },
      });

      // ── Raster index overlay (stub) ────────────────────────────────────
      // TODO: replace stub URL with real tile endpoint for each index.
      // Source is added now; layer visibility is toggled via opacity.
      map.addSource(OVERLAY_SOURCE, {
        type: "raster",
        tiles: [
          // TODO(raster-overlay): replace with real tile URL pattern, e.g.
          // `https://tiles.example.com/${PARCEL_ID}/{index}/{z}/{x}/{y}.png`
          "https://via.placeholder.com/256/00000000/00000000",
        ],
        tileSize: 256,
      });

      map.addLayer({
        id: OVERLAY_LAYER,
        type: "raster",
        source: OVERLAY_SOURCE,
        paint: {
          "raster-opacity": 0,       // starts hidden; updated by state
          "raster-fade-duration": 0,
        },
      });

      // ── TerraDraw ─────────────────────────────────────────────────────
      const adapter = new TerraDrawMapLibreGLAdapter({ map });

      const draw = new TerraDraw({
        adapter,
        modes: [
          new TerraDrawPolygonMode(),
          new TerraDrawRenderMode({ modeName: "render", styles: {} }),
        ],
      });

      draw.start();
      drawRef.current = draw;

      // Listen for completed polygon
      draw.on("finish", (id: FeatureId) => {
        const snapshot = draw.getSnapshot();
        const feature = snapshot.find((f) => f.id === id);
        if (!feature || feature.geometry.type !== "Polygon") return;

        setPendingZone({
          geometry: feature.geometry as GeoJSON.Polygon,
          featureId: id,
        });

        // Return to idle — user will confirm or cancel via ZoneForm
        draw.setMode("static");
        setIsDrawing(false);
      });

      setMapReady(true);
      void loadZones();
    });

    // ── Resize observer ─────────────────────────────────────────────────
    let resizeObserver: ResizeObserver | null = null;
    if (containerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        map.resize();
      });
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      resizeObserver?.disconnect();
      drawRef.current?.stop();
      drawRef.current = null;
      map.remove();
      mapRef.current = null;
    };
    // loadZones is stable (useCallback with no deps that change); onError is stable from parent
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sync zones → map source ────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const source = map.getSource(ZONES_SOURCE) as GeoJSONSource | undefined;
    if (!source) return;
    source.setData(zonesToFeatureCollection(zones));
  }, [zones, mapReady]);

  // ── Sync overlay opacity → map layer ──────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (!map.getLayer(OVERLAY_LAYER)) return;
    // Show overlay only when a non-Ortho index is selected
    const targetOpacity = activeIndex === "Ortho" ? 0 : overlayOpacity;
    map.setPaintProperty(OVERLAY_LAYER, "raster-opacity", targetOpacity);
  }, [activeIndex, overlayOpacity, mapReady]);

  // ── Draw toggle ────────────────────────────────────────────────────────
  const handleDrawToggle = useCallback(() => {
    const draw = drawRef.current;
    if (!draw) return;

    if (isDrawing) {
      draw.setMode("static");
      setIsDrawing(false);
    } else {
      draw.setMode("polygon");
      setIsDrawing(true);
    }
  }, [isDrawing]);

  // ── Zone save callback ─────────────────────────────────────────────────
  const handleZoneSaved = useCallback((saved: SavedZone) => {
    // Append to local zones state — map will re-render via the sync effect
    setZones((prev) => [...prev, {
      id: saved.id,
      parcelId: saved.parcelId,
      name: saved.name,
      kind: saved.kind,
      geom: JSON.stringify(pendingZone?.geometry ?? {}),
    }]);

    // Remove the terra-draw feature (it's now rendered as a real zone)
    if (pendingZone) {
      drawRef.current?.removeFeatures([pendingZone.featureId]);
    }
    setPendingZone(null);
  }, [pendingZone]);

  // ── Zone cancel callback ───────────────────────────────────────────────
  const handleZoneCancel = useCallback(() => {
    // Remove the unconfirmed terra-draw polygon
    if (pendingZone) {
      drawRef.current?.removeFeatures([pendingZone.featureId]);
    }
    setPendingZone(null);
  }, [pendingZone]);

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className={styles.root}>
      {/* Map canvas */}
      <div ref={containerRef} className={styles.mapContainer} />

      {/* Top-left controls: draw button + legend */}
      <div className={styles.controlsTopLeft}>
        <button
          className={`${styles.drawBtn}${isDrawing ? ` ${styles.active}` : ""}`}
          onClick={handleDrawToggle}
          type="button"
          aria-pressed={isDrawing}
          title={isDrawing ? "Click to stop drawing" : "Click to draw a zone polygon"}
        >
          <span className={styles.drawDot} />
          {isDrawing ? "Drawing…" : "Draw zone"}
        </button>

        <div className={styles.legend} aria-label="Zone kind legend">
          <div className={styles.legendTitle}>Zones</div>
          <div className={styles.legendItems}>
            {LEGEND_ENTRIES.map(({ kind, label }) => (
              <div key={kind} className={styles.legendItem}>
                <span
                  className={styles.legendSwatch}
                  style={{ background: KIND_FILL[kind], outline: `1.5px solid ${KIND_STROKE[kind]}` }}
                />
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top-right controls: index switcher */}
      <div className={styles.controlsTopRight}>
        <IndexSwitcher
          activeIndex={activeIndex}
          opacity={overlayOpacity}
          onIndexChange={setActiveIndex}
          onOpacityChange={setOverlayOpacity}
        />
      </div>

      {/* Zone name/kind modal — shown after terra-draw finishes a polygon */}
      {pendingZone !== null && (
        <ZoneForm
          parcelId={PARCEL_ID}
          geometry={pendingZone.geometry}
          onSaved={handleZoneSaved}
          onCancel={handleZoneCancel}
          onError={(msg) => {
            onError?.(msg);
            handleZoneCancel();
          }}
        />
      )}
    </div>
  );
}
