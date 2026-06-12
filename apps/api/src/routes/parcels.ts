/**
 * routes/parcels.ts — parcel-scoped reads and zone creation. Serves the map UI:
 * list parcels, list/create a parcel's zones (drawn polygons), list its flights.
 * Zones cross the wire as GeoJSON strings — ST_AsGeoJSON on read, ST_GeomFromGeoJSON
 * on write. v0.1 is single-parcel, so a non-UUID :id (the frontend placeholder)
 * resolves to the first parcel. Zone creation runs through withAudit().
 * Also serves GET /parcels/:id/zones/:zoneId/timeseries for issue #6.
 */
import { Hono } from "hono";
import { db } from "../lib/db.js";
import { parcels, zones, flights, zoneIndexAggregates } from "@superintendent/db";
import { eq, sql, asc } from "drizzle-orm";
import { withAudit } from "../lib/audit.js";
import { createFlightHandler } from "./flights.js";

export const parcelsRouter = new Hono();

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Map a route :id to a real parcel UUID; non-UUID falls back to the sole v0.1 parcel. */
export async function resolveParcelId(id: string): Promise<string | null> {
  if (UUID_RE.test(id)) return id;
  const [first] = await db
    .select({ id: parcels.id })
    .from(parcels)
    .orderBy(parcels.createdAt)
    .limit(1);
  return first?.id ?? null;
}

/** Zone columns with geom serialized to a GeoJSON string. */
const zoneSelection = {
  id: zones.id,
  parcelId: zones.parcelId,
  name: zones.name,
  kind: zones.kind,
  geom: sql<string>`ST_AsGeoJSON(${zones.geom})`,
  createdAt: zones.createdAt,
};

/** GET /parcels — list all parcels. */
parcelsRouter.get("/", async (c) => {
  const rows = await db.select().from(parcels);
  return c.json({ data: rows });
});

/** GET /parcels/:id/zones — zones with geom as GeoJSON. */
parcelsRouter.get("/:id/zones", async (c) => {
  const parcelId = await resolveParcelId(c.req.param("id"));
  if (!parcelId) return c.json({ data: [] });
  const rows = await db
    .select(zoneSelection)
    .from(zones)
    .where(eq(zones.parcelId, parcelId));
  return c.json({ data: rows });
});

/** POST /parcels/:id/zones — create a zone from a GeoJSON polygon string. */
parcelsRouter.post("/:id/zones", async (c) => {
  const parcelId = await resolveParcelId(c.req.param("id"));
  if (!parcelId) return c.json({ error: "no parcel for id" }, 404);
  const body = await c.req.json<{
    name: string;
    kind: "bed" | "lawn" | "native_border" | "rough" | "green" | "other";
    geom: string;
  }>();

  // Actor placeholder — replace with real auth principal in Phase 2.
  const actor = c.req.header("x-actor") ?? "anonymous";

  const created = await withAudit(
    db,
    {
      actor,
      action: "create",
      entity: "zone",
      entityId: "pending",
      detail: { parcelId, name: body.name, kind: body.kind },
    },
    async (txDb) => {
      const [zone] = await txDb
        .insert(zones)
        .values({
          parcelId,
          name: body.name,
          kind: body.kind,
          geom: sql`ST_SetSRID(ST_GeomFromGeoJSON(${body.geom}), 4326)`,
        })
        .returning(zoneSelection);
      return zone;
    },
  );

  return c.json({ data: created }, 201);
});

/** GET /parcels/:id/flights — list a parcel's flights. */
parcelsRouter.get("/:id/flights", async (c) => {
  const parcelId = await resolveParcelId(c.req.param("id"));
  if (!parcelId) return c.json({ data: [] });
  const rows = await db
    .select()
    .from(flights)
    .where(eq(flights.parcelId, parcelId));
  return c.json({ data: rows });
});

/**
 * GET /parcels/:id/zones/:zoneId/timeseries
 * Returns vegetation-index trend data for a zone across all flights.
 * Joins zone_index_aggregates with flights for capturedAt, ordered ascending.
 * Response grouped by index kind for easy charting:
 *   { "data": { "vari": [{ flightId, capturedAt, mean, min, max, stddev }], … } }
 * Empty { "data": {} } when the zone has no aggregates yet.
 */
parcelsRouter.get("/:id/zones/:zoneId/timeseries", async (c) => {
  const parcelId = await resolveParcelId(c.req.param("id"));
  if (!parcelId) return c.json({ data: {} });

  const zoneId = c.req.param("zoneId");

  const rows = await db
    .select({
      flightId: zoneIndexAggregates.flightId,
      capturedAt: flights.capturedAt,
      indexKind: zoneIndexAggregates.indexKind,
      mean: zoneIndexAggregates.mean,
      min: zoneIndexAggregates.min,
      max: zoneIndexAggregates.max,
      stddev: zoneIndexAggregates.stddev,
    })
    .from(zoneIndexAggregates)
    .innerJoin(flights, eq(zoneIndexAggregates.flightId, flights.id))
    .where(eq(zoneIndexAggregates.zoneId, zoneId))
    .orderBy(asc(flights.capturedAt));

  type IndexKind = "vari" | "gli" | "exg";
  type TimeseriesPoint = {
    flightId: string;
    capturedAt: string;
    mean: number;
    min: number;
    max: number;
    stddev: number;
  };

  const grouped: Partial<Record<IndexKind, TimeseriesPoint[]>> = {};
  for (const row of rows) {
    // indexKind enum includes "ortho" — skip it, it carries no aggregate stats
    if (row.indexKind === "ortho") continue;
    const kind = row.indexKind as IndexKind;
    if (!grouped[kind]) grouped[kind] = [];
    grouped[kind]!.push({
      flightId: row.flightId,
      capturedAt: row.capturedAt.toISOString(),
      mean: row.mean,
      min: row.min,
      max: row.max,
      stddev: row.stddev,
    });
  }

  return c.json({ data: grouped });
});

/**
 * POST /parcels/:id/flights
 * Create a new flight for a parcel (status: upload).
 * Body (JSON): { capturedAt: string; notes?: string }
 * Delegates to createFlightHandler from routes/flights.ts.
 */
parcelsRouter.route("/:id/flights", createFlightHandler);
