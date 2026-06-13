#!/usr/bin/env bash
# dev-up.sh — one command to run Superintendent locally.
# Starts Postgres+PostGIS (Docker), applies the migration once + seeds a demo
# parcel if the DB is empty, then runs the API + web dev servers.
#   web → http://localhost:5173   api → :3001   db → :54329
set -euo pipefail
cd "$(dirname "$0")/.."

export DATABASE_URL="postgres://superintendent:superintendent@127.0.0.1:54329/superintendent"
export PORT=3001

echo "▸ starting database + MQTT broker…"
docker compose up -d db mqtt
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

# ── Phoenix sensor service (realtime telemetry, :4000) ──────────────────────
# Started in the background; the simulated publisher seeds ~10 nodes for the
# parcel and streams readings over a WebSocket channel the web app subscribes
# to. If it fails to start, the web app degrades gracefully ("sensor offline").
MISE="$HOME/.local/share/mise/installs"
echo "▸ starting Phoenix sensor service (:4000)…"
(
  cd sensor_service
  export PATH="$MISE/elixir/1.17.3/bin:$MISE/erlang/27.2/bin:$MISE/elixir/1.17.3/.mix/escripts:$PATH"
  mix deps.get --quiet >/dev/null 2>&1 || true
  mix ecto.migrate --quiet >/dev/null 2>&1 || true
  exec mix phx.server
) &
# Tear the sensor service down when this script exits (Ctrl+C on pnpm dev).
trap 'pkill -f "mix phx.server" 2>/dev/null || true' EXIT INT TERM

echo "▸ ready — api (:3001) · web (http://localhost:5173) · sensors (:4000)"
pnpm dev
