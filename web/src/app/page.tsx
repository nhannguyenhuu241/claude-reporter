import { StatsCards } from "@/components/StatsCards";
import { LiveFeed } from "@/components/LiveFeed";
import { SessionList } from "@/components/SessionList";

async function getStats() {
  try {
    const base = process.env.NEXT_PUBLIC_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3456}`;
    const res = await fetch(`${base}/api/stats`, { cache: "no-store" });
    return res.json();
  } catch {
    return {
      totalSessions: 0,
      activeSessions: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
      recentActivity24h: 0,
      tokenBreakdown: { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 },
    };
  }
}

export default async function Dashboard() {
  const stats = await getStats();

  return (
    <div>
      <StatsCards stats={stats} />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "1rem",
          marginBottom: "1rem",
        }}
      >
        <LiveFeed />
        <div className="card" style={{ height: 360, overflowY: "auto" }}>
          <div style={{ fontWeight: 600, marginBottom: "0.75rem" }}>Token Breakdown</div>
          {[
            { label: "Input", value: stats.tokenBreakdown.input, color: "#6366f1" },
            { label: "Output", value: stats.tokenBreakdown.output, color: "#22c55e" },
            { label: "Cache Write", value: stats.tokenBreakdown.cacheCreation, color: "#eab308" },
            { label: "Cache Read", value: stats.tokenBreakdown.cacheRead, color: "#f97316" },
          ].map((item) => {
            const total = stats.totalTokens || 1;
            const pct = Math.round((item.value / total) * 100);
            return (
              <div key={item.label} style={{ marginBottom: "0.75rem" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "0.78rem",
                    marginBottom: 4,
                  }}
                >
                  <span>{item.label}</span>
                  <span style={{ color: "var(--text-muted)" }}>
                    {item.value.toLocaleString()} ({pct}%)
                  </span>
                </div>
                <div
                  style={{
                    height: 6,
                    background: "var(--border)",
                    borderRadius: 3,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${pct}%`,
                      height: "100%",
                      background: item.color,
                      borderRadius: 3,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <SessionList />
    </div>
  );
}
