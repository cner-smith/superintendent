import { createDbClient, type DbClient } from "@superintendent/db";

const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) {
  throw new Error("DATABASE_URL environment variable is required");
}

const { db, queryClient } = createDbClient(databaseUrl);

// Typed explicitly to avoid TS2742 "cannot be named without reference to..."
const typedDb: DbClient = db;

export { typedDb as db, queryClient };
