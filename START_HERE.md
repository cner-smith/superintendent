# START HERE

Read this first when you pick this project back up.

## What this is
Superintendent is a management platform for low-input, native-ecology golf courses —
three connected realms (**Conservation · Management · Golf**). The full vision is in
`docs/design/superintendent-handoff.html` (also published to GitHub Pages — see the README).

**Reality check:** this is an *ahead-of-time* build. You're years from needing it (no
land, course, sensors, or routine drone flights yet). Its job right now is two things:
(1) a **demonstrable vision artifact** for universities / investors / partners, and
(2) a project you can **set down and resume** cold. Optimize for *thinking captured* and
*demoable* — not production-readiness. Much of this code will likely be rebuilt by the
time you actually need it; the durable asset is the thinking and the proven bets.

## Current state — what's real vs. not
The full v0.1–v0.3 software is built and runs locally:

- **v0.1 ✅ Drone vegetation indices** — upload an ortho → VARI/GLI/ExG → draw zones →
  index overlays → per-zone trends. Real pipeline, but validated on a *borrowed*
  agricultural ortho, **not your garden** (see the thesis gap below).
- **v0.2 🚧 Rust `super-raster`** — the Rust index processor is done and live (auto,
  with a Python fallback). **NDVI is hardware-gated** (needs a NIR camera).
- **v0.3 ✅ Realtime sensor mesh** — Phoenix + real MQTT (Mosquitto) + live map UI.
  **Sensor data is simulated** (a publisher posts to the broker); real LoRa nodes just
  point at the same broker/topic.

Four runtimes, all integrated and running: TypeScript (web + API), Python (Phase-1
processor), Rust (`super-raster`), Elixir/Phoenix (sensors). Every hard technical bet is
*proven* on this stack — that's the win that survives a future rewrite.

## Run it
```
./scripts/dev-up.sh        # → Postgres+PostGIS, Mosquitto, Hono API, Vite web, Phoenix
```
Open http://localhost:5173 · toggle **Sensors** for the live mesh.
Needs: Docker, Node/pnpm, GDAL (+python3-gdal), Elixir/Erlang, Rust. The processor
prefers Rust and falls back to Python automatically.

## Where the detail lives
- `docs/ROADMAP.md` — the v0.1→v1.0 version ladder + status.
- GitHub **milestones + issues** — what's done, what's next, per version.
- `docs/REAL_WORLD.md` — what gates progress in *real life* (not code).
- `docs/DEMO.md` — how to show this to someone.
- `docs/design/` — the handoff vision + design mockups.
- Claude project memories — key constraints/gotchas (VARI guard, PostGIS geom serialization, etc.).

## Pick up here (when you return)
Highest-leverage moves, roughly in order — most are gated on real-world steps
(`docs/REAL_WORLD.md`):
1. **Close the v0.1 thesis gap** — fly your actual garden on a calm day and run *that*
   ortho through the pipeline. Everything rests on "RGB indices work at garden scale,"
   still unproven on the real site.
2. **Deploy a demo** for partners — a live link beats setting up a laptop.
3. **v0.4** (phenology scheduling) or a new realm tile (Management/Golf) for breadth.
4. **Harden** (issue #15: auth) before any real or multi-user use.
