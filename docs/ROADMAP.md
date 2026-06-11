# Superintendent — Roadmap

A management platform for low-input, native-ecology golf courses. The product is
organized as three connected realms — **Conservation**, **Management**, **Golf** —
per the product handoff (`docs/design/`). The handoff is the **v1.0 visual + IA
north star**; the version ladder below is how we get there, one validated vertical
at a time. Engineering decisions trace to `docs/superpowers/specs/2026-05-28-superintendent-v0.1-design.md`.

> Status legend: ✅ done · 🚧 in progress · ⏳ planned · 🔒 gated

## Guiding discipline
- Ship one deep vertical before widening. Each runtime joins only when it has a
  concrete workload it uniquely serves (TS from day one; Rust at v0.2; Elixir at v0.3).
- Hono is the **single writer** to Postgres + Supabase Storage.
- Append-only `audit_log` from the first migration (conservation audit trail).

## Version ladder

| Version | Theme | Delivers | Realm / handoff tiles | Status |
|---|---|---|---|---|
| **v0.1** | RGB vegetation indices | Drone ortho upload → VARI/GLI/ExG → zones → per-zone aggregates + time-series | Conservation: Drone Routes (core) | 🚧 |
| **v0.2** | Multispectral + Rust | NDVI when NIR hardware acquired; `super-raster` Rust binary replaces GDAL CLI | Conservation: Drone Routes | ⏳ |
| **v0.3** | Realtime sensors | Phoenix/Elixir MQTT sensor telemetry + realtime dashboards | Conservation: Sensor Mesh, Water | ⏳ |
| **v0.4** | Phenology scheduling | GDD/ET-driven scheduling for OK zone 7a native grasses | Conservation: Mowing, Sod Farm, Weather | ⏳ |
| **v0.5** | Business operations | Tee-time booking, POS / pro shop, finance | Golf + Management: Tee Sheet, Pro Shop, Finance | ⏳ |
| **v0.6** | Compliance exports | USDA NRCS / CRP / Audubon export with no re-keying | Conservation: Research Hub · Management: Suppliers | ⏳ |
| **v0.7** | Irrigation automation | Supervised, sensor-driven irrigation control | Conservation: Water Systems | ⏳ |
| **v1.0** | Multi-tenant | Onboarding for the first non-author course | All realms | ⏳ |

## v0.1 — current focus

**Goal:** a single-user web app where you upload a drone orthomosaic, draw zones on a
map, and see RGB vegetation-index overlays with per-zone statistics over time.

**Phase 1 (GDAL CLI):** full vertical slice — upload → GDAL index computation → tiles
→ zone aggregates → map overlay. No Rust yet.
**Phase 2 (Rust):** swap in `super-raster`. Tripwire: defer to v0.2 if it can't process a
real ortho end-to-end by week 5.

**Thesis gate (status):**
- ✅ RGB indices carry actionable signal — validated on a true-color agricultural ortho
  (`spikes/vari-thesis/`, 2026-06-11). Indices cleanly separate vegetation from
  roads/structures and vary field-to-field.
- ✅ Known pipeline constraint banked: VARI denominator instability → clamp + clip
  (see project memory `vari-numerical-instability`).
- 🔒 **Garden-scale signal in native grass at ~400 sq ft** — still requires an actual
  flight on a calm day (windy season in OK as of 2026-06-11). No longer blocks code.

**Stack:** Vite + React (MapLibre GL, terra-draw) · Hono + Drizzle · GDAL (Phase 1) ·
Supabase (Postgres/PostGIS/Storage/Auth) · Cloudflare Tunnel for in-garden phone access.

## Build order (tracked in GitHub issues under the v0.1 milestone)
1. Repo skeleton (Vite + React + Hono)
2. PostGIS schema migration (parcels, zones, flights, raster_layers, zone_index_aggregates, audit_log)
3. Flight upload + ingest state machine
4. GDAL index computation step (VARI guarded)
5. Map + zone-drawing UI (index switcher + opacity)
6. Per-zone aggregates + time-series view
