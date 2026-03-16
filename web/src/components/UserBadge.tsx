"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export function UserBadge() {
  const [email, setEmail] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("claude-reporter-email");
  });
  const [role, setRole] = useState<string>(() => {
    if (typeof window === "undefined") return "member";
    return localStorage.getItem("claude-reporter-role") ?? "member";
  });

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.valid) {
          setEmail(d.email);
          setRole(d.role ?? "member");
          localStorage.setItem("claude-reporter-email", d.email);
          localStorage.setItem("claude-reporter-role", d.role ?? "member");
          if (d.userId) localStorage.setItem("claude-reporter-uuid", d.userId);
        } else {
          setEmail(null);
          localStorage.removeItem("claude-reporter-email");
          localStorage.removeItem("claude-reporter-role");
        }
      })
      .catch(() => {});
  }, []);

  if (email) {
    return (
      <span style={{ color: "var(--text-muted)", fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <span style={{ color: "var(--green)", fontSize: "0.65rem" }}>●</span>
        {role === "dept_head" && (
          <Link href="/dept" style={{
            background: "rgba(234,179,8,0.15)", border: "1px solid #eab308",
            borderRadius: 4, padding: "1px 6px", fontSize: "0.65rem",
            color: "#eab308", textDecoration: "none",
          }}>
            👑 Trưởng phòng
          </Link>
        )}
        <Link href="/profile" style={{ color: "var(--text-muted)", textDecoration: "none" }}>
          {email}
        </Link>
      </span>
    );
  }

  return (
    <Link href="/login" style={{
      color: "var(--accent)", fontSize: "0.8rem", textDecoration: "none",
      border: "1px solid var(--accent-muted)", borderRadius: 4, padding: "2px 10px",
    }}>
      Đăng nhập
    </Link>
  );
}
