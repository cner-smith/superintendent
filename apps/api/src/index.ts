/**
 * index.ts — API entry point. Builds the Hono app, mounts the parcels and
 * flights routers, exposes GET /health (DB connectivity), and serves persisted
 * overlay PNGs at GET /overlays/:flightId/:indexKind.png (path-traversal-safe).
 * This process is the single writer to Postgres + Supabase Storage; all domain
 * mutations flow through these routers and the withAudit() transaction helper.
 */
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { logger } from "hono/logger";
import { sql } from "drizzle-orm";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parcelsRouter } from "./routes/parcels.js";
import { flightsRouter } from "./routes/flights.js";
import { getUploadsDir } from "./lib/storage.js";

// Import db lazily so the process can start even without DATABASE_URL
// during typecheck / unit tests. The actual connection error surfaces
// when the first query runs.
let dbReady = false;
async function checkDb(): Promise<boolean> {
  try {
    const { db } = await import("./lib/db.js");
    // Run a minimal query to verify connectivity
    await db.execute(sql`select 1`);
    dbReady = true;
    return true;
  } catch {
    dbReady = false;
    return false;
  }
}

const app = new Hono();

app.use("*", logger());

/**
 * GET /health
 * Returns service status and DB connectivity.
 */
app.get("/health", async (c) => {
  const dbOk = await checkDb();
  const status = dbOk ? "ok" : "degraded";
  return c.json(
    { status, db: dbOk ? "connected" : "unreachable", ts: new Date().toISOString() },
    dbOk ? 200 : 503,
  );
});

app.route("/parcels", parcelsRouter);
app.route("/flights", flightsRouter);

// ---------------------------------------------------------------------------
// GET /overlays/:flightId/:indexKind.png
// Serves persisted overlay PNGs from UPLOADS_DIR/overlays/<flightId>/<file>.
// Path-traversal protection: only plain UUIDs and lowercase alpha+dot filenames
// are accepted; any other segment returns 400.
// ---------------------------------------------------------------------------

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OVERLAY_FILE_PATTERN = /^[a-z]+\.png$/;

app.get("/overlays/:flightId/:file", async (c) => {
  const flightId = c.req.param("flightId");
  const file = c.req.param("file");

  if (!UUID_PATTERN.test(flightId) || !OVERLAY_FILE_PATTERN.test(file)) {
    return c.json({ error: "Invalid overlay path" }, 400);
  }

  const filePath = path.join(getUploadsDir(), "overlays", flightId, file);

  let data: Buffer;
  try {
    data = await fs.readFile(filePath);
  } catch {
    return c.json({ error: "Overlay not found" }, 404);
  }

  return new Response(data, {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" },
  });
});

const PORT = Number(process.env["PORT"] ?? 3001);

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[api] listening on http://localhost:${info.port}`);
});
