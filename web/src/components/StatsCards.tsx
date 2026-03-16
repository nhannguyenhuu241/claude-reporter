"use client";

import { useEffect, useState } from "react";
import { useAutoRefresh } from "@/lib/useAutoRefresh";

interface Stats {
  totalSessions: number;
  activeSessions: number;
  totalTokens: number;
  estimatedCostUsd: number;
  recentActivity24h: number;
  tokenBreakdown: {
    input: number;
    output: number;
    cacheCreation: number;
    cacheRead: number;
  };
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

const EMPTY: Stats = {
  totalSessions: 0,
  activeSessions: 0,
  totalTokens: 0,
  estimatedCostUsd: 0,
  recentActivity24h: 0,
  tokenBreakdown: { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 },
};

export function StatsCards() {
  const [stats, setStats] = useState<Stats>(EMPTY);
  const [isPersonal, setIsPersonal] = useState(false);
  const tick = useAutoRefresh(15_000);

  useEffect(() => {
    const uuid = localStorage.getItem("claude-reporter-uuid");
    const url = uuid ? `/api/stats?userId=${uuid}` : "/api/stats";
    setIsPersonal(!!uuid);
    fetch(url)
      .then((r) => r.json())
      .then((d) => setStats(d))
      .catch(() => {});
  }, [tick]);

  const cards = [
    {
      label: "Total Sessions",
      value: stats.totalSessions,
      sub: `${stats.activeSessions} active`,
      color: "var(--accent)",
    },
    {
      label: "Events (24h)",
      value: fmt(stats.recentActivity24h),
      sub: "tool calls + messages",
      color: "var(--green)",
    },
    {
      label: "Total Tokens",
      value: fmt(stats.totalTokens),
      sub: `In ${fmt(stats.tokenBreakdown.input)} · Out ${fmt(stats.tokenBreakdown.output)}`,
      color: "var(--yellow)",
    },
  ];

  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
        <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
          {isPersonal ? "Thống kê của bạn" : "Thống kê toàn hệ thống"}
        </span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "1rem",
        }}
      >
        {cards.map((c) => (
          <div key={c.label} className="card">
            <div style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginBottom: 4 }}>
              {c.label}
            </div>
            <div style={{ color: c.color, fontSize: "1.8rem", fontWeight: 700, lineHeight: 1 }}>
              {c.value}
            </div>
            <div style={{ color: "var(--text-muted)", fontSize: "0.7rem", marginTop: 4 }}>
              {c.sub}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
