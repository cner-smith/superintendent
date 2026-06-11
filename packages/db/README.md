# @superintendent/db

Drizzle ORM schema, migrations, and database client for the Superintendent project.

## Audit rule — MANDATORY

**Every domain write (INSERT / UPDATE / DELETE on any table except `audit_log` itself)
MUST insert a corresponding row into `audit_log` in the same database transaction.**

Hono (apps/api) enforces this through the `withAudit()` transaction helper located at
`apps/api/src/lib/audit.ts`. No route handler may call a write query outside of
`withAudit()`. This is a hard architectural constraint from the design spec.

## Commands

```bash
# Generate SQL migration from schema (offline — no live DB needed)
pnpm db:generate

# Apply pending migrations to DATABASE_URL
pnpm db:migrate
```

## Schema overview

| Table | Purpose |
|-------|---------|
| `parcels` | A land parcel being monitored |
| `zones` | Named sub-areas within a parcel (bed, lawn, etc.) |
| `flights` | A drone survey flight over a parcel |
| `raster_layers` | Processed index tiles (ortho, VARI, GLI, ExG) for a flight |
| `zone_index_aggregates` | Per-zone statistical aggregates from a raster layer |
| `audit_log` | Immutable append-only audit trail — one row per write operation |

PostGIS is required. The first migration enables the extension via
`CREATE EXTENSION IF NOT EXISTS postgis`.
