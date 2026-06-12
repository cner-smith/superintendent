CREATE EXTENSION IF NOT EXISTS postgis;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."flight_status" AS ENUM('upload', 'ingest', 'ready', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."index_kind" AS ENUM('ortho', 'vari', 'gli', 'exg');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."zone_kind" AS ENUM('bed', 'lawn', 'native_border', 'rough', 'green', 'other');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"detail" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "flights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parcel_id" uuid NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"status" "flight_status" DEFAULT 'upload' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "parcels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"centroid" geography(Point,4326) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "raster_layers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flight_id" uuid NOT NULL,
	"index_kind" "index_kind" NOT NULL,
	"pmtiles_path" text NOT NULL,
	"bounds" geometry(Polygon,4326) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "zone_index_aggregates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"zone_id" uuid NOT NULL,
	"flight_id" uuid NOT NULL,
	"index_kind" "index_kind" NOT NULL,
	"mean" real NOT NULL,
	"min" real NOT NULL,
	"max" real NOT NULL,
	"stddev" real NOT NULL,
	"pixel_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parcel_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "zone_kind" NOT NULL,
	"geom" geometry(Polygon,4326) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "flights" ADD CONSTRAINT "flights_parcel_id_parcels_id_fk" FOREIGN KEY ("parcel_id") REFERENCES "public"."parcels"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "raster_layers" ADD CONSTRAINT "raster_layers_flight_id_flights_id_fk" FOREIGN KEY ("flight_id") REFERENCES "public"."flights"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "zone_index_aggregates" ADD CONSTRAINT "zone_index_aggregates_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "zone_index_aggregates" ADD CONSTRAINT "zone_index_aggregates_flight_id_flights_id_fk" FOREIGN KEY ("flight_id") REFERENCES "public"."flights"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "zones" ADD CONSTRAINT "zones_parcel_id_parcels_id_fk" FOREIGN KEY ("parcel_id") REFERENCES "public"."parcels"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_entity_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_at_idx" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "flights_parcel_id_idx" ON "flights" USING btree ("parcel_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "parcels_centroid_idx" ON "parcels" USING gist ("centroid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "raster_layers_flight_id_idx" ON "raster_layers" USING btree ("flight_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "raster_layers_bounds_idx" ON "raster_layers" USING gist ("bounds");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "zone_index_aggregates_zone_id_idx" ON "zone_index_aggregates" USING btree ("zone_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "zone_index_aggregates_flight_id_idx" ON "zone_index_aggregates" USING btree ("flight_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "zones_parcel_id_idx" ON "zones" USING btree ("parcel_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "zones_geom_idx" ON "zones" USING gist ("geom");