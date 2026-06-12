/**
 * index.ts — API entry point. Builds the Hono app, mounts the parcels and
 * flights routers, and exposes GET /health (which also checks DB connectivity).
 * This process is the single writer to Postgres + Supabase Storage; all domain
 * mutations flow through these routers and the withAudit() transaction helper.
 */
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { logger } from "hono/logger";
import { sql } from "drizzle-orm";
import { parcelsRouter } from "./routes/parcels.js";
import { flightsRouter } from "./routes/flights.js";

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

const PORT = Number(process.env["PORT"] ?? 3001);

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[api] listening on http://localhost:${info.port}`);
});
