/**
 * ingest.ts — orchestrates the full flight ingest pipeline.
 *
 * Called by: src/routes/flights.ts (processFlight)
 * No existing duplicate in apps/api/src/.
 * Data structure: processFlight(flightId, orthoPath) → Promise<void>;
 *   writes rasterLayers + zoneIndexAggregates + flight.status in one transaction.
 * Purpose: wire up the index step (Phase-1 GDAL flight processor integration).
 *
 * Single-writer rule: ALL DB writes go through Drizzle here; the Python
 * processor never touches the database.
 */
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { getUploadsDir } from "./storage.js";
import { eq, sql } from "drizzle-orm";
import {
  flights,
  zones,
  rasterLayers,
  zoneIndexAggregates,
} from "@superintendent/db";
import type { DbClient } from "@superintendent/db";
import { db } from "./db.js";
import { withAudit } from "./audit.js";
import { runProcessor } from "./processor.js";
import type { Manifest, IndexResult, ZoneAggregate } from "./processor.js";

// ---------------------------------------------------------------------------
// GeoJSON helpers
// ---------------------------------------------------------------------------

interface ZoneFeature {
  type: "Feature";
  geometry: {
    type: string;
    coordinates: unknown;
  };
  properties: {
    id: string;
    name: string;
    kind: string;
  };
}

interface ZonesFeatureCollection {
  type: "FeatureCollection";
  features: ZoneFeature[];
}

// The geom column stores raw WKT / GeoJSON strings — we read it back as-is
// and re-embed into the GeoJSON we write for the processor.
interface ZoneRow {
  id: string;
  name: string;
  kind: string;
  geom: string;
}

function buildZonesGeoJson(zoneRows: ZoneRow[]): ZonesFeatureCollection {
  return {
    type: "FeatureCollection",
    features: zoneRows.map((z): ZoneFeature => {
      // geom may be WKT or a GeoJSON geometry string depending on how it was
      // stored; the processor accepts GeoJSON FeatureCollections with arbitrary
      // geometry strings via OGR — parse if it looks like JSON, else pass as-is.
      let geometry: ZoneFeature["geometry"];
      try {
        const parsed = JSON.parse(z.geom) as ZoneFeature["geometry"];
        geometry = parsed;
      } catch {
        // WKT fallback: wrap as an opaque string the processor handles via OGR
        geometry = { type: "Unknown", coordinates: z.geom };
      }
      return {
        type: "Feature",
        geometry,
        properties: {
          // zone_aggregates[].zone_id echoes back this id
          id: z.id,
          name: z.name,
          kind: z.kind,
        },
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Index kind validation
// ---------------------------------------------------------------------------

const VALID_INDEX_KINDS = ["ortho", "vari", "gli", "exg"] as const;
type IndexKind = (typeof VALID_INDEX_KINDS)[number];

function toIndexKind(raw: string): IndexKind {
  if ((VALID_INDEX_KINDS as readonly string[]).includes(raw)) {
    return raw as IndexKind;
  }
  throw new Error(`Unknown index_kind from processor: ${raw}`);
}

// ---------------------------------------------------------------------------
// Overlay persistence
// ---------------------------------------------------------------------------

/**
 * copyOverlaysToDisk — copies each index PNG from the processor's temp outDir
 * into <uploadsDir>/overlays/<flightId>/<indexKind>.png before the temp dir
 * is cleaned up. Returns a map of indexKind → served URL path.
 */
async function copyOverlaysToDisk(
  flightId: string,
  indices: Manifest["indices"],
): Promise<Map<string, string>> {
  const uploadsDir = getUploadsDir();
  const destDir = path.join(uploadsDir, "overlays", flightId);
  await fs.mkdir(destDir, { recursive: true });

  const urlMap = new Map<string, string>();
  for (const idx of indices) {
    const destFile = path.join(destDir, `${idx.index_kind}.png`);
    await fs.copyFile(idx.overlay_png, destFile);
    // Served URL path — /overlays/<flightId>/<indexKind>.png
    urlMap.set(idx.index_kind, `/overlays/${flightId}/${idx.index_kind}.png`);
  }
  return urlMap;
}

// ---------------------------------------------------------------------------
// Core transaction logic
// ---------------------------------------------------------------------------

async function commitIngestResults(
  tx: DbClient,
  flightId: string,
  manifest: Manifest,
  overlayUrls: Map<string, string>,
): Promise<void> {
  // Insert one raster_layers row per index in the manifest.
  for (const idx of manifest.indices) {
    const [w, s, e, n] = idx.bounds_4326;
    // TODO(storage): real PMTiles / object-storage path.
    // For Phase 1 we store the served overlay PNG URL as a stand-in.
    // The column is misnamed pmtiles_path; rename once the tile pipeline exists.
    const servedUrl = overlayUrls.get(idx.index_kind) ?? idx.overlay_png;
    await tx.insert(rasterLayers).values({
      flightId,
      indexKind: toIndexKind(idx.index_kind),
      pmtilesPath: servedUrl,
      // Build a Polygon bbox using PostGIS ST_MakeEnvelope(w,s,e,n,4326).
      bounds: sql`ST_MakeEnvelope(${w}, ${s}, ${e}, ${n}, 4326)`,
    });
  }

  // Insert all zone_index_aggregate rows.
  if (manifest.zone_aggregates.length > 0) {
    await tx.insert(zoneIndexAggregates).values(
      manifest.zone_aggregates.map((agg: ZoneAggregate) => ({
        zoneId: agg.zone_id,
        flightId,
        indexKind: toIndexKind(agg.index_kind),
        mean: agg.mean,
        min: agg.min,
        max: agg.max,
        stddev: agg.stddev,
        pixelCount: agg.pixel_count,
      })),
    );
  }

  // Mark flight ready.
  await tx.update(flights).set({ status: "ready" }).where(eq(flights.id, flightId));
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * processFlight — full ingest pipeline for a single flight.
 *
 * 1. Sets flight.status → ingest.
 * 2. Loads the flight's parcel zones; writes a temp zones GeoJSON file with
 *    properties.id = zone.id so the processor can echo them back.
 * 3. Runs the Python processor (subprocess) in a temp output directory.
 * 4. In ONE transaction: inserts raster_layers + zone_index_aggregates,
 *    sets flight.status → ready, and writes audit_log rows.
 * 5. On any failure: sets flight.status → failed, writes an audit row, rethrows.
 * 6. Cleans up the temp directory in all cases.
 *
 * TODO(storage): Step 3 passes the local ortho path directly (Phase-1).
 *   When object storage is added, download the ortho to a temp file first.
 */
export async function processFlight(flightId: string, orthoPath: string): Promise<void> {
  // ── 1. Mark as ingest ─────────────────────────────────────────────────────
  await db.update(flights).set({ status: "ingest" }).where(eq(flights.id, flightId));

  // ── 2. Load zones ─────────────────────────────────────────────────────────
  const flightRow = await db.select().from(flights).where(eq(flights.id, flightId));
  if (flightRow.length === 0) {
    throw new Error(`Flight not found: ${flightId}`);
  }
  const flight = flightRow[0];
  if (!flight) {
    throw new Error(`Flight not found: ${flightId}`);
  }

  const zoneRows = await db
    .select({
      id: zones.id,
      name: zones.name,
      kind: zones.kind,
      geom: zones.geom,
    })
    .from(zones)
    .where(eq(zones.parcelId, flight.parcelId));

  // ── 3. Write temp zones GeoJSON + create temp out dir ─────────────────────
  const tmpBase = await fs.mkdtemp(path.join(os.tmpdir(), `flight-${flightId}-`));
  const zonesGeoJsonPath = path.join(tmpBase, "zones.geojson");
  const outDir = path.join(tmpBase, "out");
  await fs.mkdir(outDir, { recursive: true });

  try {
    await fs.writeFile(
      zonesGeoJsonPath,
      JSON.stringify(buildZonesGeoJson(zoneRows)),
      "utf8",
    );

    // ── 4. Run the processor ──────────────────────────────────────────────
    const manifest: Manifest = await runProcessor({
      orthoPath,
      zonesGeoJsonPath,
      flightId,
      outDir,
    });

    // ── 4a. Persist overlay PNGs before temp dir is cleaned up ────────────
    const overlayUrls = await copyOverlaysToDisk(flightId, manifest.indices);

    // ── 5. Commit everything in one transaction ───────────────────────────
    await withAudit(
      db,
      {
        actor: "system:ingest",
        action: "ingest",
        entity: "flight",
        entityId: flightId,
        detail: {
          indexCount: manifest.indices.length,
          aggregateCount: manifest.zone_aggregates.length,
          bounds_4326: manifest.bounds_4326,
        },
      },
      async (tx: DbClient) => {
        await commitIngestResults(tx, flightId, manifest, overlayUrls);
      },
    );
  } catch (err) {
    // ── 6. Mark failed + audit ─────────────────────────────────────────────
    try {
      await withAudit(
        db,
        {
          actor: "system:ingest",
          action: "ingest_failed",
          entity: "flight",
          entityId: flightId,
          detail: { error: err instanceof Error ? err.message : String(err) },
        },
        async (tx: DbClient) => {
          await tx
            .update(flights)
            .set({ status: "failed" })
            .where(eq(flights.id, flightId));
        },
      );
    } catch (auditErr) {
      // Audit write failing is logged but not allowed to swallow the original error.
      console.error("[ingest] failed to write failure audit row:", auditErr);
    }
    throw err;
  } finally {
    // ── 7. Clean up temp dir ──────────────────────────────────────────────
    await fs.rm(tmpBase, { recursive: true, force: true });
  }
}
