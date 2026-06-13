/**
 * SensorPanel.tsx — floating live-reading panel for a clicked sensor node.
 * Mirrors the ZoneTimeline floating-panel pattern (bottom-right, absolute positioning).
 * Shows node label, per-band current value + inline SVG sparkline, connection dot.
 * Called by: MapView.tsx when a sensor node marker is clicked.
 */
import React from "react";
import type { SensorNode, BandReading, ReadingsMap } from "../hooks/useSensorChannel.js";
import styles from "./SensorPanel.module.css";

// ── Sparkline ─────────────────────────────────────────────────────────────────

const SPK_W = 80;
const SPK_H = 24;
const SPK_PAD_X = 2;
const SPK_PAD_Y = 2;

interface SparklineProps {
  history: number[];
  color: string;
}

function Sparkline({ history, color }: SparklineProps) {
  if (history.length < 2) {
    // Single dot centred
    return (
      <svg
        viewBox={`0 0 ${SPK_W} ${SPK_H}`}
        width={SPK_W}
        height={SPK_H}
        aria-hidden="true"
        className={styles.sparkline}
      >
        <circle cx={SPK_W / 2} cy={SPK_H / 2} r={2} fill={color} />
      </svg>
    );
  }

  const rawMin = Math.min(...history);
  const rawMax = Math.max(...history);
  const range = rawMax === rawMin ? 1 : rawMax - rawMin;

  const chartW = SPK_W - SPK_PAD_X * 2;
  const chartH = SPK_H - SPK_PAD_Y * 2;

  const x = (i: number) => SPK_PAD_X + (i / (history.length - 1)) * chartW;
  const y = (v: number) => SPK_PAD_Y + chartH - ((v - rawMin) / range) * chartH;

  const d = history
    .map((v, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(" ");

  const lastX = x(history.length - 1);
  const lastY = y(history[history.length - 1]!);

  return (
    <svg
      viewBox={`0 0 ${SPK_W} ${SPK_H}`}
      width={SPK_W}
      height={SPK_H}
      aria-hidden="true"
      className={styles.sparkline}
    >
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.85}
      />
      <circle cx={lastX} cy={lastY} r={2} fill={color} />
    </svg>
  );
}

// ── Depth-band color ramp (consistent across bands) ──────────────────────────

const BAND_COLORS: Record<string, string> = {
  "0-4in":   "#1f8e9e",
  "4-8in":   "#138a63",
  "8-12in":  "#b8881a",
};

function bandColor(band: string): string {
  return BAND_COLORS[band] ?? "#4c6c5a";
}

// ── SensorPanel ───────────────────────────────────────────────────────────────

export interface SensorPanelProps {
  node: SensorNode;
  readings: ReadingsMap;
  connected: boolean;
  onClose: () => void;
}

export function SensorPanel({ node, readings, connected, onClose }: SensorPanelProps) {
  const nodeReadings = readings[String(node.id)] ?? {};
  const bands = node.depth_bands.length > 0 ? node.depth_bands : Object.keys(nodeReadings);

  return (
    <div className={styles.panel} role="complementary" aria-label={`Sensor readings for ${node.label}`}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span
            className={styles.connDot}
            style={{ background: connected ? "#138a63" : "#b8881a" }}
            title={connected ? "Connected" : "Disconnected"}
            aria-label={connected ? "Sensor service connected" : "Sensor service offline"}
          />
          <span className={styles.nodeLabel}>{node.label}</span>
        </div>
        <button
          className={styles.closeBtn}
          onClick={onClose}
          type="button"
          aria-label="Close sensor panel"
          title="Close"
        >
          ×
        </button>
      </div>

      <div className={styles.subLabel}>Soil moisture (VWC %)</div>

      {/* Per-band readings */}
      {bands.length === 0 ? (
        <div className={styles.emptyState}>No readings yet — waiting for data.</div>
      ) : (
        <div className={styles.bands}>
          {bands.map((band) => {
            const reading: BandReading | undefined = nodeReadings[band];
            const color = bandColor(band);

            return (
              <div key={band} className={styles.bandRow}>
                <div className={styles.bandMeta}>
                  <span className={styles.bandName}>{band}</span>
                  {reading !== undefined ? (
                    <span className={styles.bandValue} style={{ color }}>
                      {reading.value.toFixed(1)}
                      <span className={styles.bandUnit}> %</span>
                    </span>
                  ) : (
                    <span className={styles.bandPending}>—</span>
                  )}
                </div>
                <Sparkline
                  history={reading?.history ?? []}
                  color={color}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Offline warning */}
      {!connected && (
        <div className={styles.offlineBanner}>
          Sensor service offline
        </div>
      )}
    </div>
  );
}
