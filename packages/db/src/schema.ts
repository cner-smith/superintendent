import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  real,
  integer,
  bigint,
  jsonb,
  index,
  customType,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// PostGIS custom types
// Drizzle ORM has no built-in geometry/geography types; we use customType so
// TypeScript is satisfied and raw SQL is emitted for DDL.
// ---------------------------------------------------------------------------

const geography = customType<{ data: string; driverData: string }>({
  dataType() {
    return "geography(Point,4326)";
  },
});

const geometryPolygon = customType<{ data: string; driverData: string }>({
  dataType() {
    return "geometry(Polygon,4326)";
  },
});

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const zoneKindEnum = pgEnum("zone_kind", [
  "bed",
  "lawn",
  "native_border",
  "rough",
  "green",
  "other",
]);

export const flightStatusEnum = pgEnum("flight_status", [
  "upload",
  "ingest",
  "ready",
  "failed",
]);

export const indexKindEnum = pgEnum("index_kind", [
  "ortho",
  "vari",
  "gli",
  "exg",
]);

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export const parcels = pgTable(
  "parcels",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    centroid: geography("centroid").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    centroidIdx: index("parcels_centroid_idx").using("gist", t.centroid),
  }),
);

export const zones = pgTable(
  "zones",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    parcelId: uuid("parcel_id")
      .notNull()
      .references(() => parcels.id),
    name: text("name").notNull(),
    kind: zoneKindEnum("kind").notNull(),
    geom: geometryPolygon("geom").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    parcelIdIdx: index("zones_parcel_id_idx").on(t.parcelId),
    geomIdx: index("zones_geom_idx").using("gist", t.geom),
  }),
);

export const flights = pgTable(
  "flights",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    parcelId: uuid("parcel_id")
      .notNull()
      .references(() => parcels.id),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    status: flightStatusEnum("status").notNull().default("upload"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    parcelIdIdx: index("flights_parcel_id_idx").on(t.parcelId),
  }),
);

export const rasterLayers = pgTable(
  "raster_layers",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    flightId: uuid("flight_id")
      .notNull()
      .references(() => flights.id),
    indexKind: indexKindEnum("index_kind").notNull(),
    pmtilesPath: text("pmtiles_path").notNull(),
    bounds: geometryPolygon("bounds").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    flightIdIdx: index("raster_layers_flight_id_idx").on(t.flightId),
    boundsIdx: index("raster_layers_bounds_idx").using("gist", t.bounds),
  }),
);

export const zoneIndexAggregates = pgTable(
  "zone_index_aggregates",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    zoneId: uuid("zone_id")
      .notNull()
      .references(() => zones.id),
    flightId: uuid("flight_id")
      .notNull()
      .references(() => flights.id),
    indexKind: indexKindEnum("index_kind").notNull(),
    mean: real("mean").notNull(),
    min: real("min").notNull(),
    max: real("max").notNull(),
    stddev: real("stddev").notNull(),
    pixelCount: integer("pixel_count").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    zoneIdIdx: index("zone_index_aggregates_zone_id_idx").on(t.zoneId),
    flightIdIdx: index("zone_index_aggregates_flight_id_idx").on(t.flightId),
  }),
);

/**
 * audit_log — APPEND-ONLY.
 * Every domain write MUST insert a row here in the same transaction.
 * Hono enforces this via the withAudit() helper (apps/api/src/lib/audit.ts).
 * Do NOT add foreign keys or ON DELETE CASCADE here — the log is immutable.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    detail: jsonb("detail"),
  },
  (t) => ({
    entityIdx: index("audit_log_entity_idx").on(t.entity, t.entityId),
    atIdx: index("audit_log_at_idx").on(t.at),
  }),
);
