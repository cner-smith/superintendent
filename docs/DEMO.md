# Demo guide

How to show Superintendent to a university, investor, or partner.

## Two ways to show it
1. **No setup (vision)** — the handoff doc, published at
   `https://cner-smith.github.io/superintendent/` (or open
   `docs/design/superintendent-handoff.html`). Best as an emailed link / first
   impression; it tells the whole three-realm story on its own.
2. **Live app (working software)** — `./scripts/dev-up.sh` → http://localhost:5173.

## 2-minute walkthrough (live app)
1. **The map** — the land. *Draw zone* → click out a polygon → name it. It saves and
   renders as a boundary.
2. **Vegetation health** — pick **VARI / GLI / ExG**. The drone-derived index paints
   the ground; the legend reads stressed → healthy. (A demo flight is pre-seeded, or
   upload an ortho via the API.)
3. **Per-zone trends** — click a zone → its index values across flights.
4. **Live sensors** — toggle **Sensors** → soil-moisture nodes on the map update live,
   streaming through a real MQTT broker.

## Pitch points
- Built for the *opposite* of conventional turf software: native grasses, zero
  synthetic inputs, the course as a working ecosystem that funds itself (grants,
  steward hours, on-site sourcing).
- The hard tech is **proven**: RGB vegetation indices carry actionable signal, and a
  four-runtime polyglot stack (TS / Python / Rust / Elixir) is integrated and running.
- The cross-wiring is the thesis: drone stress ↔ ground sensors, events → tee
  sheet + crew + finance, member hours → conservation data.

## Be honest (credibility > hype with this audience)
Say plainly what's **real** (the index pipeline, the realtime MQTT path, the
architecture) vs. **simulated/borrowed** (sensor data is generated; the validation
ortho is a borrowed field, not the real site) vs. **not built** (no auth, no deploy,
no real users — and the land/conservation/partnership work is the actual venture).
It's a vision prototype that proves the bets, not a product.
