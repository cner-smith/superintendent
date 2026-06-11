/**
 * routes/flights.ts — Hono router for flight-level operations.
 *
 * Called by: src/index.ts (app.route("/flights", flightsRouter))
 * No existing duplicate in apps/api/src/routes/.
 * Data structure: Hono router; POST /flights/:id/process → 202 with flight id.
 * Purpose: wire up the index step (Phase-1 GDAL flight processor integration).
 *
 * Mounted at /flights in src/index.ts.
 */
import { Hono } from "hono";
import { processFlight } from "../lib/ingest.js";

export const flightsRouter = new Hono();

/**
 * POST /flights/:id/process
 * Body: { orthoPath: string }
 *
 * Kicks off the Phase-1 flight ingest pipeline:
 *   1. Spawns the Python processor against the local ortho file.
 *   2. Persists raster_layers + zone_index_aggregates in one transaction.
 *   3. Sets flight.status → ready (or failed on error).
 *
 * Returns 202 immediately with the flight id.
 * The pipeline runs asynchronously (fire-and-forget) so the response is not
 * held open for the duration of GDAL processing. Errors are recorded in the
 * flights table (status = failed) and the audit_log.
 *
 * TODO(storage): Phase 1 accepts a local filesystem path for orthoPath.
 *   When object storage is added, this endpoint should accept a storage key
 *   and the ingest layer will download the ortho to a temp file.
 */
flightsRouter.post("/:id/process", async (c) => {
  const flightId = c.req.param("id");

  const body = await c.req.json<{ orthoPath: string }>();
  const orthoPath: string = body.orthoPath;

  if (!orthoPath || typeof orthoPath !== "string") {
    return c.json({ error: "orthoPath is required" }, 400);
  }

  // Fire-and-forget: do not await so the HTTP response returns immediately.
  // Errors surface via flight.status = failed and the audit_log table.
  processFlight(flightId, orthoPath).catch((err: unknown) => {
    console.error(`[flights] processFlight(${flightId}) failed:`, err);
  });

  return c.json({ flightId }, 202);
});
