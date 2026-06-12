/**
 * ZoneForm.tsx — modal dialog: name + kind for a newly drawn zone polygon.
 *
 * Called by: MapView.tsx (opened after terra-draw finishes a polygon)
 * Data: receives GeoJSON Polygon geometry, calls POST /api/parcels/:id/zones
 * No existing duplicate component found.
 * Instruction: build the v0.1 map + zone-drawing UI
 */
import React, { useState } from "react";
import styles from "./ZoneForm.module.css";

export type ZoneKind = "bed" | "lawn" | "native_border" | "rough" | "green" | "other";

const KIND_LABELS: Record<ZoneKind, string> = {
  bed:           "Bed",
  lawn:          "Lawn",
  native_border: "Native Border",
  rough:         "Rough",
  green:         "Green",
  other:         "Other",
};

export interface ZoneFormProps {
  parcelId: string;
  /** GeoJSON Polygon geometry from terra-draw */
  geometry: GeoJSON.Polygon;
  onSaved: (zone: SavedZone) => void;
  onCancel: () => void;
  onError: (msg: string) => void;
}

export interface SavedZone {
  id: string;
  parcelId: string;
  name: string;
  kind: ZoneKind;
  geom: string;
}

export function ZoneForm({ parcelId, geometry, onSaved, onCancel, onError }: ZoneFormProps) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ZoneKind>("lawn");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);

    try {
      const res = await fetch(`/api/parcels/${parcelId}/zones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          kind,
          geom: JSON.stringify(geometry),
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "Unknown server error");
        throw new Error(`HTTP ${res.status}: ${text}`);
      }

      const json = (await res.json()) as { data: SavedZone };
      onSaved(json.data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save zone";
      onError(`Zone save failed — ${msg}`);
      onCancel();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="zf-title">
      <div className={styles.card}>
        <div className={styles.header}>
          <span className={styles.headerNum}>New Zone</span>
          <span className={styles.headerTitle} id="zf-title">Name this zone</span>
        </div>

        <form onSubmit={(e) => { void handleSubmit(e); }}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="zf-name">Zone name</label>
            <input
              id="zf-name"
              className={styles.input}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Fairway 7 North"
              required
              autoFocus
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="zf-kind">Kind</label>
            <select
              id="zf-kind"
              className={styles.select}
              value={kind}
              onChange={(e) => setKind(e.target.value as ZoneKind)}
            >
              {(Object.keys(KIND_LABELS) as ZoneKind[]).map((k) => (
                <option key={k} value={k}>{KIND_LABELS[k]}</option>
              ))}
            </select>
          </div>

          <div className={styles.actions}>
            {saving && <span className={styles.saving}>Saving…</span>}
            <button type="button" className={styles.btnCancel} onClick={onCancel} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className={styles.btnSave} disabled={saving || !name.trim()}>
              Save zone
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
