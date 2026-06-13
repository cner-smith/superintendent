/**
 * MapView.tsx — MapLibre GL map with TerraDraw zone drawing, index switcher,
 * zone rendering, raster vegetation-index overlay, zone-click timeseries panel,
 * and live sensor-node markers from the Phoenix sensor_service (v0.3).
 *
 * Called by: App.tsx
 * Data: parcels/:id/zones, parcels/:id/flights, flights/:id/layers.
 * Instruction: wire index overlays onto the map; add zone-click timeseries (issue #6);
 *              add live Sensor Mesh UI (v0.3).
 */
import React, { useEffect, useRef, useState, useCallback } from "react";
import maplibregl, { type Map as MapLibreMap, type GeoJSONSource, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { TerraDraw, TerraDrawPolygonMode, TerraDrawRenderMode } from "terra-draw";

/** terra-draw internal type — string | number per store.d.ts */
type FeatureId = string | number;
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";
import { IndexSwitcher, type VegetationIndex } from "./IndexSwitcher.js";
import { IndexLegend } from "./IndexLegend.js";
import { ZoneForm, type SavedZone, type ZoneKind } from "./ZoneForm.js";
import { ZoneTimeline } from "./ZoneTimeline.js";
import { SensorPanel } from "./SensorPanel.js";
import { useSensorChannel, type SensorNode } from "../hooks/useSensorChannel.js";
import styles from "./MapView.module.css";

// ── Constants ─────────────────────────────────────────────────────────────

/** Map default — matches the seeded demo parcel (Pine Hollow Garden). */
const DEFAULT_CENTER: [number, number] = [-86.576, 39.269];
const DEFAULT_ZOOM = 16;

/**
 * Base map — Esri World Imagery (aerial, no API key). demotiles has no data at
 * field zoom, so we use satellite tiles to give the index overlay real context.
 */
const BASE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    satellite: {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
    },
  },
  layers: [{ id: "satellite-base", type: "raster", source: "satellite" }],
};

/** Parcel ID used for API calls in this v0.1 build. */
const PARCEL_ID = "1";

/** MapLibre source/layer IDs for existing zones. */
const ZONES_SOURCE = "superintendent-zones";
const ZONES_FILL_LAYER = "superintendent-zones-fill";
const ZONES_OUTLINE_LAYER = "superintendent-zones-outline";

/** MapLibre source/layer IDs for the raster index overlay (stub). */
const OVERLAY_SOURCE = "superintendent-overlay";
const OVERLAY_LAYER = "superintendent-overlay-layer";

/** MapLibre source/layer IDs for the sensor-node circle markers. */
const SENSORS_SOURCE = "superintendent-sensors";
const SENSORS_LAYER = "superintendent-sensors-layer";
const SENSORS_LABEL_LAYER = "superintendent-sensors-labels";

/**
 * Moisture color ramp for the "0-4in" depth band.
 * Interpolates tan (dry) → teal/blue (wet) across 15–65 VWC %.
 * Used as a MapLibre expression so the map GPU handles interpolation.
 */
const MOISTURE_COLOR_EXPR = [
  "interpolate",
  ["linear"],
  ["get", "moisture"],
  15, "#b8881a",  // dry  → gold/tan
  35, "#4c9e8a",  // mid  → teal-green
  65, "#1f8e9e",  // wet  → cyan/teal
] as const;

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

interface ApiFlightSummary {
  id: string;
  status: string;
  capturedAt: string;
}

interface ApiLayer {
  indexKind: string;
  url: string;
  bounds: [number, number, number, number]; // [west, south, east, north]
}

/** Per-index overlay info ready for the map. */
interface OverlayLayer {
  url: string;
  bounds: [number, number, number, number];
}

/** Map of VegetationIndex key (uppercase, e.g. "VARI") → overlay. */
type LayersByIndex = Partial<Record<VegetationIndex, OverlayLayer>>;

interface PendingZone {
  geometry: GeoJSON.Polygon;
  /** terra-draw feature id — kept so we can remove it after save/cancel */
  featureId: FeatureId;
}

// ── Helpers ───────────────────────────────────────────────────────────────

/** Map processor indexKind strings to the UI's VegetationIndex labels. */
const INDEX_KIND_MAP: Record<string, VegetationIndex> = {
  vari: "VARI",
  gli:  "GLI",
  exg:  "ExG",
};

/**
 * Fetch the real parcel UUID from the API (first entry).
 * Returns null if the request fails — the sensor hook skips connecting when falsy.
 */
async function fetchParcelUuid(): Promise<string | null> {
  try {
    const res = await fetch("/api/parcels");
    if (!res.ok) return null;
    const json = (await res.json()) as { data: Array<{ id: string }> };
    return json.data[0]?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch the most-recent ready flight for the parcel, then its overlay layers.
 * Returns an empty record if no ready flight or no layers exist.
 */
async function fetchLayersByIndex(parcelId: string): Promise<LayersByIndex> {
  const flightsRes = await fetch(`/api/parcels/${parcelId}/flights`);
  if (!flightsRes.ok) return {};
  const flightsJson = (await flightsRes.json()) as { data: ApiFlightSummary[] };
  const readyFlights = flightsJson.data
    .filter((f) => f.status === "ready")
    .sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime());

  const latestFlight = readyFlights[0];
  if (!latestFlight) return {};

  const layersRes = await fetch(`/api/flights/${latestFlight.id}/layers`);
  if (!layersRes.ok) return {};
  const layersJson = (await layersRes.json()) as { data: ApiLayer[] };

  const result: LayersByIndex = {};
  for (const layer of layersJson.data) {
    const key = INDEX_KIND_MAP[layer.indexKind];
    if (key) {
      result[key] = { url: layer.url, bounds: layer.bounds };
    }
  }
  return result;
}

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

  // Index switcher state — drives overlay layer
  const [activeIndex, setActiveIndex] = useState<VegetationIndex>("Ortho");
  const [overlayOpacity, setOverlayOpacity] = useState(0.7);

  // Overlay layers fetched from the API (one per vegetation index)
  const [layersByIndex, setLayersByIndex] = useState<LayersByIndex>({});

  // Track whether map + draw are ready
  const [mapReady, setMapReady] = useState(false);

  // Zone selected for timeseries panel (issue #6)
  const [selectedZone, setSelectedZone] = useState<{ id: string; name: string } | null>(null);

  // ── Sensor Mesh state (v0.3) ───────────────────────────────────────────
  /** Whether the Sensors toggle is on */
  const [sensorsOn, setSensorsOn] = useState(false);
  /** Real parcel UUID (fetched from API; distinct from the numeric PARCEL_ID) */
  const [parcelUuid, setParcelUuid] = useState("");
  /** Node clicked in the map → drives SensorPanel */
  const [selectedNode, setSelectedNode] = useState<SensorNode | null>(null);

  // Connect to sensor channel only when toggle is on and we have a real parcel UUID.
  // When sensorsOn=false we pass "" so the hook skips connecting (early return on falsy).
  const { connected: sensorConnected, nodes: sensorNodes, readings: sensorReadings } =
    useSensorChannel(sensorsOn ? parcelUuid : "");

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

  // ── Fetch real parcel UUID once (for sensor channel) ──────────────────
  useEffect(() => {
    void fetchParcelUuid().then((uuid) => {
      if (uuid) setParcelUuid(uuid);
    });
  }, []);

  // ── Load overlay layers for the most-recent ready flight ──────────────
  const loadLayers = useCallback(async () => {
    try {
      const layers = await fetchLayersByIndex(PARCEL_ID);
      setLayersByIndex(layers);
    } catch {
      // Non-fatal: map still works without overlays
    }
  }, []);

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

      // Overlay source/layer are added lazily when an index is selected.
      // See the "Sync overlay → map" effect below.

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

      // ── Zone click → timeseries panel (issue #6) ──────────────────────
      map.on("click", ZONES_FILL_LAYER, (e) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const props = feature.properties as { id?: string; name?: string } | null;
        const id = props?.id;
        const name = props?.name ?? "Zone";
        if (!id) return;
        setSelectedZone({ id, name });
      });

      // Pointer cursor over zones
      map.on("mouseenter", ZONES_FILL_LAYER, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", ZONES_FILL_LAYER, () => {
        map.getCanvas().style.cursor = "";
      });

      // Sensor node clicks — handled via event listener added after source exists
      map.on("click", SENSORS_LAYER, (e) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const props = feature.properties as {
          id?: number;
          label?: string;
          lat?: number;
          lng?: number;
          depth_bands?: string;
        } | null;
        if (!props?.id) return;
        const node: SensorNode = {
          id: props.id,
          label: props.label ?? String(props.id),
          lat: props.lat ?? 0,
          lng: props.lng ?? 0,
          // depth_bands is serialized as JSON string in GeoJSON properties
          depth_bands: (() => {
            try { return JSON.parse(props.depth_bands ?? "[]") as string[]; }
            catch { return []; }
          })(),
        };
        setSelectedNode(node);
      });

      map.on("mouseenter", SENSORS_LAYER, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", SENSORS_LAYER, () => {
        map.getCanvas().style.cursor = "";
      });

      setMapReady(true);
      void loadZones();
      void loadLayers();
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

  // ── Sync overlay → map (source + layer, placed below zone layers) ─────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const layer = activeIndex !== "Ortho" ? layersByIndex[activeIndex] : undefined;

    // Dim zone fills when a heatmap overlay is active so it shows through;
    // restore full fill in Ortho mode or when no overlay data exists.
    const zoneFillOpacity = layer ? 0.05 : 1;
    if (map.getLayer(ZONES_FILL_LAYER)) {
      map.setPaintProperty(ZONES_FILL_LAYER, "fill-opacity", zoneFillOpacity);
    }

    if (!layer) {
      // No overlay: remove source+layer if present
      if (map.getLayer(OVERLAY_LAYER)) map.removeLayer(OVERLAY_LAYER);
      if (map.getSource(OVERLAY_SOURCE)) map.removeSource(OVERLAY_SOURCE);
      return;
    }

    const [w, s, e, n] = layer.bounds;
    // MapLibre image source coordinates: [nw, ne, se, sw]
    const coordinates: [[number,number],[number,number],[number,number],[number,number]] = [
      [w, n], [e, n], [e, s], [w, s],
    ];
    const url = `/api${layer.url}`;

    if (map.getSource(OVERLAY_SOURCE)) {
      // Source already exists — update it in place (swap index or reuse same)
      const existing = map.getSource(OVERLAY_SOURCE) as maplibregl.ImageSource;
      existing.updateImage({ url, coordinates });
      // Opacity may have changed
      if (map.getLayer(OVERLAY_LAYER)) {
        map.setPaintProperty(OVERLAY_LAYER, "raster-opacity", overlayOpacity);
      }
    } else {
      // Add image source below the zone fill layer so zones render on top
      map.addSource(OVERLAY_SOURCE, {
        type: "image",
        url,
        coordinates,
      });
      map.addLayer(
        {
          id: OVERLAY_LAYER,
          type: "raster",
          source: OVERLAY_SOURCE,
          paint: {
            "raster-opacity": overlayOpacity,
            "raster-fade-duration": 150,
          },
        },
        ZONES_FILL_LAYER, // insert before zone fill → overlay is underneath
      );
    }
  }, [activeIndex, overlayOpacity, layersByIndex, mapReady]);

  // ── Sync sensor nodes → map layer (add/remove + live GeoJSON updates) ─
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (!sensorsOn) {
      // Remove sensor layers + source when toggle is off
      if (map.getLayer(SENSORS_LABEL_LAYER)) map.removeLayer(SENSORS_LABEL_LAYER);
      if (map.getLayer(SENSORS_LAYER)) map.removeLayer(SENSORS_LAYER);
      if (map.getSource(SENSORS_SOURCE)) map.removeSource(SENSORS_SOURCE);
      return;
    }

    // Build GeoJSON from current nodes, embedding per-node moisture for the color ramp
    const features: GeoJSON.Feature[] = sensorNodes.map((node) => {
      const nodeReadings = sensorReadings[String(node.id)] ?? {};
      const band0 = nodeReadings["0-4in"];
      const moisture = band0?.value ?? 35; // default to midpoint if no data yet
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [node.lng, node.lat] },
        properties: {
          id: node.id,
          label: node.label,
          lat: node.lat,
          lng: node.lng,
          depth_bands: JSON.stringify(node.depth_bands),
          moisture,
        },
      };
    });

    const fc: GeoJSON.FeatureCollection = { type: "FeatureCollection", features };

    if (map.getSource(SENSORS_SOURCE)) {
      // Update existing source data in place
      (map.getSource(SENSORS_SOURCE) as GeoJSONSource).setData(fc);
    } else {
      // Add source + layers for the first time
      map.addSource(SENSORS_SOURCE, { type: "geojson", data: fc });

      // Circle markers colored by "0-4in" moisture
      map.addLayer({
        id: SENSORS_LAYER,
        type: "circle",
        source: SENSORS_SOURCE,
        paint: {
          "circle-radius": 9,
          "circle-color": MOISTURE_COLOR_EXPR as unknown as string,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#eaf6ee",
          "circle-opacity": 0.92,
        },
      });

      // Node label below the dot
      map.addLayer({
        id: SENSORS_LABEL_LAYER,
        type: "symbol",
        source: SENSORS_SOURCE,
        layout: {
          "text-field": ["get", "label"],
          "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
          "text-size": 9,
          "text-offset": [0, 1.4],
          "text-anchor": "top",
        },
        paint: {
          "text-color": "#18291f",
          "text-halo-color": "#eaf6ee",
          "text-halo-width": 1.5,
        },
      });
    }
  }, [sensorsOn, sensorNodes, sensorReadings, mapReady]);

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

        <button
          className={`${styles.drawBtn}${sensorsOn ? ` ${styles.active}` : ""}`}
          onClick={() => {
            setSensorsOn((prev) => {
              // Close panel when turning off
              if (prev) setSelectedNode(null);
              return !prev;
            });
          }}
          type="button"
          aria-pressed={sensorsOn}
          title={sensorsOn ? "Hide sensor nodes" : "Show soil-moisture sensor nodes"}
        >
          <span className={styles.drawDot} />
          Sensors
        </button>

        {/* Offline pill — shown when sensors are on but service is unreachable */}
        {sensorsOn && !sensorConnected && (
          <div className={styles.sensorOfflinePill}>
            Sensor service offline — start the Phoenix service
          </div>
        )}

        <div className={styles.legend} aria-label="Zone type legend">
          <div className={styles.legendTitle}>Zone types</div>
          <div className={styles.legendItems}>
            {LEGEND_ENTRIES.map(({ kind, label }) => (
              <div key={kind} className={styles.legendItem}>
                <span
                  className={styles.legendSwatch}
                  style={{
                    background: "transparent",
                    border: `2px solid ${KIND_STROKE[kind]}`,
                  }}
                />
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top-right controls: index switcher + index legend */}
      <div className={styles.controlsTopRight}>
        <IndexSwitcher
          activeIndex={activeIndex}
          opacity={overlayOpacity}
          onIndexChange={setActiveIndex}
          onOpacityChange={setOverlayOpacity}
        />
        {activeIndex !== "Ortho" && layersByIndex[activeIndex] !== undefined && (
          <IndexLegend activeIndex={activeIndex} />
        )}
        {activeIndex !== "Ortho" && layersByIndex[activeIndex] === undefined && (
          <div className={styles.noFlightHint}>
            No flight data yet — upload a drone flight to see this index.
          </div>
        )}
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

      {/* Zone timeseries panel — bottom-left, shown when a zone is clicked (issue #6) */}
      {selectedZone !== null && (
        <ZoneTimeline
          parcelId={PARCEL_ID}
          zone={selectedZone}
          onClose={() => setSelectedZone(null)}
        />
      )}

      {/* Sensor live-reading panel — bottom-right, shown when a node marker is clicked */}
      {sensorsOn && selectedNode !== null && (
        <SensorPanel
          node={selectedNode}
          readings={sensorReadings}
          connected={sensorConnected}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </div>
  );
}
