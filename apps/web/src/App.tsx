import React from "react";
import "./tokens.css";
import { MapView } from "./components/MapView.js";
import { ToastList, useToasts } from "./components/Toast.js";
import appStyles from "./App.module.css";

export default function App() {
  const { items, push, dismiss } = useToasts();

  return (
    <div className={appStyles.shell}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className={appStyles.header}>
        <div className={appStyles.glyph} aria-hidden="true" />
        <div className={appStyles.headerText}>
          <div className={appStyles.headerKick}>Conservation · Drone Monitoring</div>
          <h1 className={appStyles.headerTitle}>Superintendent</h1>
        </div>
      </header>

      {/* ── Map ─────────────────────────────────────────────────────────── */}
      <main className={appStyles.main}>
        <MapView onError={(msg) => push("error", msg)} />
      </main>

      {/* ── Non-blocking toasts ─────────────────────────────────────────── */}
      <ToastList items={items} onDismiss={dismiss} />
    </div>
  );
}
