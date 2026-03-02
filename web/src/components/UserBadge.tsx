"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export function UserBadge() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const uuid = localStorage.getItem("claude-reporter-uuid");
    if (!uuid) return;

    fetch(`/api/auth/verify/${uuid}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.valid) setEmail(d.email);
      })
      .catch(() => {});
  }, []);

  if (email) {
    return (
      <span
        style={{
          color: "var(--text-muted)",
          fontSize: "0.75rem",
          display: "flex",
          alignItems: "center",
          gap: "0.4rem",
        }}
      >
        <span style={{ color: "var(--green)", fontSize: "0.65rem" }}>●</span>
        {email}
      </span>
    );
  }

  return (
    <Link
      href="/login"
      style={{
        color: "var(--accent)",
        fontSize: "0.8rem",
        textDecoration: "none",
        border: "1px solid var(--accent-muted)",
        borderRadius: 4,
        padding: "2px 10px",
      }}
    >
      Đăng ký UUID
    </Link>
  );
}
