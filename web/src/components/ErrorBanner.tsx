"use client";

import { useState } from "react";

export type BannerVariant = "error" | "warning" | "info";

interface ErrorBannerProps {
  variant?: BannerVariant;
  title: string;
  message?: string;
  /** Show a retry button */
  onRetry?: () => void;
  retryLabel?: string;
  /** Dismissible by user */
  dismissible?: boolean;
  /** Called after dismiss animation ends */
  onDismiss?: () => void;
}

const VARIANT_MAP: Record<BannerVariant, {
  border: string;
  bg: string;
  icon: string;
  titleColor: string;
  badge: string;
}> = {
  error: {
    border: "#ef4444",
    bg: "#1a0808",
    icon: "✕",
    titleColor: "#f87171",
    badge: "LỖI",
  },
  warning: {
    border: "#eab308",
    bg: "#1a1505",
    icon: "⚠",
    titleColor: "#fbbf24",
    badge: "CẢNH BÁO",
  },
  info: {
    border: "#6366f1",
    bg: "#0e0e1a",
    icon: "ℹ",
    titleColor: "#818cf8",
    badge: "THÔNG TIN",
  },
};

export function ErrorBanner({
  variant = "error",
  title,
  message,
  onRetry,
  retryLabel = "Thử lại",
  dismissible = true,
  onDismiss,
}: ErrorBannerProps) {
  const [visible, setVisible] = useState(true);
  const [exiting, setExiting] = useState(false);
  const v = VARIANT_MAP[variant];

  const handleDismiss = () => {
    setExiting(true);
    setTimeout(() => {
      setVisible(false);
      onDismiss?.();
    }, 250);
  };

  if (!visible) return null;

  return (
    <div style={{
      display: "flex",
      alignItems: "flex-start",
      gap: "0.75rem",
      background: v.bg,
      border: `1px solid ${v.border}25`,
      borderLeft: `3px solid ${v.border}`,
      borderRadius: 8,
      padding: "0.85rem 1rem",
      marginBottom: "1rem",
      animation: exiting
        ? "toast-out 0.25s ease forwards"
        : "banner-in 0.25s ease both",
      overflow: "hidden",
    }}>
      {/* Icon badge */}
      <div style={{
        flexShrink: 0,
        width: 24,
        height: 24,
        borderRadius: 6,
        background: `${v.border}20`,
        border: `1px solid ${v.border}35`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "0.7rem",
        fontWeight: 700,
        color: v.titleColor,
        marginTop: 1,
      }}>
        {v.icon}
      </div>

      {/* Body */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: message ? "0.2rem" : 0 }}>
          <span style={{ fontSize: "0.8rem", fontWeight: 600, color: v.titleColor }}>{title}</span>
          <span style={{
            fontSize: "0.6rem",
            fontWeight: 700,
            color: v.border,
            background: `${v.border}15`,
            border: `1px solid ${v.border}30`,
            borderRadius: 4,
            padding: "1px 5px",
            letterSpacing: "0.05em",
          }}>{v.badge}</span>
        </div>
        {message && (
          <div style={{ fontSize: "0.75rem", color: "#71717a", lineHeight: 1.5 }}>
            {message}
          </div>
        )}
        {onRetry && (
          <button
            onClick={onRetry}
            style={{
              marginTop: "0.5rem",
              background: `${v.border}20`,
              border: `1px solid ${v.border}40`,
              borderRadius: 5,
              padding: "0.25rem 0.75rem",
              fontSize: "0.72rem",
              fontWeight: 600,
              color: v.titleColor,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            ↺ {retryLabel}
          </button>
        )}
      </div>

      {/* Dismiss */}
      {dismissible && (
        <button
          onClick={handleDismiss}
          title="Đóng"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "#71717a",
            fontSize: "1rem",
            lineHeight: 1,
            padding: 0,
            flexShrink: 0,
            fontFamily: "inherit",
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}
