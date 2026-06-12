/**
 * processor.ts — subprocess wrapper for the Phase-1 Python flight processor.
 *
 * Called by: src/lib/ingest.ts (runProcessor)
 * No existing duplicate in apps/api/src/.
 * Data structure: Manifest type + Zod schema; runProcessor() input/output typed.
 * Purpose: wire up the index step (Phase-1 GDAL flight processor integration).
 *
 * The Python script is invoked as a child process. It writes output files to
 * --out, prints a JSON manifest to stdout, and progress to stderr.
 * Exit non-zero means failure — we reject with stderr as the error message.
 */
import { spawn } from "node:child_process";
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
// Processor invocation
// ---------------------------------------------------------------------------

export interface RunProcessorOptions {
  orthoPath: string;
  zonesGeoJsonPath: string;
  flightId: string;
  outDir: string;
}

/**
 * Resolve the default processor script path relative to the repo root.
 * __dirname equiv for ESM: derive from import.meta.url.
 */
function defaultScriptPath(): string {
  const thisFile = url.fileURLToPath(import.meta.url);
  // apps/api/src/lib/processor.ts → ../../../../processor/process_flight.py
  return path.resolve(path.dirname(thisFile), "../../../../processor/process_flight.py");
}

/**
 * runProcessor — spawn the Python flight processor and parse its stdout manifest.
 *
 * Reads PROCESSOR_PYTHON (default: "python3") and PROCESSOR_SCRIPT (default:
 * repo-relative processor/process_flight.py) from the environment so that
 * the binary and script path can be overridden in CI / containerised deploys.
 */
export async function runProcessor(opts: RunProcessorOptions): Promise<Manifest> {
  const python = process.env["PROCESSOR_PYTHON"] ?? "python3";
  const script = process.env["PROCESSOR_SCRIPT"] ?? defaultScriptPath();

  const args = [
    script,
    "--ortho", opts.orthoPath,
    "--out", opts.outDir,
    "--zones", opts.zonesGeoJsonPath,
    "--flight-id", opts.flightId,
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(python, args, { stdio: ["ignore", "pipe", "pipe"] });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    child.on("error", (err) => {
      reject(new Error(`Failed to spawn processor: ${err.message}`));
    });

    child.on("close", (code) => {
      if (code !== 0) {
        const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
        reject(
          new Error(
            `Processor exited with code ${String(code)}.\nstderr:\n${stderr}`,
          ),
        );
        return;
      }

      const stdout = Buffer.concat(stdoutChunks).toString("utf8").trim();
      let raw: unknown;
      try {
        raw = JSON.parse(stdout);
      } catch (parseErr) {
        reject(
          new Error(
            `Processor stdout was not valid JSON: ${String(parseErr)}\nraw: ${stdout.slice(0, 500)}`,
          ),
        );
        return;
      }

      const parsed = manifestSchema.safeParse(raw);
      if (!parsed.success) {
        reject(
          new Error(
            `Processor manifest failed schema validation: ${parsed.error.message}`,
          ),
        );
        return;
      }

      resolve(parsed.data);
    });
  });
}
