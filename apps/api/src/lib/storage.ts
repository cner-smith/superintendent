/**
 * storage.ts — FlightStorage abstraction with two backends.
 *
 * Called by: src/routes/flights.ts (POST /flights/:id/ortho).
 * Importers: flightsRouter (ortho upload handler).
 * Public API: FlightStorage interface + getStorage() factory.
 * Backends: LocalStorage (default, UPLOADS_DIR) | SupabaseStorage (SUPABASE_URL +
 *   SUPABASE_SERVICE_ROLE_KEY). Factory picks from env at first call; singleton cached.
 *
 * User instruction: implement flight upload + ingest state machine, issue #3.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface FlightStorage {
  /**
   * Store the ortho buffer under a stable key derived from flightId.
   * Returns the storage key to persist alongside the flight record.
   */
  putOrtho(flightId: string, data: ArrayBuffer): Promise<{ key: string }>;

  /**
   * Resolve a storage key to a local filesystem path the processor can read.
   * For LocalStorage this is trivial; for Supabase it downloads to a temp file.
   */
  getLocalPath(key: string): Promise<string>;
}

// ---------------------------------------------------------------------------
// LocalStorage
// ---------------------------------------------------------------------------

class LocalStorage implements FlightStorage {
  private readonly dir: string;

  constructor(uploadsDir: string) {
    this.dir = uploadsDir;
  }

  async putOrtho(flightId: string, data: ArrayBuffer): Promise<{ key: string }> {
    await fs.mkdir(this.dir, { recursive: true });
    const key = path.join(this.dir, `${flightId}.tif`);
    await fs.writeFile(key, Buffer.from(data));
    return { key };
  }

  async getLocalPath(key: string): Promise<string> {
    return key;
  }
}

// ---------------------------------------------------------------------------
// SupabaseStorage
// ---------------------------------------------------------------------------

const SUPABASE_BUCKET = "flights";

class SupabaseStorage implements FlightStorage {
  private readonly supabase: ReturnType<typeof createClient>;

  constructor(supabaseUrl: string, serviceRoleKey: string) {
    this.supabase = createClient(supabaseUrl, serviceRoleKey);
  }

  async putOrtho(flightId: string, data: ArrayBuffer): Promise<{ key: string }> {
    const key = `${flightId}/ortho.tif`;
    const { error } = await this.supabase.storage
      .from(SUPABASE_BUCKET)
      .upload(key, data, { contentType: "image/tiff", upsert: true });

    if (error) {
      throw new Error(`Supabase Storage upload failed: ${error.message}`);
    }
    return { key };
  }

  async getLocalPath(key: string): Promise<string> {
    const { data, error } = await this.supabase.storage
      .from(SUPABASE_BUCKET)
      .download(key);

    if (error || !data) {
      throw new Error(`Supabase Storage download failed: ${error?.message ?? "no data"}`);
    }

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ortho-"));
    const localPath = path.join(tmpDir, path.basename(key));
    await fs.writeFile(localPath, Buffer.from(await data.arrayBuffer()));
    return localPath;
  }
}

// ---------------------------------------------------------------------------
// Factory (singleton)
// ---------------------------------------------------------------------------

let _storage: FlightStorage | null = null;

/**
 * getStorage — returns the singleton FlightStorage instance.
 *
 * Uses SupabaseStorage when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are both
 * set; falls back to LocalStorage writing under UPLOADS_DIR (default: <cwd>/uploads).
 */
export function getStorage(): FlightStorage {
  if (_storage) return _storage;

  const supabaseUrl = process.env["SUPABASE_URL"];
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

  if (supabaseUrl && serviceRoleKey) {
    _storage = new SupabaseStorage(supabaseUrl, serviceRoleKey);
  } else {
    const uploadsDir =
      process.env["UPLOADS_DIR"] ?? path.resolve(process.cwd(), "uploads");
    _storage = new LocalStorage(uploadsDir);
  }

  return _storage;
}

/** Reset the singleton — only needed in tests. */
export function resetStorage(): void {
  _storage = null;
}

/**
 * getUploadsDir — returns the local uploads directory path.
 * Used by ingest.ts to resolve where to copy overlay PNGs.
 * Always the LocalStorage dir path (UPLOADS_DIR env or <cwd>/uploads).
 */
export function getUploadsDir(): string {
  return process.env["UPLOADS_DIR"] ?? path.resolve(process.cwd(), "uploads");
}
