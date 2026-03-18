"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ToastType = "success" | "error" | "warning" | "info";

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number; // ms, 0 = sticky
}

interface ToastContextValue {
  toast: (opts: Omit<Toast, "id">) => string;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

// ── Theme map ─────────────────────────────────────────────────────────────────

const THEMES: Record<ToastType, {
  border: string;
  bg: string;
  icon: string;
  titleColor: string;
  progressColor: string;
}> = {
  success: {
    border: "#22c55e",
    bg: "#0a1a0e",
    icon: "✓",
    titleColor: "#4ade80",
    progressColor: "#22c55e",
  },
  error: {
    border: "#ef4444",
    bg: "#1a0808",
    icon: "✕",
    titleColor: "#f87171",
    progressColor: "#ef4444",
  },
  warning: {
    border: "#eab308",
    bg: "#1a1505",
    icon: "⚠",
    titleColor: "#fbbf24",
    progressColor: "#eab308",
  },
  info: {
    border: "#6366f1",
    bg: "#0e0e1a",
    icon: "ℹ",
    titleColor: "#818cf8",
    progressColor: "#6366f1",
  },
};

// ── Context ───────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

// ── Single Toast item ─────────────────────────────────────────────────────────

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  const theme = THEMES[toast.type];
  const duration = toast.duration ?? 4500;
  const [exiting, setExiting] = useState(false);
  const [hovered, setHovered] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (exiting) return;
    setExiting(true);
    setTimeout(() => onDismiss(toast.id), 340);
  }, [exiting, onDismiss, toast.id]);

  useEffect(() => {
    if (duration <= 0) return;
    const start = () => {
      timerRef.current = setTimeout(dismiss, duration);
    };
    const pause = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    if (!hovered) start();
    else pause();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [hovered, duration, dismiss]);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        background: theme.bg,
        border: `1px solid ${theme.border}30`,
        borderLeft: `3px solid ${theme.border}`,
        borderRadius: 10,
        padding: "0.9rem 1rem 0.9rem 1rem",
        minWidth: 300,
        maxWidth: 380,
        overflow: "hidden",
        boxShadow: `0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px ${theme.border}15`,
        animation: exiting
          ? "toast-out 0.34s ease forwards"
          : "toast-in 0.3s cubic-bezier(0.34,1.56,0.64,1) both",
        cursor: "default",
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "0.6rem" }}>
        {/* Icon */}
        <div style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: `${theme.border}20`,
          border: `1px solid ${theme.border}40`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "0.65rem",
          fontWeight: 700,
          color: theme.titleColor,
          flexShrink: 0,
          marginTop: 1,
        }}>
          {theme.icon}
        </div>

        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: "0.82rem",
            fontWeight: 600,
            color: theme.titleColor,
            lineHeight: 1.3,
            marginBottom: toast.message ? "0.25rem" : 0,
          }}>
            {toast.title}
          </div>
          {toast.message && (
            <div style={{
              fontSize: "0.75rem",
              color: "#71717a",
              lineHeight: 1.5,
            }}>
              {toast.message}
            </div>
          )}
        </div>

        {/* Close button */}
        <button
          onClick={dismiss}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "#71717a",
            fontSize: "0.9rem",
            lineHeight: 1,
            padding: "0 0 0 0.25rem",
            flexShrink: 0,
            fontFamily: "inherit",
          }}
        >
          ×
        </button>
      </div>

      {/* Progress bar */}
      {duration > 0 && (
        <div style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 2,
          background: `${theme.border}20`,
        }}>
          <div style={{
            height: "100%",
            background: theme.progressColor,
            animation: hovered ? "none" : `toast-progress ${duration}ms linear forwards`,
            opacity: 0.6,
          }} />
        </div>
      )}
    </div>
  );
}

// ── Provider & Container ──────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((opts: Omit<Toast, "id">): string => {
    const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts(prev => [...prev, { ...opts, id }]);
    return id;
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const dismissAll = useCallback(() => setToasts([]), []);

  return (
    <ToastContext.Provider value={{ toast, dismiss, dismissAll }}>
      {children}

      {/* Toast container */}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          aria-atomic="false"
          style={{
            position: "fixed",
            bottom: "1.5rem",
            right: "1.5rem",
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem",
            pointerEvents: "none",
          }}
        >
          {toasts.map(t => (
            <div key={t.id} style={{ pointerEvents: "all" }}>
              <ToastItem toast={t} onDismiss={dismiss} />
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}
