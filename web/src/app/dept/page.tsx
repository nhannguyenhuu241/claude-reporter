"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SessionList } from "@/components/SessionList";

// ─── Types ────────────────────────────────────────────────────────────────────

interface WeekData { week: string; prompts: string[]; noiseCount: number; count: number }
interface MemberProject {
  path: string; name: string; sessions: number;
  totalPrompts: number; meaningfulPrompts: number; weeks: WeekData[];
}
interface Member {
  userId: string; email: string; sessions: number;
  totalPrompts: number; meaningfulPrompts: number;
  promptEfficiency: number; tokensPerPrompt: number;
  sessionDepth: number; cacheHitRate: number; activeDays: number;
  totalTokens: number; estimatedCostUsd: number;
  projects: MemberProject[];
}
interface TeamReportData {
  from: string; to: string; totalPrompts: number; totalSessions: number;
  totalTokens: number; totalMembers: number; estimatedCostUsd: number;
  members: Member[];
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}
function today() { return new Date().toISOString().slice(0, 10); }
function daysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function effColor(v: number) {
  if (v >= 80) return "var(--green)"; if (v >= 50) return "#f59e0b"; return "var(--red)";
}

// ─── Member row in summary table ─────────────────────────────────────────────

function MemberRow({ m, rank, maxTokens, maxPrompts, onExpand }: {
  m: Member; rank: number; maxTokens: number; maxPrompts: number;
  onExpand: () => void;
}) {
  const rankStyle: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    width: 24, height: 24, borderRadius: "50%", fontWeight: 700, fontSize: "0.78rem",
    ...(rank === 1 ? { background: "#ffd700", color: "#000" }
      : rank === 2 ? { background: "#c0c0c0", color: "#000" }
      : rank === 3 ? { background: "#cd7f32", color: "#fff" }
      : { background: "var(--surface)", color: "var(--text-muted)" }),
  };
  const tokenPct = maxTokens > 0 ? (m.totalTokens / maxTokens) * 100 : 0;
  const promptPct = maxPrompts > 0 ? (m.totalPrompts / maxPrompts) * 100 : 0;

  return (
    <tr style={{ borderBottom: "1px solid var(--border)" }}>
      <td style={{ padding: "8px" }}><span style={rankStyle}>{rank}</span></td>
      <td style={{ padding: "8px" }}>
        <div style={{ fontWeight: 500, fontSize: "0.85rem" }}>{m.email}</div>
        <div style={{ color: "var(--text-muted)", fontSize: "0.68rem" }}>{m.activeDays} ngày hoạt động</div>
      </td>
      <td style={{ padding: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 80, height: 5, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ width: `${promptPct}%`, height: "100%", background: "var(--accent)" }} />
          </div>
          <span style={{ fontSize: "0.78rem", color: "var(--accent)", fontWeight: 600 }}>{m.totalPrompts}</span>
        </div>
        <div style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>{m.meaningfulPrompts} meaningful</div>
      </td>
      <td style={{ padding: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 80, height: 5, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ width: `${tokenPct}%`, height: "100%", background: "#f59e0b" }} />
          </div>
          <span style={{ fontSize: "0.78rem", color: "#f59e0b", fontWeight: 600 }}>{fmt(m.totalTokens)}</span>
        </div>
      </td>
      <td style={{ padding: "8px", textAlign: "center" }}>
        <span style={{ color: effColor(m.promptEfficiency), fontWeight: 700, fontSize: "0.85rem" }}>
          {m.promptEfficiency}%
        </span>
      </td>
      <td style={{ padding: "8px", textAlign: "center", color: "var(--text-muted)", fontSize: "0.8rem" }}>
        {m.sessionDepth}
      </td>
      <td style={{ padding: "8px", textAlign: "center", color: "#22c55e", fontSize: "0.8rem" }}>
        {m.cacheHitRate}%
      </td>
      <td style={{ padding: "8px" }}>
        <button onClick={onExpand} style={{
          background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4,
          padding: "2px 8px", fontSize: "0.7rem", color: "var(--accent)", cursor: "pointer",
        }}>
          Chi tiết
        </button>
      </td>
    </tr>
  );
}

// ─── Member detail panel ──────────────────────────────────────────────────────

function MemberDetail({ m }: { m: Member }) {
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  return (
    <div className="card" style={{ marginBottom: "0.75rem", padding: "1rem 1.25rem", borderLeft: "3px solid var(--accent)" }}>
      <div style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.5rem" }}>{m.email}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: "0.75rem" }}>
        {[
          { l: "Prompts", v: m.totalPrompts, c: "var(--accent)" },
          { l: "Meaningful", v: m.meaningfulPrompts, c: "var(--green)" },
          { l: "Efficiency", v: `${m.promptEfficiency}%`, c: effColor(m.promptEfficiency) },
          { l: "Tokens/Prompt", v: fmt(m.tokensPerPrompt), c: "#06b6d4" },
          { l: "Session Depth", v: m.sessionDepth, c: "#a78bfa" },
          { l: "Active Days", v: m.activeDays, c: "var(--text-muted)" },
        ].map((chip) => (
          <div key={chip.l} style={{
            background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 5,
            padding: "2px 8px", fontSize: "0.68rem", color: "var(--text-muted)",
          }}>
            {chip.l}: <strong style={{ color: chip.c }}>{chip.v}</strong>
          </div>
        ))}
      </div>

      {m.projects.map((proj) => (
        <div key={proj.path} style={{ marginBottom: "0.5rem" }}>
          <div
            onClick={() => setExpandedProject(expandedProject === proj.path ? null : proj.path)}
            style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", padding: "4px 0" }}
          >
            <div style={{ width: 3, height: 16, background: "#a78bfa", borderRadius: 2 }} />
            <span style={{ fontSize: "0.8rem", fontWeight: 500 }}>{proj.name}</span>
            <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
              {proj.totalPrompts} prompts · {proj.sessions} sessions
            </span>
            <span style={{ marginLeft: "auto", fontSize: "0.68rem", color: "var(--text-muted)" }}>
              {expandedProject === proj.path ? "▲" : "▼"}
            </span>
          </div>

          {expandedProject === proj.path && (
            <div style={{ marginLeft: "0.75rem", marginTop: "0.25rem" }}>
              {proj.weeks.map((w) => (
                <div key={w.week} style={{ marginBottom: "0.6rem" }}>
                  <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#f59e0b", marginBottom: 3 }}>
                    📅 Tuần {w.week}
                    <span style={{ color: "var(--text-muted)", fontWeight: 400, marginLeft: 6 }}>
                      {w.count} prompts{w.noiseCount > 0 ? ` + ${w.noiseCount} system` : ""}
                    </span>
                  </div>
                  <ol style={{ margin: 0, paddingLeft: "1.25rem" }}>
                    {w.prompts.map((p, i) => (
                      <li key={i} style={{
                        fontSize: "0.73rem", color: "var(--text)", padding: "2px 0",
                        lineHeight: 1.5, borderBottom: "1px solid var(--border)",
                      }}>
                        {p}
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function DeptPageInner() {
  const router = useRouter();
  const [userInfo, setUserInfo] = useState<{ email: string; role: string; department: { id: string; name: string } | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());
  const [report, setReport] = useState<TeamReportData | null>(null);
  const [reportStatus, setReportStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [expandedMember, setExpandedMember] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);

  useEffect(() => {
    // Middleware already guards this page — just fetch user info from cookie
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (!d.valid) { router.replace("/login"); return; }
        setUserInfo({ email: d.email, role: d.role, department: d.department ?? null });
        setLoading(false);
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  async function generateReport() {
    setReportStatus("loading"); setReport(null); setReportError(null);
    try {
      const qs = new URLSearchParams({ from, to });
      const res = await fetch(`/api/report/team?${qs}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const data: TeamReportData = await res.json();
      setReport(data); setReportStatus("done");
    } catch (e) {
      setReportError(e instanceof Error ? e.message : "Lỗi không xác định");
      setReportStatus("error");
    }
  }

  if (loading) return null;
  if (!userInfo) return null;

  const maxTokens = Math.max(...(report?.members.map((m) => m.totalTokens) ?? [1]));
  const maxPrompts = Math.max(...(report?.members.map((m) => m.totalPrompts) ?? [1]));

  const inputStyle: React.CSSProperties = {
    background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6,
    padding: "0.4rem 0.6rem", color: "var(--text)", fontSize: "0.85rem", outline: "none",
  };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0 }}>
            👑 {userInfo.department?.name ?? "Phòng ban"} — Báo cáo
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.78rem", margin: "2px 0 0" }}>
            Trưởng phòng: {userInfo.email}
          </p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: "0.5rem" }}>
          <Link href="/" style={{ color: "var(--text-muted)", fontSize: "0.8rem", textDecoration: "none", padding: "4px 10px" }}>
            ← Home
          </Link>
        </div>
      </div>

      {/* Live sessions of department members */}
      <div style={{ marginBottom: "1rem" }}><SessionList /></div>

      {/* Controls */}
      <div className="card" style={{ marginBottom: "1rem", padding: "1rem" }}>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <div style={{ color: "var(--text-muted)", fontSize: "0.72rem", marginBottom: 4 }}>Từ ngày</div>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <div style={{ color: "var(--text-muted)", fontSize: "0.72rem", marginBottom: 4 }}>Đến ngày</div>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ display: "flex", gap: "0.3rem" }}>
            {[{ label: "7d", days: 7 }, { label: "30d", days: 30 }, { label: "90d", days: 90 }].map((r) => (
              <button key={r.label} onClick={() => { setFrom(daysAgo(r.days)); setTo(today()); }}
                style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 5, padding: "4px 10px", fontSize: "0.72rem", color: "var(--text-muted)", cursor: "pointer" }}>
                {r.label}
              </button>
            ))}
          </div>
          <button
            onClick={generateReport}
            disabled={reportStatus === "loading"}
            style={{
              background: reportStatus === "loading" ? "var(--surface)" : "var(--accent)",
              color: "#fff", border: "none", borderRadius: 6,
              padding: "0.45rem 1.25rem", fontWeight: 600, fontSize: "0.85rem",
              cursor: reportStatus === "loading" ? "default" : "pointer",
              opacity: reportStatus === "loading" ? 0.7 : 1,
            }}
          >
            {reportStatus === "loading" ? "Đang tạo…" : "Tạo báo cáo phòng"}
          </button>
        </div>
      </div>

      {reportStatus === "loading" && (
        <div className="card" style={{ textAlign: "center", padding: "2rem" }}>
          <div style={{ color: "var(--accent)" }}>⏳ Đang tổng hợp dữ liệu phòng ban…</div>
        </div>
      )}

      {reportStatus === "error" && (
        <div className="card" style={{ color: "var(--red)", textAlign: "center", padding: "1.25rem" }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Không thể tải báo cáo</div>
          {reportError && <div style={{ fontSize: "0.8rem", opacity: 0.8 }}>{reportError}</div>}
          {reportError?.includes("no department") && (
            <div style={{ fontSize: "0.78rem", marginTop: 8, color: "var(--text-muted)" }}>
              Liên hệ admin để được gán vào phòng ban tại trang <strong>/admin</strong>.
            </div>
          )}
        </div>
      )}

      {reportStatus === "done" && report && (
        <>
          {/* Summary cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: "0.75rem", marginBottom: "1rem" }}>
            {[
              { label: "Tổng Prompts", value: report.totalPrompts.toLocaleString(), color: "var(--accent)" },
              { label: "Sessions", value: report.totalSessions, color: "var(--green)" },
              { label: "Tokens", value: fmt(report.totalTokens), color: "#f59e0b" },
              { label: "Thành viên", value: report.totalMembers, color: "#a78bfa" },
            ].map((c) => (
              <div key={c.label} className="card" style={{ padding: "0.75rem 1rem" }}>
                <div style={{ color: "var(--text-muted)", fontSize: "0.68rem" }}>{c.label}</div>
                <div style={{ color: c.color, fontSize: "1.4rem", fontWeight: 700, lineHeight: 1.2 }}>{c.value}</div>
              </div>
            ))}
          </div>

          {/* Efficiency summary */}
          {report.members.length > 0 && (
            <div className="card" style={{ marginBottom: "1rem", padding: "1rem" }}>
              <div style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: "0.75rem" }}>
                📊 Tổng hợp hiệu suất phòng
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: "1rem" }}>
                {(() => {
                  const avg = (fn: (m: Member) => number) =>
                    report.members.length > 0
                      ? Math.round((report.members.reduce((s, m) => s + fn(m), 0) / report.members.length) * 10) / 10
                      : 0;
                  const best = (fn: (m: Member) => number) =>
                    report.members.reduce((best, m) => fn(m) > fn(best) ? m : best, report.members[0]);
                  return [
                    {
                      label: "Avg Prompt Efficiency", value: `${avg(m => m.promptEfficiency)}%`,
                      color: effColor(avg(m => m.promptEfficiency)),
                      sub: `Cao nhất: ${best(m => m.promptEfficiency).email.split("@")[0]} (${best(m => m.promptEfficiency).promptEfficiency}%)`,
                    },
                    {
                      label: "Avg Tokens/Prompt", value: fmt(avg(m => m.tokensPerPrompt)),
                      color: "#06b6d4",
                      sub: `Cao nhất: ${best(m => m.tokensPerPrompt).email.split("@")[0]}`,
                    },
                    {
                      label: "Avg Session Depth", value: avg(m => m.sessionDepth),
                      color: "#a78bfa",
                      sub: `Cao nhất: ${best(m => m.sessionDepth).email.split("@")[0]} (${best(m => m.sessionDepth).sessionDepth})`,
                    },
                    {
                      label: "Avg Cache Hit Rate", value: `${avg(m => m.cacheHitRate)}%`,
                      color: "#22c55e",
                      sub: "Tỷ lệ token đọc từ cache",
                    },
                  ];
                })().map((stat) => (
                  <div key={stat.label}>
                    <div style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>{stat.label}</div>
                    <div style={{ color: stat.color, fontWeight: 700, fontSize: "1.3rem" }}>{stat.value}</div>
                    <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginTop: 2 }}>{stat.sub}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Member ranking table */}
          <div className="card" style={{ marginBottom: "1rem" }}>
            <div style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: "0.75rem" }}>Bảng xếp hạng thành viên</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                <thead>
                  <tr style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>
                    <th style={{ padding: "6px 8px", textAlign: "center" }}>#</th>
                    <th style={{ padding: "6px 8px", textAlign: "left" }}>Thành viên</th>
                    <th style={{ padding: "6px 8px", textAlign: "left" }}>Prompts</th>
                    <th style={{ padding: "6px 8px", textAlign: "left" }}>Tokens</th>
                    <th style={{ padding: "6px 8px", textAlign: "center" }}>Efficiency</th>
                    <th style={{ padding: "6px 8px", textAlign: "center" }}>Depth</th>
                    <th style={{ padding: "6px 8px", textAlign: "center" }}>Cache</th>
                    <th style={{ padding: "6px 8px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {report.members.map((m, i) => (
                    <MemberRow
                      key={m.userId} m={m} rank={i + 1}
                      maxTokens={maxTokens} maxPrompts={maxPrompts}
                      onExpand={() => setExpandedMember(expandedMember === m.userId ? null : m.userId)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Expanded member detail */}
          {expandedMember && (() => {
            const m = report.members.find((m) => m.userId === expandedMember);
            return m ? <MemberDetail m={m} /> : null;
          })()}

          {report.members.length === 0 && (
            <div className="card" style={{ textAlign: "center", color: "var(--text-muted)", padding: "2rem" }}>
              Phòng ban chưa có dữ liệu trong khoảng thời gian này.
            </div>
          )}
        </>
      )}

      {reportStatus === "idle" && (
        <div className="card" style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
          <div style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>👑</div>
          <div style={{ fontWeight: 600, marginBottom: "0.5rem" }}>
            Chào trưởng phòng {userInfo.department?.name}!
          </div>
          <div style={{ fontSize: "0.82rem" }}>
            Chọn khoảng thời gian và bấm "Tạo báo cáo phòng" để xem thống kê thành viên.
          </div>
        </div>
      )}
    </div>
  );
}

export default function DeptPage() {
  return (
    <Suspense>
      <DeptPageInner />
    </Suspense>
  );
}
