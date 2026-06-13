# Superintendent

A management platform for low-input, native-ecology golf courses — structured as three
connected realms: **Conservation · Management · Golf**. Native grasses, zero synthetic
inputs, and a course run as a working ecological system.

### ▸ Vision overview: **https://cner-smith.github.io/superintendent/**

> An *ahead-of-time vision build* — a demonstrable prototype and a resumable project,
> not production software. The full v0.1–v0.3 software is built and runs locally: drone
> RGB vegetation indices, a Rust index processor (`super-raster`), and a realtime
> soil-moisture sensor mesh over MQTT. Four runtimes (TypeScript, Python, Rust,
> Elixir/Phoenix), all integrated.

## Run it
```
./scripts/dev-up.sh        # Postgres+PostGIS · MQTT · API · web · Phoenix
```
→ http://localhost:5173 (toggle **Sensors** for the live mesh).
Needs Docker, Node/pnpm, GDAL, Elixir/Erlang, Rust.

## Start here
New to the repo, or returning after a while? Read **[START_HERE.md](START_HERE.md)** —
current state (what's real vs. simulated vs. hardware-gated), how it's built, and where
to go next. See also [docs/ROADMAP.md](docs/ROADMAP.md), [docs/DEMO.md](docs/DEMO.md),
[docs/REAL_WORLD.md](docs/REAL_WORLD.md), and the GitHub issues/milestones.
