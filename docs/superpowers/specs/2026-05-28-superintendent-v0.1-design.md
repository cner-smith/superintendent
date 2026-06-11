---
title: Superintendent — v0.1 Design (Garden Vegetation Index Tool)
date: 2026-05-28
status: draft (pending user review)
authors:
  - cner-smith
review:
  - voltagent-qa-sec:architect-reviewer (critical review)
  - ecc:architect (alternative-architecture proposal)
  - general-purpose (devil's advocate against polyglot)
  - general-purpose (pre-mortem on v0.1 and v1.0 failure)
---

# Superintendent — v0.1 Design

## 1. Purpose

Superintendent is a long-horizon (~10 year) personal project to build an operations platform for **low-input, native-ecology golf courses** — the kind that manage turf without synthetic chemicals or fertilizers, using native grass species with growth and dormancy characteristics that conventional commercial platforms do not understand.

The author owns no course yet. v0.1 is being built and dogfooded on the author's home garden in Oklahoma City (zone 7a) using a **DJI Flip drone (RGB-only camera)**. The garden is the testbed; the eventual customer is a real native-ecology course managed by the author or another small operator.

This document defines **v0.1** (the garden vegetation-index tool) and outlines the **long-term architecture** the project will grow into.

## 2. The 10-year vision (long-term shape)

The full platform eventually owns three loosely coupled subsystems sharing a single spatial substrate:

1. **Land management** — sensor telemetry (soil moisture, temperature, weather), drone imagery + vegetation index analysis, irrigation automation, phenology-aware scheduling for native species.
2. **Business operations** — tee time booking, member management, revenue tracking, inventory, staff scheduling.
3. **Compliance & reporting** — exportable records for USDA NRCS, CRP, and Audubon certification programs.

### Long-term runtimes (each joins when it earns its keep)

| Runtime | Owns | Joins when |
|---|---|---|
| **TypeScript** (React + Hono) | All web UI and HTTP API — maps, dashboards, tee-time booking, member portal, inventory, staff scheduling, mobile-friendly PWA, primary REST API | v0.1 (day one) |
| **Rust** (`super-raster` CLI/service) | Drone ortho → vegetation index raster → PMTiles. GDAL bindings via `gdal-rs`. CPU-heavy batch work. | v0.1 (Phase 2, see §7) |
| **Elixir / Phoenix** | Realtime control plane: MQTT sensor ingest, supervised irrigation control, Oban-scheduled phenology jobs, WebSocket fan-out to the TS clients | v0.3+ when sensors arrive |

The polyglot is the **destination**, not the starting point. Each runtime joins when there is a concrete workload it is uniquely suited for. The architecture is designed so each runtime slots in without forcing the others to be rewritten.

## 3. v0.1 scope

v0.1 is the **garden vegetation-index tool**: a single-user web app where the author uploads drone orthomosaics of his garden, defines spatial zones, and views per-zone RGB vegetation index overlays (VARI / GLI / ExG) on an interactive map.

### v0.1 user journey

1. Open the web app on phone or laptop.
2. Draw / edit spatial zones on a basemap of the garden (raised beds, lawn, native border, paths).
3. After a drone flight, upload the orthomosaic GeoTIFF.
4. The system computes VARI, GLI, and ExG index rasters and generates PMTiles for the map.
5. View any index as an overlay on the map; see per-zone aggregate statistics (mean, min, max, std, change vs previous flight).
6. Flight history per zone: a time-series chart of index aggregates.

### In scope for v0.1

- Spatial parcel + zone CRUD
- Ortho upload, ingest, index computation, PMTiles generation
- Per-zone aggregate computation and storage
- Map overlay UI with index switching and zone outlines
- Per-zone time-series chart
- Single-user authentication (Supabase Auth)
- Append-only `audit_log` from the first migration
- Nightly Postgres backup to R2
- Basic observability (Sentry + Supabase logs)
- Mobile-friendly responsive UI
- Local-dev deployment with Cloudflare Tunnel for phone access from the garden

### Out of scope for v0.1 (long-term issues, not v0.1 issues)

- Multispectral / true NDVI (requires hardware not owned)
- Sensor telemetry pipeline (v0.3)
- Irrigation automation (v0.3+)
- Phenology-aware scheduling engine (v0.4+)
- Tee time booking, members, revenue, inventory, staff scheduling (v0.4+)
- USDA NRCS / CRP / Audubon exports (v0.5+)
- Multi-tenant / real-course onboarding (v1.0)
- Drone mission automation (DJI Fly handles missions for v0.1; in-app mission planning is post-v1.0)

## 4. Prerequisite — thesis validation spike

Before any code is written, the author will run a manual validation spike to confirm the v0.1 thesis is sound:

1. Fly the garden with the DJI Flip and generate an orthomosaic in WebODM or DroneDeploy.
2. Open the ortho in QGIS.
3. Use the raster calculator to compute VARI: `(B2 - B1) / (B2 + B1 - B3)` (where B1=R, B2=G, B3=B).
4. Examine the result: do zones with different vegetation states produce visibly different index values?

**Decision rule:**

- **If index values clearly separate** zones with different vegetation states (bare soil vs vegetated vs stressed): the v0.1 thesis is validated and we proceed with this design.
- **If values are visually flat** across the garden: v0.1 is redesigned before any code is written. Possible re-targeted signals include irrigation dry-spot detection after a heat wave, mowed/unmowed boundary mapping, or change detection between consecutive flights. The architecture in §5 stays valid; the data model and UI surface change.

This spike is a direct response to the pre-mortem's finding that a 400 sq ft garden may not produce actionable signal from RGB vegetation indices. Validating cheaply, before architecture commitment hardens, is the explicit guard against that failure mode.

## 5. Architecture

```
┌─────────────────────────────────────┐
│  React SPA (apps/web)               │
│  Vite + React + TypeScript          │
│  Tailwind + shadcn                  │
│  MapLibre GL JS                     │
│  terra-draw (zone editor)           │
│  Supabase JS client (auth + signed  │
│    storage URLs only)               │
│  Deploy: Cloudflare Pages           │
└──────────────────┬──────────────────┘
                   │ HTTPS / JSON
                   ▼
┌─────────────────────────────────────┐
│  Hono backend (apps/api)            │
│  Node 22 or Bun                     │
│  Hono + Zod + Drizzle               │
│  Supabase Auth JWT verification     │
│  Owns all writes to Postgres        │
│  Owns all uploads to Supabase       │
│    Storage                          │
│  Spawns raster ingest subprocess    │
│  Deploy v0.1: local + CF Tunnel     │
│  Deploy v0.1.5: Fly.io machine      │
└─────┬─────────────────────┬─────────┘
      │ SQL                 │ spawn (per ingest)
      ▼                     ▼
┌─────────────────┐   ┌─────────────────────────────┐
│  Supabase       │   │  Raster ingest subprocess   │
│  Postgres 15+   │   │  Phase 1 (weeks 1–3):       │
│  PostGIS 3.x    │   │    GDAL CLI shell-out       │
│  Storage (R2-   │   │    (gdal_calc, gdal2tiles,  │
│   backed)       │   │     pmtiles convert)        │
│  Auth           │   │  Phase 2 (weeks 4–6):       │
│  audit_log      │   │    super-raster (Rust)      │
└─────────────────┘   │    gdal-rs + image + sqlx   │
                      │    Same CLI contract        │
                      └─────────────────────────────┘
```

### Ownership rules (load-bearing)

- **Hono owns all writes to Postgres and Storage.** The raster ingest subprocess does not write Postgres or upload to Storage directly. It produces files in a local working directory and emits a JSON manifest to stdout. Hono parses the manifest, validates it against the schema, and performs all DB and Storage writes within transactions. This rule prevents the schema-drift and transactional-integrity failure mode the architecture review flagged.
- **React owns no business logic.** It calls Hono and renders results. State management is server-driven (TanStack Query). This keeps the door open for a native or Phoenix-served client later without rewriting domain logic.
- **The raster subprocess owns GDAL.** Anything that touches pixel math lives there. The TypeScript layer never imports a raster library.
- **Postgres + PostGIS is the spine.** All spatial vectors, all per-zone aggregates, all flight metadata, all user/auth data live in Postgres. Raster pixel data lives in Storage; only references and aggregates live in the DB.

### Data flow: upload a flight → see overlay

1. User selects an ortho GeoTIFF in the React uploader.
2. React POSTs `/api/flights` to Hono with metadata (parcel, flown_at).
3. Hono creates a `flights` row with `status='uploading'`, returns a signed Supabase Storage upload URL.
4. React uploads the ortho directly to Supabase Storage using the signed URL.
5. React POSTs `/api/flights/{id}/ingest` to Hono.
6. Hono fetches the ortho into a working directory, spawns the ingest subprocess, awaits the JSON manifest on stdout.
7. Hono uploads the index PMTiles to Storage, inserts `raster_layers` rows, computes per-zone aggregates via PostGIS `ST_SummaryStatsAgg`, inserts `zone_index_aggregates`, updates `flights.status='ready'`, writes `audit_log` entries.
8. React polls or listens (Supabase Realtime on the `flights` table) for status, then refreshes the map.

### Data flow: edit a zone

1. User draws or edits a polygon in MapLibre via terra-draw.
2. React POSTs `/api/zones` to Hono with GeoJSON.
3. Hono validates with Zod, converts to PostGIS geometry via Drizzle, inserts, writes `audit_log`, returns the saved zone.
4. React updates the map.

## 6. Tech stack

### React SPA (`apps/web`)
- Vite 5 + React 18 + TypeScript 5
- Tailwind 4 + shadcn/ui
- TanStack Router + TanStack Query
- MapLibre GL JS + PMTiles plugin
- terra-draw for polygon editing
- Supabase JS client (auth and signed-URL fetching only — does not query domain tables)
- Recharts for time-series

### Hono backend (`apps/api`)
- Hono 4 on Node 22 (Bun viable, Node chosen for subprocess and GDAL library stability)
- Drizzle ORM with `drizzle-orm/postgres-js` driver
- Zod for request validation
- `@supabase/supabase-js` server client for Storage and Auth verification
- `node:child_process` for subprocess management
- pino for structured logs
- @sentry/node for error capture

### Raster subprocess
- **Phase 1:** GDAL ≥ 3.8 system install; shell-out to `gdal_calc.py`, `gdal2tiles.py`, `pmtiles convert` (from go-pmtiles)
- **Phase 2:** `super-raster` Rust binary (`apps/raster`), crates: `gdal`, `image`, `serde`, `serde_json`, `clap`, `anyhow`. Same input/output contract as Phase 1 so Hono swaps `command` string only.

### Supabase
- Postgres 15+ with PostGIS extension enabled
- Storage with R2-backed bucket (`orthos/`, `tiles/`, `backups/`)
- Auth (email magic link, single user in v0.1)
- Realtime on `flights` table for status updates

### Shared
- `packages/shared` — Zod schemas + TypeScript types shared between `apps/web` and `apps/api`
- `packages/db` — Drizzle schema + migrations, consumed by `apps/api` (and read-only by `apps/raster` for Phase 2 type generation)

## 7. v0.1 phasing

### Phase 0 — Thesis spike (1 evening)
Per §4. No code.

### Phase 1 — Vertical slice on GDAL CLI (weeks 1–3)
Goal: by end of week 3, the author can fly the garden, upload the ortho via the web UI from his phone, and see VARI overlaid on his zones.

- Repo scaffolding (monorepo, pnpm workspaces, Cargo workspace placeholder)
- Supabase project + initial Drizzle schema + `audit_log`
- Hono backend with `/api/parcels`, `/api/zones`, `/api/flights`, `/api/flights/{id}/ingest`
- React SPA with auth, parcel/zone editor, ortho uploader, map overlay
- GDAL CLI subprocess for VARI/GLI/ExG computation and PMTiles generation
- Local dev + Cloudflare Tunnel for phone access
- Nightly `pg_dump` cron to R2
- Sentry wired

### Phase 2 — Rust ingest replacement (weeks 4–6)
Goal: replace the GDAL CLI subprocess with `super-raster` (Rust) using the same I/O contract.

- `apps/raster` Cargo crate
- gdal-rs reading the ortho, computing index rasters
- PMTiles output via `pmtiles` crate or shell-out (acceptable interim)
- Same JSON manifest stdout contract
- CI builds the binary for the dev's OS; Phase 2 ships when the binary works on real orthos, not when it compiles
- The GDAL CLI path remains available behind a feature flag as a fallback

**Tripwire:** if at end of week 5 the Rust binary cannot process a real garden ortho end-to-end, Phase 2 is paused and v0.1 ships on the GDAL CLI path. Rust is deferred to v0.2.

### Phase 3 — Polish and dogfood (weeks 7–8 if needed)
- Time-series UI per zone
- Index legend, opacity controls, basemap switching
- One full season of flights captured before v0.2 planning

## 8. Data model (v0.1)

All tables append `created_at`, `updated_at`. All write operations also insert an `audit_log` row in the same transaction.

```
users
  id, email, created_at, last_login_at
  (managed by Supabase Auth; mirrored read-only here for FK)

parcels
  id, user_id, name, centroid (geography(POINT,4326)),
  default_basemap, notes

zones
  id, parcel_id, name, kind ENUM(bed, lawn, path, native, other),
  geom (geometry(POLYGON,4326)), color, notes

flights
  id, parcel_id, flown_at, drone_model, status ENUM(uploading, ingesting, ready, failed),
  raw_ortho_path, error_message, weather_conditions JSON

raster_layers
  id, flight_id, kind ENUM(ortho, vari, gli, exg),
  pmtiles_path, min_value, max_value, srid, bounds (geometry(POLYGON,4326))

zone_index_aggregates
  id, flight_id, zone_id, kind ENUM(vari, gli, exg),
  mean, min, max, stddev, pixel_count

audit_log
  id, actor_id, action TEXT, entity_type TEXT, entity_id UUID,
  diff JSONB, occurred_at
  (append-only; no UPDATE or DELETE policy)
```

### Indexes
- GIST on `zones.geom`, `raster_layers.bounds`
- BTREE on `flights(parcel_id, flown_at DESC)`
- BTREE on `zone_index_aggregates(zone_id, kind, flight_id)`

### PostGIS extensions enabled
- `postgis`
- `postgis_raster` (for per-zone aggregate computation via `ST_SummaryStatsAgg`)

## 9. Repo layout

```
superintendent/
├── apps/
│   ├── web/              # Vite React SPA
│   ├── api/              # Hono backend
│   └── raster/           # Rust super-raster (Cargo crate, Phase 2)
├── packages/
│   ├── shared/           # Zod schemas, TS types
│   └── db/               # Drizzle schema, migrations
├── infra/
│   ├── supabase/         # Supabase project config
│   ├── tunnels/          # Cloudflare Tunnel config
│   └── backups/          # pg_dump cron + R2 upload script
├── docs/
│   └── superpowers/
│       └── specs/        # design docs
├── .github/
│   ├── workflows/        # CI
│   └── ISSUE_TEMPLATE/
├── pnpm-workspace.yaml
├── Cargo.toml            # workspace (Phase 2)
├── README.md
└── LICENSE
```

## 10. Operational essentials

| Concern | v0.1 answer |
|---|---|
| Backups | `pg_dump` of Supabase Postgres to R2 nightly via Fly.io or local cron + rclone. Storage bucket has versioning. |
| Observability | Sentry (errors), pino structured logs piped to Supabase logs or Better Stack free tier, Supabase dashboard for DB metrics |
| Secrets | `.env` files git-ignored; Supabase service role key only on the Hono server; Rust binary gets a scoped read-only token if it ever needs to read storage directly |
| Auth | Supabase Auth (magic link). Hono verifies JWTs on every request. Single user in v0.1; RLS policies written from day one anticipating multi-user. |
| CI | One GitHub Actions workflow: `pnpm install`, lint, typecheck, vitest, build all apps. Rust workflow added in Phase 2. |
| Schema migrations | Drizzle `migrate` with squashed history reset only allowed pre-v0.1-launch. Once a real flight is ingested, migrations are forward-only. |
| Conservation audit trail | `audit_log` from the first migration. Every domain write inserts a log row in the same transaction. Append-only by Postgres policy. |

## 11. Risks and explicit mitigations

| Risk (source) | Mitigation in this spec |
|---|---|
| **Thesis fails on garden scale** (pre-mortem) | §4 thesis spike before code. If signal is flat, v0.1 redesigned. |
| **Rust gdal-rs yak-shave consumes v0.1** (pre-mortem, critical review) | §7 Phase 1 ships full vertical on GDAL CLI before Rust starts. Phase 2 swaps the subprocess; if it fails by end of week 5, v0.1 ships on Phase 1 path and Rust is deferred to v0.2. |
| **Schema drift between Hono and Rust** (critical review) | Rust does not write Postgres. It emits a JSON manifest to stdout; Hono performs writes. The schema has one writer. |
| **Auth integration tax of separate frontend + backend** (critical review) | Both apps share a Supabase Auth realm. React holds the session; Hono verifies JWTs. No custom JWT issuance. Shared `packages/shared` types eliminate API-shape drift. |
| **Polyglot multiplies cognitive load** (devil's advocate) | v0.1 is one runtime + a CLI subprocess (Phase 1) or two runtimes (Phase 2). Phoenix and the full polyglot are explicitly deferred until workloads justify them. |
| **Retrofit of audit trail at year 5** (critical review) | `audit_log` is in the first migration with strict triggers. Every domain mutation writes a row. |
| **Reliability is aspirational without observability + backups** (critical review) | Sentry, Supabase logs, nightly pg_dump are §10 requirements before v0.1 is considered shippable. |
| **Side projects leak one secret** (critical review) | `.env` rules in repo, service-role key scoped to Hono server only, periodic rotation calendar reminder. |

## 12. Long-term roadmap (becomes GitHub milestones + issues)

These are explicitly **out of v0.1** and live as GitHub issues against their milestones.

### v0.2 — Raster polish & second site
- Multispectral capture support (when hardware acquired) → real NDVI
- Change detection between flights (per-zone delta over time)
- Index thresholding and zone-state classification rules
- Public read-only sharing link for a flight

### v0.3 — Sensors arrive (Phoenix joins)
- Phoenix app added as sibling service to Hono
- MQTT broker integration
- Soil moisture / temp / weather sensor ingest
- TimescaleDB hypertable for time-series sensor data
- Realtime sensor dashboard in React (WS to Phoenix Channels)
- Per-zone sensor placement

### v0.4 — Phenology + scheduling
- Phenology model for OKC zone 7a native species (buffalograss, blue grama, sideoats grama, little bluestem)
- Calendar of mow / overseed / burn / no-mow windows
- Tasks and reminders
- Weather integration (NOAA)

### v0.5 — Business operations (the "real platform" surface)
- Tee time booking
- Member roster + membership types
- Daily revenue log + POS integration
- Inventory tracking
- Staff schedule

### v0.6 — Compliance & reporting
- USDA NRCS practice records export
- CRP record-keeping export
- Audubon Cooperative Sanctuary Program data export
- Annual conservation report PDF

### v0.7 — Irrigation control
- Integration with one controllable irrigation system (Rain Bird IQ4 or Hunter Centralus)
- Manual valve operation
- Phenology-aware automation (e.g., suspend during dormancy)
- Phoenix supervised processes for valve control

### v1.0 — Real course onboarding
- Multi-tenant data model
- Per-course branding
- Onboarding wizard
- First non-author course in production

## 13. Open questions

- **Hono runtime: Node vs Bun?** Defaulting to Node 22 for subprocess and Sentry stability; revisit if Bun proves it for both.
- **PMTiles generation in Phase 1: `pmtiles convert` (go-pmtiles) or `tippecanoe` then convert?** Defer to implementation; either works.
- **Supabase pooler mode for Drizzle:** transaction pooler breaks some prepared statements; use direct connection for migrations and session-mode pooler for runtime if issues arise.
- **Phase 2 Rust binary distribution:** built locally for v0.1 dev. CI cross-compile only when v0.1.5 deploys to Fly.io.
- **Domain name for the eventual public app:** TBD; Cloudflare Tunnel works on any subdomain.

---

**End of spec.**

This document is the source of truth for v0.1. The long-term roadmap in §12 becomes GitHub milestones and issues. Implementation planning happens in a follow-up document produced by the writing-plans skill, after this spec is approved AND the UI design pass returns.
