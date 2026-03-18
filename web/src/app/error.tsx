"use client";

import { useEffect, useState } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [show, setShow] = useState(false);
  const [showTrace, setShowTrace] = useState(false);

  useEffect(() => {
    console.error(error);
    setShow(true);
  }, [error]);

  const traceLines = [
    "  at processEvent (lib/processEvent.ts:42:18)",
    "  at async POST (api/events/batch/route.ts:79:5)",
    "  at async Server.handleRequest (server.ts:124:12)",
  ];

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      textAlign: "center",
      padding: "2rem",
      position: "relative",
      overflow: "hidden",
      background: "var(--bg)",
    }}>
      {/* Animated warning grid */}
      <div style={{
        position: "absolute",
        inset: 0,
        backgroundImage: `radial-gradient(circle, #ef444418 1px, transparent 1px)`,
        backgroundSize: "40px 40px",
        animation: "grid-move 6s linear infinite",
        pointerEvents: "none",
      }} />

      {/* Red radial glow */}
      <div style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: 700,
        height: 700,
        borderRadius: "50%",
        background: "radial-gradient(circle, #ef444415 0%, transparent 65%)",
        pointerEvents: "none",
      }} />

      {/* Pulse rings */}
      <div style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: 400,
        height: 400,
        borderRadius: "50%",
        border: "1px solid #ef444420",
        animation: "pulse-ring 2.5s ease-out infinite",
        pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: 400,
        height: 400,
        borderRadius: "50%",
        border: "1px solid #ef444415",
        animation: "pulse-ring 2.5s ease-out infinite 0.8s",
        pointerEvents: "none",
      }} />

      {/* Content */}
      <div style={{
        position: "relative",
        zIndex: 1,
        opacity: show ? 1 : 0,
        transform: show ? "translateY(0)" : "translateY(16px)",
        transition: "all 0.5s ease",
      }}>

        {/* Warning icon */}
        <div style={{
          fontSize: "2.5rem",
          marginBottom: "1rem",
          animation: "float-y 3s ease-in-out infinite",
          display: "block",
        }}>
          ⚠️
        </div>

        {/* Error code */}
        <div style={{ position: "relative", marginBottom: "0.25rem" }}>
          <div style={{
            fontSize: "7rem",
            fontWeight: 900,
            lineHeight: 1,
            background: "linear-gradient(135deg, #ef4444, #f97316, #fbbf24)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            letterSpacing: "-4px",
            animation: "flicker 5s ease-in-out infinite",
          }}>500</div>
          {/* Glitch layers */}
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0,
            fontSize: "7rem", fontWeight: 900, lineHeight: 1,
            color: "#06b6d4", letterSpacing: "-4px", opacity: 0.25,
            animation: "glitch-1 2.5s steps(1) infinite",
            pointerEvents: "none",
          }}>500</div>
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0,
            fontSize: "7rem", fontWeight: 900, lineHeight: 1,
            color: "#6366f1", letterSpacing: "-4px", opacity: 0.2,
            animation: "glitch-2 2.5s steps(1) infinite 0.3s",
            pointerEvents: "none",
          }}>500</div>
        </div>

        <div style={{ marginBottom: "0.4rem" }}>
          <span style={{ fontSize: "0.72rem", color: "#71717a" }}>
            <span style={{ color: "#ef444460" }}>// </span>
            <span style={{ color: "#f97316" }}>INTERNAL_SERVER_ERROR</span>
            {" · "}
            máy chủ gặp sự cố
          </span>
        </div>

        {/* Error details card */}
        <div style={{
          background: "#0d0d0f",
          border: "1px solid #3f1515",
          borderLeft: "3px solid #ef4444",
          borderRadius: 10,
          padding: "1.25rem 1.5rem",
          textAlign: "left",
          maxWidth: 520,
          margin: "1.5rem auto",
          boxShadow: "0 0 30px #ef444412",
        }}>
          <div style={{ fontSize: "0.78rem", color: "#f87171", fontWeight: 600, marginBottom: "0.5rem" }}>
            ✕ Unhandled Runtime Error
          </div>
          <div style={{ fontSize: "0.75rem", color: "#e4e4e7", marginBottom: "0.75rem", lineHeight: 1.5 }}>
            Đã xảy ra lỗi không mong muốn. Hệ thống đã ghi nhận sự cố này.
          </div>

          {error.digest && (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              background: "#1a0a0a",
              border: "1px solid #27272a",
              borderRadius: 6,
              padding: "0.4rem 0.75rem",
              marginBottom: "0.75rem",
            }}>
              <span style={{ fontSize: "0.68rem", color: "#71717a" }}>Error ID:</span>
              <code style={{ fontSize: "0.68rem", color: "#f97316", letterSpacing: "0.05em" }}>
                {error.digest}
              </code>
            </div>
          )}

          {/* Collapsible stack trace */}
          <button
            onClick={() => setShowTrace(v => !v)}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              fontSize: "0.7rem",
              color: "#71717a",
              display: "flex",
              alignItems: "center",
              gap: "0.35rem",
            }}
          >
            <span style={{
              display: "inline-block",
              transform: showTrace ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform 0.2s",
            }}>▶</span>
            {showTrace ? "Ẩn" : "Xem"} stack trace
          </button>

          {showTrace && (
            <div style={{
              marginTop: "0.5rem",
              background: "#0a0a0c",
              border: "1px solid #1f1f24",
              borderRadius: 6,
              padding: "0.75rem",
              animation: "fade-up 0.2s ease both",
            }}>
              {traceLines.map((line, i) => (
                <div key={i} style={{ fontSize: "0.66rem", color: "#71717a", lineHeight: 1.8 }}>
                  {line}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Title & description */}
        <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#e4e4e7", marginBottom: "0.4rem" }}>
          Lỗi máy chủ
        </div>
        <div style={{ color: "#71717a", fontSize: "0.85rem", maxWidth: 380, marginBottom: "1.75rem", lineHeight: 1.6 }}>
          Vui lòng thử lại. Nếu vấn đề tiếp tục, hãy liên hệ quản trị viên.
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
          <button
            onClick={reset}
            style={{
              background: "linear-gradient(135deg, #ef4444, #f97316)",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "0.6rem 1.75rem",
              fontWeight: 600,
              fontSize: "0.85rem",
              cursor: "pointer",
              boxShadow: "0 0 20px #ef444430",
              fontFamily: "inherit",
            }}
          >
            ↺ Thử lại
          </button>
          <a href="/" style={{
            background: "none",
            color: "#71717a",
            border: "1px solid #27272a",
            borderRadius: 8,
            padding: "0.6rem 1.75rem",
            fontWeight: 600,
            fontSize: "0.85rem",
            textDecoration: "none",
          }}>
            Về trang chủ
          </a>
        </div>
      </div>
    </div>
  );
}
