/**
 * routes/parcels.ts — parcel-scoped reads and zone creation. Serves the map UI:
 * list parcels, list/create a parcel's zones (drawn polygons), list its flights.
 * Zone creation goes through withAudit() so the insert + audit row are atomic.
 */
import { Hono } from "hono";
import { db } from "../lib/db.js";
import { parcels, zones, flights } from "@superintendent/db";
import { eq } from "drizzle-orm";
import { withAudit } from "../lib/audit.js";

export const parcelsRouter = new Hono();

/**
 * GET /parcels
 * List all parcels.
 */
parcelsRouter.get("/", async (c) => {
  const rows = await db.select().from(parcels);
  return c.json({ data: rows });
});

/**
 * GET /parcels/:id/zones
 * List all zones for a parcel.
 */
parcelsRouter.get("/:id/zones", async (c) => {
  const parcelId = c.req.param("id");
  const rows = await db
    .select()
    .from(zones)
    .where(eq(zones.parcelId, parcelId));
  return c.json({ data: rows });
});

/**
 * POST /parcels/:id/zones
 * Create a zone for a parcel — wired through withAudit().
 * Body (JSON): { name: string; kind: ZoneKind; geom: string }
 *   geom should be a WKT or GeoJSON string (Postgres will cast it).
 *
 * TODO(phase-2): add request validation (Zod) and proper geom parsing.
 */
parcelsRouter.post("/:id/zones", async (c) => {
  const parcelId = c.req.param("id");
  const body = await c.req.json<{
    name: string;
    kind: "bed" | "lawn" | "native_border" | "rough" | "green" | "other";
    geom: string;
  }>();

  // Actor placeholder — replace with real auth principal in Phase 2
  const actor = c.req.header("x-actor") ?? "anonymous";

  const created = await withAudit(db, {
    actor,
    action: "create",
    entity: "zone",
    entityId: "pending", // updated below once we have the id
    detail: { parcelId, name: body.name, kind: body.kind },
  }, async (txDb) => {
    const [zone] = await txDb
      .insert(zones)
      .values({
        parcelId,
        name: body.name,
        kind: body.kind,
        geom: body.geom,
      })
      .returning();
    return zone;
  });

  return c.json({ data: created }, 201);
});

/**
 * GET /parcels/:id/flights
 * List all flights for a parcel.
 */
parcelsRouter.get("/:id/flights", async (c) => {
  const parcelId = c.req.param("id");
  const rows = await db
    .select()
    .from(flights)
    .where(eq(flights.parcelId, parcelId));
  return c.json({ data: rows });
});
