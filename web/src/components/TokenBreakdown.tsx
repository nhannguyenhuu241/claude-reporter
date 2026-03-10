"use client";

import { useEffect, useState } from "react";
import { useAutoRefresh } from "@/lib/useAutoRefresh";

interface Breakdown {
  input: number;
  output: number;
  cacheCreation: number;
  cacheRead: number;
  total: number;
  isPersonal: boolean;
}

const EMPTY: Breakdown = {
  input: 0, output: 0, cacheCreation: 0, cacheRead: 0, total: 0, isPersonal: false,
};

export function TokenBreakdown() {
  const [data, setData] = useState<Breakdown>(EMPTY);
  const tick = useAutoRefresh(15_000);

  useEffect(() => {
    const uuid = localStorage.getItem("claude-reporter-uuid");
    const url = uuid ? `/api/stats?userId=${uuid}` : "/api/stats";
    fetch(url)
      .then((r) => r.json())
      .then((s) => setData({
        input: s.tokenBreakdown?.input ?? 0,
        output: s.tokenBreakdown?.output ?? 0,
        cacheCreation: s.tokenBreakdown?.cacheCreation ?? 0,
        cacheRead: s.tokenBreakdown?.cacheRead ?? 0,
        total: s.totalTokens ?? 0,
        isPersonal: !!uuid,
      }))
      .catch(() => {});
  }, [tick]);

  const items = [
    { label: "Input", value: data.input, color: "#6366f1" },
    { label: "Output", value: data.output, color: "#22c55e" },
    { label: "Cache Write", value: data.cacheCreation, color: "#eab308" },
    { label: "Cache Read", value: data.cacheRead, color: "#f97316" },
  ];

  return (
    <div className="card" style={{ height: 360, overflowY: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
        <span style={{ fontWeight: 600 }}>Token Breakdown</span>
        <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
          {data.isPersonal ? "của bạn" : "toàn hệ thống"}
        </span>
      </div>
      {items.map((item) => {
        const pct = data.total > 0 ? Math.round((item.value / data.total) * 100) : 0;
        return (
          <div key={item.label} style={{ marginBottom: "0.75rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", marginBottom: 4 }}>
              <span>{item.label}</span>
              <span style={{ color: "var(--text-muted)" }}>
                {item.value.toLocaleString()} ({pct}%)
              </span>
            </div>
            <div style={{ height: 6, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: item.color, borderRadius: 3 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
