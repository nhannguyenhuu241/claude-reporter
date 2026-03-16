"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div style={{
      minHeight: "70vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", textAlign: "center",
      padding: "2rem",
    }}>
      <div style={{
        fontSize: "6rem", fontWeight: 900, lineHeight: 1,
        background: "linear-gradient(135deg, #ef4444, #f97316)",
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        marginBottom: "0.5rem",
      }}>
        500
      </div>
      <div style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "0.5rem" }}>
        Lỗi máy chủ
      </div>
      <div style={{ color: "var(--text-muted)", fontSize: "0.88rem", maxWidth: 400, marginBottom: "0.75rem" }}>
        Đã xảy ra lỗi không mong muốn. Vui lòng thử lại hoặc liên hệ quản trị viên nếu vấn đề tiếp tục.
      </div>
      {error.digest && (
        <div style={{
          fontFamily: "monospace", fontSize: "0.72rem",
          color: "var(--text-muted)", background: "var(--surface)",
          border: "1px solid var(--border)", borderRadius: 6,
          padding: "0.3rem 0.75rem", marginBottom: "1.75rem",
        }}>
          Error ID: {error.digest}
        </div>
      )}
      <div style={{ display: "flex", gap: "0.75rem" }}>
        <button
          onClick={reset}
          style={{
            background: "var(--accent)", color: "#fff", border: "none",
            borderRadius: 8, padding: "0.5rem 1.5rem",
            fontWeight: 600, fontSize: "0.88rem", cursor: "pointer",
          }}
        >
          Thử lại
        </button>
        <a href="/" style={{
          background: "none", color: "var(--text-muted)",
          border: "1px solid var(--border)", borderRadius: 8,
          padding: "0.5rem 1.5rem", fontWeight: 600, fontSize: "0.88rem",
          textDecoration: "none",
        }}>
          Về trang chủ
        </a>
      </div>
    </div>
  );
}
