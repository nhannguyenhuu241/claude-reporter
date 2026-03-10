"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef } from "react";

interface UserStats {
  email: string;
  role: string;
  department: { id: string; name: string } | null;
  totalSessions: number;
  activeSessions: number;
  totalTokens: number;
  estimatedCostUsd: number;
  recentActivity24h: number;
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export function UserProfile() {
  const router = useRouter();
  const [uuid, setUuid] = useState<string | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [stale, setStale] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showUuid, setShowUuid] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("claude-reporter-uuid");
    if (!stored) { router.replace("/login"); return; }
    setUuid(stored);

    Promise.all([
      fetch(`/api/auth/verify/${stored}`).then((r) => r.json()),
      fetch(`/api/stats?userId=${stored}`).then((r) => r.json()),
    ])
      .then(([verify, s]) => {
        if (!verify.valid) {
          setStale(true);
          setLoading(false);
          return;
        }
        setStats({
          email: verify.email,
          role: verify.role ?? "member",
          department: verify.department ?? null,
          totalSessions: s.totalSessions,
          activeSessions: s.activeSessions,
          totalTokens: s.totalTokens,
          estimatedCostUsd: s.estimatedCostUsd,
          recentActivity24h: s.recentActivity24h,
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function clearAndReregister() {
    localStorage.removeItem("claude-reporter-uuid");
    window.location.href = "/login";
  }

  if (loading) return null;

  // ── Stale UUID ──────────────────────────────────────────────────────────────
  if (stale) {
    return (
      <div
        style={{
          marginBottom: "1.5rem",
          background: "rgba(249,115,22,0.08)",
          border: "1px solid #f97316",
          borderRadius: 8,
          padding: "1rem 1.25rem",
          display: "flex",
          alignItems: "center",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: "1.5rem" }}>⚠️</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#f97316", marginBottom: 4 }}>
            Hệ thống đã được reset — vui lòng đăng ký lại
          </div>
          <div style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
            UUID cũ của bạn không còn hợp lệ. Nhập lại email để lấy UUID mới, sau đó cập nhật trên máy:
          </div>
          <div style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: 4 }}>
            <pre style={{
              background: "#111", borderRadius: 4, padding: "0.35rem 0.6rem",
              fontSize: "0.7rem", color: "#86efac", margin: 0, overflowX: "auto",
            }}>{`echo 'NEW_UUID' > ~/.claude-reporter-uuid`}</pre>
            <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontFamily: "monospace" }}>
              UUID cũ: {uuid?.slice(0, 12)}…
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
          <button
            onClick={clearAndReregister}
            style={{
              background: "#f97316", color: "#fff", border: "none", borderRadius: 6,
              padding: "0.4rem 1rem", fontSize: "0.8rem", fontWeight: 700, cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Đăng ký lại ngay →
          </button>
        </div>
      </div>
    );
  }

  if (!uuid || !stats) return null;

  function copyUuid() {
    navigator.clipboard.writeText(uuid!).then(() => {
      setCopied(true);
      if (copyRef.current) clearTimeout(copyRef.current);
      copyRef.current = setTimeout(() => setCopied(false), 2000);
    });
  }

  // ── Logged in ───────────────────────────────────────────────────────────────
  return (
    <div style={{ marginBottom: "1.5rem" }}>
      {/* Dept head banner */}
      {stats.role === "dept_head" && (
        <div style={{
          background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.3)",
          borderRadius: 8, padding: "0.6rem 1rem", marginBottom: "0.75rem",
          display: "flex", alignItems: "center", gap: "0.75rem",
        }}>
          <span style={{ fontSize: "1rem" }}>👑</span>
          <div style={{ flex: 1, fontSize: "0.82rem" }}>
            <strong style={{ color: "#eab308" }}>Trưởng phòng {stats.department?.name}</strong>
            <span style={{ color: "var(--text-muted)", marginLeft: 8 }}>
              — Bạn có thể xem dashboard cá nhân bên dưới và xem báo cáo phòng ban.
            </span>
          </div>
          <Link href="/dept" style={{
            background: "#eab308", color: "#000", borderRadius: 6,
            padding: "0.35rem 0.9rem", fontSize: "0.78rem", fontWeight: 700,
            textDecoration: "none", whiteSpace: "nowrap",
          }}>
            Báo cáo phòng →
          </Link>
        </div>
      )}

      <div
        className="card"
        style={{
          display: "flex", alignItems: "center", gap: "1.5rem",
          flexWrap: "wrap", padding: "1rem 1.25rem",
        }}
      >
        {/* Avatar + info */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <div style={{
            width: 40, height: 40, borderRadius: "50%",
            background: stats.role === "dept_head" ? "#854d0e" : "var(--accent)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 700, fontSize: "1rem", color: "#fff", flexShrink: 0,
          }}>
            {stats.email[0].toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{stats.email}</div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: 2 }}>
              {/* UUID pill — click để hiện/ẩn full UUID */}
              <button
                onClick={() => setShowUuid(!showUuid)}
                title="Bấm để xem UUID đầy đủ"
                style={{
                  background: "none", border: "none", cursor: "pointer", padding: 0,
                  color: "var(--text-muted)", fontSize: "0.7rem", fontFamily: "monospace",
                }}
              >
                {showUuid ? uuid : `${uuid.slice(0, 8)}…`}
              </button>
              {showUuid && (
                <button
                  onClick={copyUuid}
                  style={{
                    background: copied ? "rgba(34,197,94,0.1)" : "var(--surface)",
                    border: `1px solid ${copied ? "var(--green)" : "var(--border)"}`,
                    borderRadius: 4, padding: "0px 6px", fontSize: "0.65rem",
                    color: copied ? "var(--green)" : "var(--text-muted)", cursor: "pointer",
                  }}
                >
                  {copied ? "✓ Copied" : "Copy"}
                </button>
              )}
              {stats.department && (
                <span style={{
                  background: "rgba(167,139,250,0.15)", border: "1px solid rgba(167,139,250,0.4)",
                  borderRadius: 4, padding: "1px 6px", fontSize: "0.65rem", color: "#a78bfa",
                }}>
                  {stats.department.name}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
          {[
            { label: "Sessions", value: stats.totalSessions, sub: `${stats.activeSessions} active` },
            { label: "Tokens", value: fmt(stats.totalTokens), sub: "total usage" },
            { label: "24h Events", value: fmt(stats.recentActivity24h), sub: "recent activity" },
            { label: "Est. Cost", value: `$${stats.estimatedCostUsd.toFixed(2)}`, sub: "Sonnet 4.6" },
          ].map((item) => (
            <div key={item.label}>
              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{item.label}</div>
              <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--accent)" }}>{item.value}</div>
              <div style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>{item.sub}</div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div style={{ marginLeft: "auto", display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <Link
            href={`/report?userId=${uuid}`}
            style={{
              background: "var(--accent)", color: "#fff", borderRadius: 6,
              padding: "0.4rem 0.9rem", fontSize: "0.78rem", fontWeight: 600,
              textDecoration: "none", whiteSpace: "nowrap",
            }}
          >
            Export Report
          </Link>
        </div>
      </div>
    </div>
  );
}
