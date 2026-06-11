import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

/**
 * Create and export a Drizzle client.
 * Call this once at application startup (apps/api) — not at module load time
 * so that tests can control the DATABASE_URL environment variable.
 */
export function createDbClient(databaseUrl: string) {
  const queryClient = postgres(databaseUrl);
  const db = drizzle(queryClient, { schema });
  return { db, queryClient };
}

export type DbClient = ReturnType<typeof createDbClient>["db"];
