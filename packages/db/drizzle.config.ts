import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    // DATABASE_URL must be set when running db:migrate against a real DB.
    // db:generate (offline DDL emit) does NOT need a live connection.
    url: process.env["DATABASE_URL"] ?? "postgresql://localhost/superintendent",
  },
  verbose: true,
  strict: true,
});
