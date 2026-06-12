#!/usr/bin/env bash
# dev-up.sh — one command to run Superintendent locally.
# Starts Postgres+PostGIS (Docker), applies the migration once + seeds a demo
# parcel if the DB is empty, then runs the API + web dev servers.
#   web → http://localhost:5173   api → :3001   db → :54329
set -euo pipefail
cd "$(dirname "$0")/.."

export DATABASE_URL="postgres://superintendent:superintendent@127.0.0.1:54329/superintendent"
export PORT=3001

echo "▸ starting database…"
docker compose up -d db
# Wait until the superintendent DB is actually queryable — pg_isready can pass
# before first-time init finishes creating POSTGRES_DB.
until docker compose exec -T db psql -U superintendent -d superintendent -tAc 'select 1' >/dev/null 2>&1; do
  sleep 1
done

# Apply the schema only if it isn't there yet (the FK constraints aren't
# re-runnable, so we guard rather than rely on idempotency).
applied=$(docker compose exec -T db psql -U superintendent -d superintendent -tAc \
  "SELECT to_regclass('public.zones') IS NOT NULL;" | tr -d '[:space:]')
if [ "$applied" != "t" ]; then
  echo "▸ applying migration…"
  for f in packages/db/migrations/*.sql; do
    docker compose exec -T db psql -v ON_ERROR_STOP=1 -U superintendent -d superintendent < "$f" >/dev/null
  done
else
  echo "▸ schema already present — skipping migration"
fi

echo "▸ seeding demo parcel if empty…"
docker compose exec -T db psql -U superintendent -d superintendent -tAc \
  "INSERT INTO parcels (name, centroid) SELECT 'Pine Hollow Garden', ST_GeogFromText('SRID=4326;POINT(-86.576 39.269)') WHERE NOT EXISTS (SELECT 1 FROM parcels);" >/dev/null

echo "▸ ready — starting api (:3001) + web (http://localhost:5173)…"
exec pnpm dev
