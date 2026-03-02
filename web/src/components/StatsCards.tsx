"use client";

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

export function StatsCards({ stats }: { stats: Stats }) {
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
    {
      label: "Est. Cost",
      value: `$${stats.estimatedCostUsd.toFixed(2)}`,
      sub: "Sonnet 4.6 pricing",
      color: "#f97316",
    },
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: "1rem",
        marginBottom: "1.5rem",
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
  );
}
