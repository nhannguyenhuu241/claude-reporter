"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function UserBadge() {
  const router = useRouter();
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

  function logout() {
    localStorage.removeItem("claude-reporter-uuid");
    router.push("/login");
  }

  if (email) {
    return (
      <span
        style={{
          color: "var(--text-muted)",
          fontSize: "0.75rem",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
        }}
      >
        <span style={{ color: "var(--green)", fontSize: "0.65rem" }}>●</span>
        {email}
        <button
          onClick={logout}
          style={{
            background: "none",
            border: "1px solid var(--border)",
            borderRadius: 4,
            padding: "1px 8px",
            fontSize: "0.7rem",
            color: "var(--text-muted)",
            cursor: "pointer",
            lineHeight: "1.6",
          }}
        >
          Đăng xuất
        </button>
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
