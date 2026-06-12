/**
 * processor.ts — subprocess wrapper for the flight index processor.
 *
 * Called by: src/lib/ingest.ts (runProcessor).
 * Picks an implementation and parses its stdout JSON manifest:
 *   - "rust"   → the super-raster binary (Phase-2, fast).
 *   - "python" → processor/process_flight.py (Phase-1 GDAL CLI, the fallback).
 * Both share the same CLI args and emit the identical manifest. In "auto"
 * (default) the Rust binary runs first if it's built, with Python as a runtime
 * fallback if Rust errors — honoring the v0.2 tripwire (never block on Rust).
 * Selection envs: PROCESSOR_IMPL (auto|rust|python), SUPER_RASTER_BIN,
 * PROCESSOR_PYTHON, PROCESSOR_SCRIPT.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import * as path from "node:path";
import * as url from "node:url";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Manifest schema + type
// ---------------------------------------------------------------------------

const indexResultSchema = z.object({
  index_kind: z.enum(["vari", "gli", "exg"]),
  raster_path: z.string(),
  overlay_png: z.string(),
  bounds_4326: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  display_stretch: z.tuple([z.number(), z.number()]),
});

const zoneAggregateSchema = z.object({
  zone_id: z.string().uuid(),
  index_kind: z.enum(["vari", "gli", "exg"]),
  mean: z.number(),
  min: z.number(),
  max: z.number(),
  stddev: z.number(),
  pixel_count: z.number().int(),
});

export const manifestSchema = z.object({
  flight_id: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  bounds_4326: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  indices: z.array(indexResultSchema),
  zone_aggregates: z.array(zoneAggregateSchema),
});

export type IndexResult = z.infer<typeof indexResultSchema>;
export type ZoneAggregate = z.infer<typeof zoneAggregateSchema>;
export type Manifest = z.infer<typeof manifestSchema>;

// ---------------------------------------------------------------------------
// Implementation resolution
// ---------------------------------------------------------------------------

export interface RunProcessorOptions {
  orthoPath: string;
  zonesGeoJsonPath: string;
  flightId: string;
  outDir: string;
}

/** Repo-root-relative path. processor.ts is at apps/api/src/lib/. */
function repoPath(...segments: string[]): string {
  const thisFile = url.fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(thisFile), "../../../../", ...segments);
}

function defaultPythonScript(): string {
  return repoPath("processor/process_flight.py");
}

function defaultRustBin(): string {
  return repoPath("super-raster/target/release/super-raster");
}

interface ProcStep {
  label: "rust" | "python";
  command: string;
  args: string[];
}

/** Build the ordered list of implementations to try, given env + what's built. */
function resolvePlan(opts: RunProcessorOptions): ProcStep[] {
  const baseArgs = [
    "--ortho", opts.orthoPath,
    "--out", opts.outDir,
    "--zones", opts.zonesGeoJsonPath,
    "--flight-id", opts.flightId,
  ];

  const rustBin = process.env["SUPER_RASTER_BIN"] ?? defaultRustBin();
  const python = process.env["PROCESSOR_PYTHON"] ?? "python3";
  const script = process.env["PROCESSOR_SCRIPT"] ?? defaultPythonScript();

  const rust: ProcStep = { label: "rust", command: rustBin, args: baseArgs };
  const py: ProcStep = { label: "python", command: python, args: [script, ...baseArgs] };

  const impl = process.env["PROCESSOR_IMPL"] ?? "auto";
  if (impl === "python") return [py];
  if (impl === "rust") return [rust];
  // auto: Rust first (if built) with Python fallback; else Python only.
  return existsSync(rustBin) ? [rust, py] : [py];
}

/**
 * runProcessor — run the index processor (Rust super-raster, falling back to the
 * Python GDAL script) and return its validated manifest.
 */
export async function runProcessor(opts: RunProcessorOptions): Promise<Manifest> {
  const plan = resolvePlan(opts);
  let lastErr: unknown;

  for (let i = 0; i < plan.length; i++) {
    const step = plan[i]!;
    try {
      return await spawnAndParse(step);
    } catch (err) {
      lastErr = err;
      const next = plan[i + 1];
      if (next) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[processor] ${step.label} failed; falling back to ${next.label}: ${msg}`);
      }
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** Spawn one implementation and parse its stdout manifest. */
function spawnAndParse(step: ProcStep): Promise<Manifest> {
  return new Promise((resolve, reject) => {
    const child = spawn(step.command, step.args, { stdio: ["ignore", "pipe", "pipe"] });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    child.on("error", (err) => {
      reject(new Error(`Failed to spawn ${step.label} processor (${step.command}): ${err.message}`));
    });

    child.on("close", (code) => {
      if (code !== 0) {
        const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
        reject(new Error(`${step.label} processor exited with code ${String(code)}.\nstderr:\n${stderr}`));
        return;
      }

      const stdout = Buffer.concat(stdoutChunks).toString("utf8").trim();
      let raw: unknown;
      try {
        raw = JSON.parse(stdout);
      } catch (parseErr) {
        reject(new Error(`${step.label} stdout was not valid JSON: ${String(parseErr)}\nraw: ${stdout.slice(0, 500)}`));
        return;
      }

      const parsed = manifestSchema.safeParse(raw);
      if (!parsed.success) {
        reject(new Error(`${step.label} manifest failed schema validation: ${parsed.error.message}`));
        return;
      }

      resolve(parsed.data);
    });
  });
}
