/**
 * useSensorChannel.ts — Phoenix WebSocket hook for live soil-moisture data.
 * Connects to the sensor_service on ws://localhost:4000/socket (or VITE_SENSOR_WS_URL),
 * joins channel `sensors:${parcelId}`, merges join-reply + live "new_reading" pushes.
 * Exposes { connected, nodes, readings } — never throws; degrades to connected:false.
 * Called by: MapView.tsx
 */
import { useEffect, useRef, useState } from "react";
import { Socket } from "phoenix";

// ── Public types ──────────────────────────────────────────────────────────────

export interface SensorNode {
  id: number;
  label: string;
  lat: number;
  lng: number;
  depth_bands: string[];
}

/** Per-band live reading with rolling sparkline history (last 30 values). */
export interface BandReading {
  value: number;
  at: string;
  history: number[];
}

/**
 * Live readings keyed node_id → depth_band → BandReading.
 * Using string keys for node_id so it maps cleanly to a plain object.
 */
export type ReadingsMap = Record<string, Record<string, BandReading>>;

export interface UseSensorChannelResult {
  connected: boolean;
  nodes: SensorNode[];
  readings: ReadingsMap;
}

// ── Wire shapes from Phoenix channel ─────────────────────────────────────────

interface JoinPayload {
  nodes: SensorNode[];
  readings: Array<{ node_id: number; depth_band: string; value: number; at: string }>;
}

interface NewReadingPayload {
  node_id: number;
  depth_band: string;
  value: number;
  at: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const HISTORY_MAX = 30;
const WS_URL =
  (import.meta as ImportMeta & { env: Record<string, string | undefined> }).env
    .VITE_SENSOR_WS_URL ?? "ws://localhost:4000/socket";

// ── Helpers ───────────────────────────────────────────────────────────────────

function isJoinPayload(v: unknown): v is JoinPayload {
  return (
    v !== null &&
    typeof v === "object" &&
    "nodes" in v &&
    "readings" in v &&
    Array.isArray((v as JoinPayload).nodes) &&
    Array.isArray((v as JoinPayload).readings)
  );
}

function isNewReadingPayload(v: unknown): v is NewReadingPayload {
  return (
    v !== null &&
    typeof v === "object" &&
    "node_id" in v &&
    "depth_band" in v &&
    "value" in v &&
    typeof (v as NewReadingPayload).node_id === "number" &&
    typeof (v as NewReadingPayload).depth_band === "string" &&
    typeof (v as NewReadingPayload).value === "number"
  );
}

function applyReading(
  prev: ReadingsMap,
  nodeId: number,
  depthBand: string,
  value: number,
  at: string,
): ReadingsMap {
  const key = String(nodeId);
  const existing = prev[key] ?? {};
  const band = existing[depthBand];
  const prevHistory = band?.history ?? [];
  const nextHistory = [...prevHistory, value].slice(-HISTORY_MAX);

  return {
    ...prev,
    [key]: {
      ...existing,
      [depthBand]: { value, at, history: nextHistory },
    },
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useSensorChannel(parcelId: string): UseSensorChannelResult {
  const [connected, setConnected] = useState(false);
  const [nodes, setNodes] = useState<SensorNode[]>([]);
  const [readings, setReadings] = useState<ReadingsMap>({});

  // Stable ref to avoid re-creating effect on every readings state change
  const readingsRef = useRef<ReadingsMap>({});

  useEffect(() => {
    if (!parcelId) return;

    let socket: Socket | null = null;
    let cancelled = false;

    try {
      socket = new Socket(WS_URL, { timeout: 5_000 });

      socket.onOpen(() => {
        if (!cancelled) setConnected(true);
      });

      socket.onClose(() => {
        if (!cancelled) setConnected(false);
      });

      socket.onError(() => {
        if (!cancelled) setConnected(false);
      });

      socket.connect();

      const channel = socket.channel(`sensors:${parcelId}`, {});

      // Handle join reply ── populate initial nodes + readings
      channel
        .join()
        .receive("ok", (payload: unknown) => {
          if (cancelled || !isJoinPayload(payload)) return;

          setNodes(payload.nodes);

          let map: ReadingsMap = {};
          for (const r of payload.readings) {
            map = applyReading(map, r.node_id, r.depth_band, r.value, r.at);
          }
          readingsRef.current = map;
          setReadings(map);
          setConnected(true);
        })
        .receive("error", () => {
          if (!cancelled) setConnected(false);
        })
        .receive("timeout", () => {
          if (!cancelled) setConnected(false);
        });

      // Handle live pushes
      channel.on("new_reading", (payload: unknown) => {
        if (cancelled || !isNewReadingPayload(payload)) return;

        const next = applyReading(
          readingsRef.current,
          payload.node_id,
          payload.depth_band,
          payload.value,
          payload.at,
        );
        readingsRef.current = next;
        setReadings(next);
      });
    } catch {
      // Socket construction failed (e.g. bad URL); stay disconnected gracefully
      setConnected(false);
    }

    return () => {
      cancelled = true;
      try {
        socket?.disconnect();
      } catch {
        // Ignore disconnect errors on cleanup
      }
    };
  }, [parcelId]);

  return { connected, nodes, readings };
}
