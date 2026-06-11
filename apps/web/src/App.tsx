import React, { useEffect, useState } from "react";
import { MapView } from "./components/MapView.js";

interface HealthResponse {
  status: "ok" | "degraded";
  db: string;
  ts: string;
}

export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then(async (res) => {
        const json = (await res.json()) as HealthResponse;
        setHealth(json);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Unknown error");
      });
  }, []);

  return (
    <div style={{ fontFamily: "sans-serif", padding: "1rem" }}>
      <h1>Superintendent</h1>

      <section>
        <h2>API Health</h2>
        {error && <p style={{ color: "red" }}>Error: {error}</p>}
        {!health && !error && <p>Checking...</p>}
        {health && (
          <dl>
            <dt>Status</dt>
            <dd>{health.status}</dd>
            <dt>Database</dt>
            <dd>{health.db}</dd>
            <dt>Server time</dt>
            <dd>{health.ts}</dd>
          </dl>
        )}
      </section>

      <section>
        <h2>Map (placeholder)</h2>
        <MapView />
      </section>
    </div>
  );
}
