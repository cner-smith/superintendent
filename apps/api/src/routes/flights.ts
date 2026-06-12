/**
 * routes/flights.ts — flight lifecycle endpoints (create, ortho upload, status poll,
 * layers query). Adds GET /flights/:id/layers for overlay metadata consumed by MapView,
 * and GET /overlays/:flightId/:indexKind.png for serving persisted overlay PNGs.
 *
 * Called by: src/index.ts (app.route("/flights", flightsRouter));
 *   POST /parcels/:id/flights is also wired from parcelsRouter via re-export.
 * Public functions: flightsRouter (Hono), createFlightHandler (mounted in parcelsRouter).
 * Data structures: flights table rows; state machine upload→ingest→ready|failed.
 * User instruction: wire index overlays onto the map.
 */
import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { flights, rasterLayers } from "@superintendent/db";
import { db } from "../lib/db.js";
import { withAudit } from "../lib/audit.js";
import { processFlight } from "../lib/ingest.js";
import { getStorage, getUploadsDir } from "../lib/storage.js";

export const flightsRouter = new Hono();

// ---------------------------------------------------------------------------
// POST /parcels/:id/flights  — create a flight (status: upload)
// Mounted in parcelsRouter so the URL stays RESTful under /parcels/:id/flights.
// Exported separately for mounting; flightsRouter owns /flights/* below.
// ---------------------------------------------------------------------------

export const createFlightHandler = new Hono<{ Variables: Record<string, never> }>();

createFlightHandler.post("/", async (c) => {
  const parcelId = c.req.param("id");
  const body = await c.req.json<{ capturedAt: string; notes?: string }>();

  if (!parcelId) {
    return c.json({ error: "parcelId is required" }, 400);
  }

  if (!body.capturedAt || typeof body.capturedAt !== "string") {
    return c.json({ error: "capturedAt (ISO string) is required" }, 400);
  }

  const actor = c.req.header("x-actor") ?? "anonymous";

  const created = await withAudit(
    db,
    {
      actor,
      action: "create",
      entity: "flight",
      entityId: "pending",
      detail: { parcelId, capturedAt: body.capturedAt },
    },
    async (tx) => {
      const [row] = await tx
        .insert(flights)
        .values({
          parcelId,
          capturedAt: new Date(body.capturedAt),
          status: "upload",
          notes: body.notes ?? null,
        })
        .returning({ id: flights.id });
      return row;
    },
  );

  if (!created) {
    return c.json({ error: "Failed to create flight" }, 500);
  }

  return c.json({ flightId: created.id }, 201);
});

// ---------------------------------------------------------------------------
// POST /flights/:id/ortho  — multipart ortho upload → fire-and-forget ingest
// ---------------------------------------------------------------------------

flightsRouter.post("/:id/ortho", async (c) => {
  const flightId = c.req.param("id");
  const actor = c.req.header("x-actor") ?? "anonymous";

  // TODO(stream): stream large orthos to storage instead of buffering.
  // Hono c.req.parseBody() buffers the entire multipart payload in memory;
  // for large GeoTIFFs (>1 GB) this will exhaust the Node.js heap.
  // Phase 2: pipe the request body directly to the storage backend.
  const formData = await c.req.parseBody();
  const file = formData["file"];

  if (!file || !(file instanceof File)) {
    return c.json({ error: "Multipart field 'file' (binary) is required" }, 400);
  }

  // Verify the flight exists and is in the upload state.
  const [flight] = await db
    .select({ id: flights.id, status: flights.status })
    .from(flights)
    .where(eq(flights.id, flightId));

  if (!flight) {
    return c.json({ error: "Flight not found" }, 404);
  }
  if (flight.status !== "upload") {
    return c.json(
      { error: `Flight is in status '${flight.status}'; expected 'upload'` },
      409,
    );
  }

  // Store the ortho file.
  let storageKey: string;
  try {
    const buffer = await file.arrayBuffer();
    const { key } = await getStorage().putOrtho(flightId, buffer);
    storageKey = key;
  } catch (storeErr) {
    // Storage failure → mark the flight as failed and audit.
    await withAudit(
      db,
      {
        actor,
        action: "ortho_store_failed",
        entity: "flight",
        entityId: flightId,
        detail: {
          error: storeErr instanceof Error ? storeErr.message : String(storeErr),
        },
      },
      async (tx) => {
        await tx
          .update(flights)
          .set({ status: "failed" })
          .where(eq(flights.id, flightId));
      },
    );
    return c.json({ error: "Failed to store ortho file" }, 500);
  }

  // Resolve local path then kick off ingest (fire-and-forget).
  // processFlight sets status → ingest, then → ready or failed.
  getStorage()
    .getLocalPath(storageKey)
    .then((localPath) => {
      processFlight(flightId, localPath).catch((err: unknown) => {
        console.error(`[flights] processFlight(${flightId}) failed:`, err);
      });
    })
    .catch((pathErr: unknown) => {
      console.error(`[flights] getLocalPath(${storageKey}) failed:`, pathErr);
    });

  return c.json({ flightId, status: "ingest" }, 202);
});

// ---------------------------------------------------------------------------
// GET /flights/:id  — return the flight row (status for client polling)
// ---------------------------------------------------------------------------

flightsRouter.get("/:id", async (c) => {
  const flightId = c.req.param("id");

  const [row] = await db
    .select()
    .from(flights)
    .where(eq(flights.id, flightId));

  if (!row) {
    return c.json({ error: "Flight not found" }, 404);
  }

  return c.json({ data: row });
});

// ---------------------------------------------------------------------------
// GET /flights/:id/layers  — overlay metadata for the map
//
// Returns one entry per index kind stored in raster_layers, including the
// served overlay PNG URL and the geographic bounds as [west,south,east,north].
// Shape: { data: [{ indexKind, url, bounds: [w,s,e,n] }] }
// ---------------------------------------------------------------------------

flightsRouter.get("/:id/layers", async (c) => {
  const flightId = c.req.param("id");

  const rows = await db
    .select({
      indexKind: rasterLayers.indexKind,
      url: rasterLayers.pmtilesPath,
      west:  sql<number>`ST_XMin(${rasterLayers.bounds})`,
      south: sql<number>`ST_YMin(${rasterLayers.bounds})`,
      east:  sql<number>`ST_XMax(${rasterLayers.bounds})`,
      north: sql<number>`ST_YMax(${rasterLayers.bounds})`,
    })
    .from(rasterLayers)
    .where(eq(rasterLayers.flightId, flightId));

  const data = rows.map((r) => ({
    indexKind: r.indexKind,
    url: r.url,
    bounds: [r.west, r.south, r.east, r.north] as [number, number, number, number],
  }));

  return c.json({ data });
});

// ---------------------------------------------------------------------------
// POST /flights/:id/process  — internal/debug path trigger (Phase-1 shim)
//
// Kept as an internal debug/testing route. The canonical entry is now
// POST /flights/:id/ortho (real multipart upload). Do not expose to clients.
// ---------------------------------------------------------------------------

flightsRouter.post("/:id/process", async (c) => {
  const flightId = c.req.param("id");
  const body = await c.req.json<{ orthoPath: string }>();
  const orthoPath: string = body.orthoPath;

  if (!orthoPath || typeof orthoPath !== "string") {
    return c.json({ error: "orthoPath is required" }, 400);
  }

  processFlight(flightId, orthoPath).catch((err: unknown) => {
    console.error(`[flights] processFlight(${flightId}) failed:`, err);
  });

  return c.json({ flightId }, 202);
});
