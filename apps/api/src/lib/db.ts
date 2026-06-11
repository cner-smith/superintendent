/**
 * db.ts — the shared Drizzle client for the API, built from DATABASE_URL.
 * Exported as TransactionalDbClient so callers can use db.transaction() (the
 * postgres-js adapter exposes it at runtime; the cast surfaces it to the types).
 * Every route imports this single instance — there is one writer to the DB.
 */
import { createDbClient, type DbClient } from "@superintendent/db";
import type { TransactionalDbClient } from "./audit.js";

const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) {
  throw new Error("DATABASE_URL environment variable is required");
}

const { db, queryClient } = createDbClient(databaseUrl);

// The postgres-js Drizzle adapter exposes .transaction() at runtime.
// We assert the widened type here so route handlers can pass `db`
// directly to withAudit() without casting at every call site.
// Typed explicitly to avoid TS2742 "cannot be named without reference to..."
const typedDb = db as unknown as TransactionalDbClient;

export { typedDb as db, queryClient };
export type { DbClient, TransactionalDbClient };
