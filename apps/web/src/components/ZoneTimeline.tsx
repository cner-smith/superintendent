/**
 * ZoneTimeline.tsx — floating panel showing vegetation-index trend for a selected zone.
 * Called by: MapView.tsx (rendered when selectedZone state is non-null).
 * Data: GET /api/parcels/1/zones/:zoneId/timeseries → { data: { vari?, gli?, exg? } }
 * Renders an inline SVG line chart (no library) per index: mean line + min/max band + dots.
 * Instruction: build per-zone time-series, issue #6.
 */
import React, { useEffect, useState } from "react";
import styles from "./ZoneTimeline.module.css";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TimeseriesPoint {
  flightId: string;
  capturedAt: string;
  mean: number;
  min: number;
  max: number;
  stddev: number;
}

type IndexKey = "vari" | "gli" | "exg";

type TimeseriesData = Partial<Record<IndexKey, TimeseriesPoint[]>>;

export interface ZoneTimelineProps {
  parcelId: string;
  zone: { id: string; name: string };
  onClose: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** On-brand distinct colors per index (teal / cyan / gold from tokens.css). */
const INDEX_COLOR: Record<IndexKey, string> = {
  vari: "#138a63",
  gli:  "#1f8e9e",
  exg:  "#b8881a",
};

const INDEX_LABEL: Record<IndexKey, string> = {
  vari: "VARI",
  gli:  "GLI",
  exg:  "ExG",
};

/** Ordered display sequence. */
const INDEX_ORDER: IndexKey[] = ["vari", "gli", "exg"];

// SVG chart dimensions (viewBox units)
const W = 220;
const H = 80;
const PAD = { top: 10, right: 14, bottom: 18, left: 30 };

// ── Inline SVG chart ──────────────────────────────────────────────────────────

interface ChartProps {
  points: TimeseriesPoint[];
  color: string;
  label: string;
}

function IndexChart({ points, color, label }: ChartProps) {
  if (points.length === 0) return null;

  const allValues = points.flatMap((p) => [p.min, p.max, p.mean]);
  const rawMin = Math.min(...allValues);
  const rawMax = Math.max(...allValues);
  // Ensure a non-zero range so a single-value doesn't collapse
  const range = rawMax - rawMin === 0 ? 1 : rawMax - rawMin;

  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const xOf = (i: number) =>
    points.length === 1 ? PAD.left + chartW / 2 : PAD.left + (i / (points.length - 1)) * chartW;

  const yOf = (v: number) =>
    PAD.top + chartH - ((v - rawMin) / range) * chartH;

  // Min/max band path (area)
  const bandTop = points.map((p, i) => `${xOf(i)},${yOf(p.max)}`).join(" L ");
  const bandBottom = [...points]
    .reverse()
    .map((p, i) => `${xOf(points.length - 1 - i)},${yOf(p.min)}`)
    .join(" L ");
  const bandPath = `M ${bandTop} L ${bandBottom} Z`;

  // Mean line path
  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xOf(i)},${yOf(p.mean)}`)
    .join(" ");

  const latest = points[points.length - 1]!;
  const latestX = xOf(points.length - 1);
  const latestY = yOf(latest.mean);
  const latestLabel = latest.mean.toFixed(3);
  // Anchor label to the left if near right edge, otherwise to the right
  const labelAnchor = latestX > W - PAD.right - 28 ? "end" : "start";
  const labelDx = labelAnchor === "end" ? -4 : 4;

  // Y-axis tick values (min, mid, max rounded)
  const mid = rawMin + range / 2;
  const ticks = [rawMax, mid, rawMin];

  // X-axis: show first + last date labels if more than 1 point
  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
  };

  return (
    <div className={styles.chart}>
      <div className={styles.chartLabel}>{label}</div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        aria-label={`${label} vegetation index trend chart`}
        role="img"
        className={styles.svg}
      >
        {/* Y gridlines + tick labels */}
        {ticks.map((t, i) => {
          const cy = yOf(t);
          return (
            <g key={i}>
              <line
                x1={PAD.left}
                y1={cy}
                x2={W - PAD.right}
                y2={cy}
                stroke="rgba(24,41,31,0.10)"
                strokeWidth={0.5}
              />
              <text
                x={PAD.left - 3}
                y={cy + 3.5}
                textAnchor="end"
                fontSize={6.5}
                fontFamily="'Space Mono', monospace"
                fill="rgba(24,41,31,0.45)"
              >
                {t.toFixed(2)}
              </text>
            </g>
          );
        })}

        {/* X-axis date labels */}
        {points.length > 1 && (
          <>
            <text
              x={PAD.left}
              y={H - 3}
              textAnchor="start"
              fontSize={6}
              fontFamily="'Space Mono', monospace"
              fill="rgba(24,41,31,0.40)"
            >
              {formatDate(points[0]!.capturedAt)}
            </text>
            <text
              x={W - PAD.right}
              y={H - 3}
              textAnchor="end"
              fontSize={6}
              fontFamily="'Space Mono', monospace"
              fill="rgba(24,41,31,0.40)"
            >
              {formatDate(points[points.length - 1]!.capturedAt)}
            </text>
          </>
        )}

        {/* Min/max band */}
        <path d={bandPath} fill={color} fillOpacity={0.12} stroke="none" />

        {/* Mean line */}
        {points.length > 1 && (
          <path
            d={linePath}
            fill="none"
            stroke={color}
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {/* Dots on each data point */}
        {points.map((p, i) => (
          <circle
            key={p.flightId}
            cx={xOf(i)}
            cy={yOf(p.mean)}
            r={2.5}
            fill={color}
            stroke="#eaf6ee"
            strokeWidth={1}
          />
        ))}

        {/* Latest mean label */}
        <text
          x={latestX + labelDx}
          y={latestY - 5}
          textAnchor={labelAnchor}
          fontSize={7}
          fontFamily="'Space Mono', monospace"
          fontWeight="700"
          fill={color}
        >
          {latestLabel}
        </text>
      </svg>
    </div>
  );
}

// ── ZoneTimeline component ────────────────────────────────────────────────────

export function ZoneTimeline({ parcelId, zone, onClose }: ZoneTimelineProps) {
  const [data, setData] = useState<TimeseriesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setData(null);

    fetch(`/api/parcels/${parcelId}/zones/${zone.id}/timeseries`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { data: TimeseriesData };
        setData(json.data);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Unknown error");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [parcelId, zone.id]);

  const presentIndices = INDEX_ORDER.filter(
    (k) => data && data[k] && (data[k]?.length ?? 0) > 0,
  );
  const isEmpty = !loading && !error && presentIndices.length === 0;

  return (
    <div className={styles.panel} role="complementary" aria-label={`Trend for ${zone.name}`}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.zoneName}>{zone.name}</div>
        <button
          className={styles.closeBtn}
          onClick={onClose}
          type="button"
          aria-label="Close zone timeline"
          title="Close"
        >
          ×
        </button>
      </div>

      <div className={styles.subLabel}>Vegetation index trend</div>

      {/* Body */}
      {loading && (
        <div className={styles.state}>Loading…</div>
      )}

      {error && !loading && (
        <div className={styles.state}>Failed to load: {error}</div>
      )}

      {isEmpty && (
        <div className={styles.emptyState}>
          No flight data for this zone yet — process a flight to see its trend.
        </div>
      )}

      {!loading && !error && presentIndices.length > 0 && (
        <div className={styles.charts}>
          {presentIndices.map((k) => (
            <IndexChart
              key={k}
              points={data![k]!}
              color={INDEX_COLOR[k]}
              label={INDEX_LABEL[k]}
            />
          ))}
        </div>
      )}
    </div>
  );
}
