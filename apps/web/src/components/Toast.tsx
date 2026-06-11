/**
 * Toast.tsx — non-blocking notice system
 *
 * Called by: App.tsx (renders <ToastList />)
 * Data: ToastItem[], useToast hook
 * Instruction: build the v0.1 map + zone-drawing UI
 * No existing duplicate component found.
 */
import React, { useState, useCallback, useId } from "react";
import styles from "./Toast.module.css";

export type ToastKind = "error" | "info";

export interface ToastItem {
  id: string;
  kind: ToastKind;
  message: string;
}

interface ToastListProps {
  items: ToastItem[];
  onDismiss: (id: string) => void;
}

export function ToastList({ items, onDismiss }: ToastListProps) {
  if (items.length === 0) return null;
  return (
    <div className={styles.list} role="log" aria-live="polite" aria-label="Notifications">
      {items.map((t) => (
        <div key={t.id} className={`${styles.toast} ${styles[t.kind]}`} role="alert">
          <span className={styles.message}>{t.message}</span>
          <button
            className={styles.dismiss}
            onClick={() => onDismiss(t.id)}
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

/** Hook for managing toast state in the parent component. */
export function useToasts() {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setItems((prev) => [...prev, { id, kind, message }]);
    // Auto-dismiss after 6 s
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 6000);
  }, []);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { items, push, dismiss };
}
