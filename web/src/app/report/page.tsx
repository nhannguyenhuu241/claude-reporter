"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { useAutoRefresh } from "@/lib/useAutoRefresh";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProjectReport {
  name: string; path: string; sessions: number; events: number;
  inputTokens: number; outputTokens: number;
  cacheCreationTokens: number; cacheReadTokens: number;
  totalTokens: number; estimatedCostUsd: number;
  users: string[]; lastActivity: string;
}
interface ReportData {
  from: string; to: string; totalSessions: number; totalTokens: number;
  totalEvents: number; estimatedCostUsd: number; projects: ProjectReport[];
}

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
  inputTokens: number; outputTokens: number;
  cacheCreationTokens: number; cacheReadTokens: number;
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
function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function effColor(v: number) {
  if (v >= 80) return "var(--green)";
  if (v >= 50) return "#f59e0b";
  return "var(--red)";
}
function effLabel(v: number) {
  if (v >= 80) return "Tốt";
  if (v >= 50) return "Trung bình";
  return "Thấp";
}

// ─── Project report HTML export ───────────────────────────────────────────────

function exportProjectHTML(data: ReportData, from: string, to: string) {
  const rows = data.projects.map((p) => `
    <tr>
      <td><strong>${escapeHtml(p.name)}</strong><br><small style="color:#888">${escapeHtml(p.path)}</small></td>
      <td style="text-align:right">${p.sessions}</td>
      <td style="text-align:right">${p.events}</td>
      <td style="text-align:right">${fmt(p.totalTokens)}</td>
      <td style="text-align:right">$${p.estimatedCostUsd.toFixed(4)}</td>
      <td>${p.users.map(escapeHtml).join(", ") || "—"}</td>
    </tr>`).join("");

  const html = `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8">
<title>Claude Reporter - ${from} → ${to}</title>
<style>
  body{font-family:-apple-system,sans-serif;max-width:960px;margin:40px auto;padding:0 20px;color:#e2e8f0;background:#0a0a0a}
  h1{color:#818cf8}h2{color:#94a3b8;font-size:1rem;font-weight:400;margin-top:0}
  .cards{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin:24px 0}
  .card{background:#1a1a2e;border:1px solid #2d2d3d;border-radius:8px;padding:16px}
  .card-val{font-size:2rem;font-weight:700;color:#818cf8}.card-label{font-size:.75rem;color:#64748b}
  table{width:100%;border-collapse:collapse;margin-top:24px}
  th{text-align:left;padding:8px 12px;color:#64748b;font-size:.8rem;border-bottom:1px solid #2d2d3d}
  td{padding:8px 12px;border-bottom:1px solid #1e1e2e;font-size:.85rem}
  tr:hover td{background:#1a1a2e}
</style></head><body>
<h1>◆ Claude Reporter</h1>
<h2>Report: ${from} → ${to}</h2>
<div class="cards">
  <div class="card"><div class="card-label">Sessions</div><div class="card-val">${data.totalSessions}</div></div>
  <div class="card"><div class="card-label">Tokens</div><div class="card-val">${fmt(data.totalTokens)}</div></div>
  <div class="card"><div class="card-label">Events</div><div class="card-val">${fmt(data.totalEvents)}</div></div>
  <div class="card"><div class="card-label">Est. Cost</div><div class="card-val">$${data.estimatedCostUsd.toFixed(2)}</div></div>
</div>
<table><thead><tr>
  <th>Project</th><th style="text-align:right">Sessions</th><th style="text-align:right">Events</th>
  <th style="text-align:right">Tokens</th><th style="text-align:right">Cost</th><th>Users</th>
</tr></thead><tbody>${rows}</tbody></table>
<p style="color:#64748b;font-size:.75rem;margin-top:32px">Generated · ${new Date().toLocaleString()}</p>
</body></html>`;

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `claude-project-report-${from}-${to}.html`; a.click();
  URL.revokeObjectURL(url);
}

// ─── Team report HTML export (like Claude Log.md) ─────────────────────────────

function exportTeamHTML(data: TeamReportData, from: string, to: string) {
  const memberSections = data.members.map((m, idx) => {
    const projectSections = m.projects.map((p) => {
      const weekSections = p.weeks.map((w) => `
        <div class="week">
          <div class="week-title">Tuần ${w.week} (${w.count} prompts${w.noiseCount > 0 ? ` + ${w.noiseCount} system` : ""})</div>
          <ol>${w.prompts.map((q) => `<li>${escapeHtml(q)}</li>`).join("")}</ol>
        </div>`).join("");

      return `
      <div class="project">
        <div class="project-name">${escapeHtml(p.name)}</div>
        <div class="project-meta">${p.sessions} sessions · ${p.totalPrompts} prompts (${p.meaningfulPrompts} meaningful)</div>
        ${weekSections}
      </div>`;
    }).join("");

    return `
    <div class="member" id="m${idx}">
      <div class="member-header">
        <span class="rank rank-${idx < 3 ? idx + 1 : "other"}">${idx + 1}</span>
        <span class="member-name">${escapeHtml(m.email)}</span>
        <div class="member-stats">
          <span>${m.totalPrompts} prompts</span>
          <span>${m.sessions} sessions</span>
          <span>${fmt(m.totalTokens)} tokens</span>
          <span>${m.activeDays} ngày hoạt động</span>
        </div>
      </div>
      <div class="metrics-row">
        <div class="metric-chip" title="% prompt thực / tổng prompt">
          Prompt Efficiency <strong style="color:${m.promptEfficiency >= 80 ? "#4ade80" : m.promptEfficiency >= 50 ? "#fb923c" : "#f87171"}">${m.promptEfficiency}%</strong>
        </div>
        <div class="metric-chip">Tokens/Prompt <strong>${fmt(m.tokensPerPrompt)}</strong></div>
        <div class="metric-chip">Session Depth <strong>${m.sessionDepth}</strong></div>
        <div class="metric-chip">Cache Hit <strong>${m.cacheHitRate}%</strong></div>
        <div class="metric-chip">Cost <strong>$${m.estimatedCostUsd.toFixed(4)}</strong></div>
      </div>
      <div class="projects">${projectSections}</div>
    </div>`;
  }).join("");

  const html = `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8">
<title>Team Report: ${from} → ${to}</title>
<style>
  :root{--bg:#0a0a0a;--bg2:#111827;--bg3:#1f2937;--text:#e2e8f0;--muted:#6b7280;--accent:#818cf8;--green:#4ade80;--orange:#fb923c;--border:#2d3748}
  body{font-family:-apple-system,sans-serif;background:var(--bg);color:var(--text);margin:0;padding:2rem}
  .container{max-width:1100px;margin:0 auto}
  h1{color:var(--accent);font-size:1.8rem;margin-bottom:.25rem}
  .subtitle{color:var(--muted);font-size:.9rem;margin-bottom:2rem}
  .overview{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1rem;margin-bottom:2rem}
  .ov-card{background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:1.25rem;text-align:center}
  .ov-val{font-size:2rem;font-weight:700;color:var(--accent)}.ov-label{color:var(--muted);font-size:.8rem;margin-top:.25rem}
  .member{background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:1.5rem;margin-bottom:1.5rem}
  .member-header{display:flex;align-items:center;gap:1rem;flex-wrap:wrap;margin-bottom:.75rem}
  .rank{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;font-weight:700;font-size:.85rem;flex-shrink:0}
  .rank-1{background:#ffd700;color:#000}.rank-2{background:#c0c0c0;color:#000}.rank-3{background:#cd7f32;color:#fff}.rank-other{background:var(--bg3);color:var(--muted)}
  .member-name{font-size:1.1rem;font-weight:600}
  .member-stats{display:flex;gap:1rem;flex-wrap:wrap;font-size:.8rem;color:var(--muted);margin-left:auto}
  .metrics-row{display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:1rem}
  .metric-chip{background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:.3rem .75rem;font-size:.78rem;color:var(--muted)}
  .metric-chip strong{color:var(--text)}
  .project{border-left:3px solid var(--accent);padding-left:1rem;margin-bottom:1.25rem}
  .project-name{font-weight:600;font-size:.95rem;margin-bottom:.25rem}
  .project-meta{color:var(--muted);font-size:.78rem;margin-bottom:.5rem}
  .week{margin-bottom:.75rem}
  .week-title{font-size:.8rem;font-weight:600;color:var(--orange);margin-bottom:.4rem}
  ol{margin:0;padding-left:1.5rem}
  li{font-size:.78rem;color:#cbd5e1;padding:.15rem 0;line-height:1.5}
  footer{text-align:center;color:var(--muted);font-size:.75rem;margin-top:2rem;padding-top:1rem;border-top:1px solid var(--border)}
</style></head><body>
<div class="container">
  <h1>◆ Team Report</h1>
  <div class="subtitle">Giai đoạn: ${from} → ${to} · Generated ${new Date().toLocaleString("vi-VN")}</div>
  <div class="overview">
    <div class="ov-card"><div class="ov-val">${data.totalPrompts.toLocaleString()}</div><div class="ov-label">Tổng Prompts</div></div>
    <div class="ov-card"><div class="ov-val">${data.totalSessions}</div><div class="ov-label">Sessions</div></div>
    <div class="ov-card"><div class="ov-val">${fmt(data.totalTokens)}</div><div class="ov-label">Tokens</div></div>
    <div class="ov-card"><div class="ov-val">${data.totalMembers}</div><div class="ov-label">Thành viên</div></div>
    <div class="ov-card"><div class="ov-val">$${data.estimatedCostUsd.toFixed(2)}</div><div class="ov-label">Chi phí ước tính</div></div>
  </div>
  ${memberSections}
  <footer>Claude Reporter · ${new Date().toLocaleString("vi-VN")}</footer>
</div></body></html>`;

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `claude-team-report-${from}-${to}.html`; a.click();
  URL.revokeObjectURL(url);
}

// ─── Metric bar ───────────────────────────────────────────────────────────────

function MetricBar({ label, value, max, color, suffix = "" }: {
  label: string; value: number; max: number; color: string; suffix?: string;
}) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", marginBottom: 3 }}>
        <span style={{ color: "var(--text-muted)" }}>{label}</span>
        <span style={{ color, fontWeight: 600 }}>{typeof value === "number" && !Number.isInteger(value) ? value.toFixed(1) : value}{suffix}</span>
      </div>
      <div style={{ height: 5, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.5s ease" }} />
      </div>
    </div>
  );
}

// ─── Member card ──────────────────────────────────────────────────────────────

function MemberCard({ member, rank, maxTokens, maxPrompts }: {
  member: Member; rank: number; maxTokens: number; maxPrompts: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [expandedProject, setExpandedProject] = useState<string | null>(null);

  const rankStyle: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    width: 28, height: 28, borderRadius: "50%", fontWeight: 700, fontSize: "0.85rem",
    flexShrink: 0,
    ...(rank === 1 ? { background: "#ffd700", color: "#000" }
      : rank === 2 ? { background: "#c0c0c0", color: "#000" }
      : rank === 3 ? { background: "#cd7f32", color: "#fff" }
      : { background: "var(--surface)", color: "var(--text-muted)" }),
  };

  return (
    <div className="card" style={{ marginBottom: "0.75rem", padding: "1rem 1.25rem" }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
        <span style={rankStyle}>{rank}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>{member.email}</div>
          <div style={{ color: "var(--text-muted)", fontSize: "0.7rem", marginTop: 2 }}>
            {member.sessions} sessions · {member.activeDays} ngày hoạt động
          </div>
        </div>

        {/* Quick stats */}
        <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
          {[
            { label: "Prompts", value: member.totalPrompts, color: "var(--accent)" },
            { label: "Tokens", value: fmt(member.totalTokens), color: "#f59e0b" },
            { label: "Cost", value: `$${member.estimatedCostUsd.toFixed(4)}`, color: "#f97316" },
          ].map((s) => (
            <div key={s.label} style={{ textAlign: "right" }}>
              <div style={{ color: "var(--text-muted)", fontSize: "0.65rem" }}>{s.label}</div>
              <div style={{ color: s.color, fontWeight: 700, fontSize: "0.9rem" }}>{s.value}</div>
            </div>
          ))}
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 5,
            padding: "3px 10px", fontSize: "0.75rem", color: "var(--text-muted)", cursor: "pointer",
          }}
        >
          {expanded ? "Thu gọn ▲" : "Chi tiết ▼"}
        </button>
      </div>

      {/* Metrics bars */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 2rem", marginTop: "0.75rem" }}>
        <div>
          <MetricBar label="Prompts" value={member.totalPrompts} max={maxPrompts} color="var(--accent)" />
          <MetricBar label="Tokens" value={member.totalTokens} max={maxTokens} color="#f59e0b" />
          <MetricBar label="Session Depth (prompts/session)" value={member.sessionDepth} max={100} color="#a78bfa" suffix="" />
        </div>
        <div>
          <div style={{ marginBottom: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", marginBottom: 3 }}>
              <span style={{ color: "var(--text-muted)" }}>Prompt Efficiency</span>
              <span style={{ color: effColor(member.promptEfficiency), fontWeight: 600 }}>
                {member.promptEfficiency}% · {effLabel(member.promptEfficiency)}
              </span>
            </div>
            <div style={{ height: 5, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ width: `${Math.min(member.promptEfficiency, 100)}%`, height: "100%", background: effColor(member.promptEfficiency), borderRadius: 3 }} />
            </div>
          </div>
          <MetricBar label="Cache Hit Rate (tiết kiệm token)" value={member.cacheHitRate} max={100} color="#22c55e" suffix="%" />
          <MetricBar label="Tokens / Prompt" value={member.tokensPerPrompt} max={5000} color="#06b6d4" />
        </div>
      </div>

      {/* Metric chips */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: "0.75rem" }}>
        {[
          { label: "Meaningful prompts", value: `${member.meaningfulPrompts}/${member.totalPrompts}` },
          { label: "Prompt Efficiency", value: `${member.promptEfficiency}%`, highlight: effColor(member.promptEfficiency) },
          { label: "Tokens/Prompt", value: fmt(member.tokensPerPrompt) },
          { label: "Session Depth", value: `${member.sessionDepth} prompts/session` },
          { label: "Cache Hit", value: `${member.cacheHitRate}%` },
          { label: "Active Days", value: member.activeDays },
        ].map((chip) => (
          <div key={chip.label} style={{
            background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6,
            padding: "2px 8px", fontSize: "0.68rem", color: "var(--text-muted)",
          }}>
            {chip.label}: <strong style={{ color: (chip as { highlight?: string }).highlight ?? "var(--text)" }}>{chip.value}</strong>
          </div>
        ))}
      </div>

      {/* Expanded: projects */}
      {expanded && (
        <div style={{ marginTop: "1rem", borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
          {member.projects.length === 0 ? (
            <div style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>Không có project nào có prompts.</div>
          ) : (
            member.projects.map((proj) => (
              <div key={proj.path} style={{ marginBottom: "0.75rem" }}>
                <div
                  style={{ display: "flex", alignItems: "center", gap: "0.75rem", cursor: "pointer" }}
                  onClick={() => setExpandedProject(expandedProject === proj.path ? null : proj.path)}
                >
                  <div style={{ width: 3, height: 20, background: "var(--accent)", borderRadius: 2, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: "0.82rem" }}>{proj.name}</div>
                    <div style={{ color: "var(--text-muted)", fontSize: "0.68rem", fontFamily: "monospace" }}>{proj.path}</div>
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                    {proj.sessions} sessions · {proj.totalPrompts} prompts ({proj.meaningfulPrompts} meaningful)
                  </div>
                  <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                    {expandedProject === proj.path ? "▲" : "▼"}
                  </span>
                </div>

                {expandedProject === proj.path && (
                  <div style={{ marginTop: "0.5rem", marginLeft: "0.75rem" }}>
                    {proj.weeks.map((w) => (
                      <div key={w.week} style={{ marginBottom: "0.75rem" }}>
                        <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#f59e0b", marginBottom: 4 }}>
                          📅 Tuần {w.week}
                          <span style={{ color: "var(--text-muted)", fontWeight: 400, marginLeft: 8 }}>
                            {w.count} prompts {w.noiseCount > 0 ? `+ ${w.noiseCount} system` : ""}
                          </span>
                        </div>
                        <ol style={{ margin: 0, paddingLeft: "1.25rem" }}>
                          {w.prompts.map((p, i) => (
                            <li key={i} style={{
                              fontSize: "0.73rem", color: "var(--text)", padding: "2px 0",
                              lineHeight: 1.5, borderBottom: "1px solid var(--border)", marginBottom: 2,
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
            ))
          )}
        </div>
      )}
    </div>
  );
}


// ─── Prompt Quality Dashboard ─────────────────────────────────────────────────

interface PQWeek { week: string; prompts: number; repetitionPct: number; codeDumpPct: number; vaguePct: number; score: number; trend: string }
interface PQMember {
  userId: string; email: string; totalPrompts: number; problematicCount: number;
  repetitionPct: number; codeDumpPct: number; vaguePct: number;
  efficiencyScore: number; status: string;
  weeklyScores: PQWeek[];
  problems: { repeated: string[]; codeDumps: string[]; vague: string[] };
}
interface PQData {
  from: string; to: string; totalPrompts: number; totalMembers: number;
  avgEfficiencyScore: number; problematicCount: number; problematicPct: number;
  topPerformer: PQMember | null;
  issueRates: { repetition: number; codeDump: number; vague: number; total: number };
  weeklyTrend: PQWeek[];
  members: PQMember[];
}

function scoreColor(s: number) {
  if (s >= 80) return "#4ade80";
  if (s >= 60) return "#fb923c";
  return "#f87171";
}
function scoreStatusColor(status: string) {
  if (status === "TỐT") return { bg: "rgba(74,222,128,0.12)", color: "#4ade80" };
  if (status === "TRUNG BÌNH") return { bg: "rgba(251,146,60,0.12)", color: "#fb923c" };
  return { bg: "rgba(248,113,113,0.12)", color: "#f87171" };
}

function IssueBar({ label, pct, warn }: { label: string; pct: number; warn: number }) {
  const over = pct > warn;
  const color = over ? "#f87171" : "#fb923c";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "0.6rem 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ width: 140, fontSize: "0.82rem", color: "var(--text-muted)" }}>{label}</div>
      <div style={{ flex: 1, height: 10, background: "var(--border)", borderRadius: 5, overflow: "hidden" }}>
        <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: color, borderRadius: 5, transition: "width 0.5s ease" }} />
      </div>
      <div style={{ width: 52, fontWeight: 700, fontSize: "0.88rem", color, textAlign: "right" }}>{pct}%</div>
    </div>
  );
}

function ScoreBar({ score }: { score: number }) {
  const color = scoreColor(score);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${score}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.6s ease" }} />
      </div>
      <span style={{ fontWeight: 700, fontSize: "0.88rem", color, minWidth: 36, textAlign: "right" }}>{score}</span>
    </div>
  );
}

function MemberPQCard({ m, rank }: { m: PQMember; rank: number }) {
  const [open, setOpen] = useState(false);
  const sc = scoreStatusColor(m.status);
  const rankStyle: React.CSSProperties = rank === 1
    ? { background: "#ffd700", color: "#000" }
    : rank === 2 ? { background: "#c0c0c0", color: "#000" }
    : rank === 3 ? { background: "#cd7f32", color: "#fff" }
    : { background: "var(--surface)", color: "var(--text-muted)" };

  return (
    <div className="card" style={{ marginBottom: "0.6rem", padding: "1rem 1.25rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
        <span style={{ ...rankStyle, display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: "50%", fontWeight: 700, fontSize: "0.82rem", flexShrink: 0 }}>{rank}</span>
        <div style={{ flex: 1, minWidth: 120 }}>
          <div style={{ fontWeight: 600, fontSize: "0.92rem" }}>{m.email}</div>
          <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: 2 }}>{m.totalPrompts} prompts · {m.problematicCount} có vấn đề</div>
        </div>

        {/* Score */}
        <div style={{ minWidth: 180, flex: 1 }}>
          <div style={{ fontSize: "0.63rem", color: "var(--text-muted)", marginBottom: 4 }}>
            Hiệu quả = 100 - ({m.repetitionPct}%×0.4) - ({m.codeDumpPct}%×0.3) - ({m.vaguePct}%×0.3)
          </div>
          <ScoreBar score={m.efficiencyScore} />
        </div>

        {/* Metric chips */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[
            { label: "Lặp lại", val: m.repetitionPct, warn: 20 },
            { label: "Code Dump", val: m.codeDumpPct, warn: 15 },
            { label: "Mơ hồ", val: m.vaguePct, warn: 10 },
          ].map((c) => (
            <div key={c.label} style={{ fontSize: "0.68rem", textAlign: "center" }}>
              <div style={{ color: "var(--text-muted)" }}>{c.label}</div>
              <div style={{ fontWeight: 700, color: c.val > c.warn ? "#f87171" : "var(--text)" }}>{c.val}%</div>
            </div>
          ))}
        </div>

        <span style={{ ...sc, borderRadius: 6, padding: "2px 10px", fontSize: "0.72rem", fontWeight: 700 }}>{m.status}</span>

        <button onClick={() => setOpen(!open)} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 5, padding: "3px 10px", fontSize: "0.72rem", color: "var(--text-muted)", cursor: "pointer" }}>
          {open ? "Thu gọn ▲" : "Chi tiết ▼"}
        </button>
      </div>

      {open && (
        <div style={{ marginTop: "1rem", borderTop: "1px solid var(--border)", paddingTop: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {/* Weekly trend for this member */}
          {m.weeklyScores.length > 0 && (
            <div>
              <div style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>Xu hướng theo tuần</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {m.weeklyScores.map((w) => (
                  <div key={w.week} style={{ textAlign: "center", minWidth: 52 }}>
                    <div style={{ fontSize: "0.6rem", color: "var(--text-muted)" }}>{w.week}</div>
                    <div style={{ fontWeight: 700, fontSize: "0.88rem", color: scoreColor(w.score) }}>{w.score}</div>
                    <div style={{ fontSize: "0.6rem", color: "var(--text-muted)" }}>{w.prompts}p</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Problem examples */}
          {m.problems.repeated.length > 0 && (
            <div>
              <div style={{ fontSize: "0.72rem", fontWeight: 600, color: "#fb923c", marginBottom: 4 }}>🔄 Prompts lặp lại ({m.problems.repeated.length} mẫu)</div>
              {m.problems.repeated.map((p, i) => (
                <div key={i} style={{ fontSize: "0.72rem", padding: "4px 8px", background: "rgba(251,146,60,0.06)", borderLeft: "2px solid #fb923c", marginBottom: 3, borderRadius: "0 4px 4px 0", color: "var(--text-muted)" }}>
                  "{p}{p.length >= 120 ? "…" : ""}"
                </div>
              ))}
            </div>
          )}
          {m.problems.codeDumps.length > 0 && (
            <div>
              <div style={{ fontSize: "0.72rem", fontWeight: 600, color: "#a78bfa", marginBottom: 4 }}>📋 Code dump ({m.problems.codeDumps.length} mẫu)</div>
              {m.problems.codeDumps.map((p, i) => (
                <div key={i} style={{ fontSize: "0.72rem", padding: "4px 8px", background: "rgba(167,139,250,0.06)", borderLeft: "2px solid #a78bfa", marginBottom: 3, borderRadius: "0 4px 4px 0", color: "var(--text-muted)" }}>
                  "{p}{p.length >= 120 ? "…" : ""}"
                </div>
              ))}
            </div>
          )}
          {m.problems.vague.length > 0 && (
            <div>
              <div style={{ fontSize: "0.72rem", fontWeight: 600, color: "#f87171", marginBottom: 4 }}>❓ Prompts mơ hồ ({m.problems.vague.length} mẫu)</div>
              {m.problems.vague.map((p, i) => (
                <div key={i} style={{ fontSize: "0.72rem", padding: "4px 8px", background: "rgba(248,113,113,0.06)", borderLeft: "2px solid #f87171", marginBottom: 3, borderRadius: "0 4px 4px 0", color: "var(--text-muted)" }}>
                  "{p}{p.length >= 120 ? "…" : ""}"
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PromptQualityView({ from, to }: { from: string; to: string }) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [data, setData] = useState<PQData | null>(null);
  const tick = useAutoRefresh(60_000);

  async function load() {
    setStatus("loading");
    try {
      const qs = new URLSearchParams({ from, to });
      const res = await fetch(`/api/report/prompt-quality?${qs}`);
      const json: PQData = await res.json();
      setData(json); setStatus("done");
    } catch { setStatus("error"); }
  }

  useEffect(() => { load(); }, [from, to]);
  useEffect(() => { if (status === "done") load(); }, [tick]);

  const firstScore = data?.weeklyTrend[0]?.score ?? 0;
  const lastScore = data?.weeklyTrend[data.weeklyTrend.length - 1]?.score ?? 0;
  const scoreDiff = Math.round((lastScore - firstScore) * 10) / 10;

  return (
    <>
      <div style={{ textAlign: "right", marginBottom: "1rem" }}>
        <button onClick={load} disabled={status === "loading"} style={{
          background: status === "loading" ? "var(--surface)" : "var(--accent)",
          color: "#fff", border: "none", borderRadius: 6,
          padding: "0.45rem 1.25rem", fontWeight: 600, fontSize: "0.85rem",
          cursor: status === "loading" ? "default" : "pointer", opacity: status === "loading" ? 0.7 : 1,
        }}>
          {status === "loading" ? "Đang tính…" : "Làm mới"}
        </button>
      </div>

      {status === "loading" && (
        <div className="card" style={{ textAlign: "center", padding: "2rem" }}>
          <div style={{ color: "var(--accent)", fontSize: "0.9rem" }}>⏳ Đang phân tích chất lượng prompt…</div>
        </div>
      )}
      {status === "error" && <div className="card" style={{ color: "var(--red)", textAlign: "center" }}>Có lỗi. Thử lại nhé.</div>}

      {status === "done" && data && (
        <>
          {/* Overview cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: "0.75rem", marginBottom: "1.25rem" }}>
            {[
              { label: "Tổng Thành Viên", value: data.totalMembers, color: "var(--accent)" },
              { label: "Tổng Prompts", value: data.totalPrompts.toLocaleString(), color: "#4ade80" },
              { label: "Sessions phân tích", value: data.weeklyTrend.reduce((s, w) => s + w.prompts, 0).toLocaleString(), color: "#06b6d4" },
            ].map((c) => (
              <div key={c.label} className="card" style={{ padding: "0.75rem 1rem" }}>
                <div style={{ color: "var(--text-muted)", fontSize: "0.68rem" }}>{c.label}</div>
                <div style={{ color: c.color, fontSize: "1.4rem", fontWeight: 700, lineHeight: 1.2 }}>{c.value}</div>
              </div>
            ))}
            <div className="card" style={{ padding: "0.75rem 1rem" }}>
              <div style={{ color: "var(--text-muted)", fontSize: "0.68rem" }}>Điểm Hiệu Quả TB</div>
              <div style={{ color: scoreColor(data.avgEfficiencyScore), fontSize: "1.4rem", fontWeight: 700, lineHeight: 1.2 }}>{data.avgEfficiencyScore}</div>
              <div style={{ fontSize: "0.62rem", color: "var(--text-muted)" }}>Trung bình toàn team</div>
            </div>
            <div className="card" style={{ padding: "0.75rem 1rem" }}>
              <div style={{ color: "var(--text-muted)", fontSize: "0.68rem" }}>Prompts Có Vấn Đề</div>
              <div style={{ color: "#fb923c", fontSize: "1.4rem", fontWeight: 700, lineHeight: 1.2 }}>{data.problematicPct}%</div>
              <div style={{ fontSize: "0.62rem", color: "var(--text-muted)" }}>{data.problematicCount} prompts cần cải thiện</div>
            </div>
            <div className="card" style={{ padding: "0.75rem 1rem" }}>
              <div style={{ color: "var(--text-muted)", fontSize: "0.68rem" }}>Top Performer</div>
              <div style={{ color: "#4ade80", fontSize: "1.1rem", fontWeight: 700, lineHeight: 1.4 }}>{data.topPerformer?.email.split("@")[0] ?? "—"}</div>
              <div style={{ fontSize: "0.62rem", color: "var(--text-muted)" }}>Điểm hiệu quả: {data.topPerformer?.efficiencyScore ?? 0}</div>
            </div>
          </div>

          {/* Formula card */}
          <div className="card" style={{ marginBottom: "1.25rem", background: "rgba(99,102,241,0.04)", border: "1px solid rgba(99,102,241,0.2)" }}>
            <div style={{ fontWeight: 700, fontSize: "0.85rem", marginBottom: "0.5rem" }}>📐 Công Thức Tính Điểm Hiệu Quả</div>
            <div style={{ fontFamily: "monospace", fontSize: "0.82rem", background: "rgba(0,0,0,0.2)", padding: "0.6rem 0.9rem", borderRadius: 6, marginBottom: "0.75rem", color: "#a5b4fc" }}>
              Efficiency Score = 100 − (Repetition% × 0.4) − (CodeDump% × 0.3) − (Vague% × 0.3)
            </div>
            <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", fontSize: "0.75rem", color: "var(--text-muted)" }}>
              <span><strong style={{ color: "#fb923c" }}>Repetition%</strong> = prompt lặp lại / tổng · Trọng số 40%</span>
              <span><strong style={{ color: "#a78bfa" }}>CodeDump%</strong> = paste code không giải thích / tổng · Trọng số 30%</span>
              <span><strong style={{ color: "#f87171" }}>Vague%</strong> = prompt mơ hồ, thiếu chi tiết / tổng · Trọng số 30%</span>
            </div>
            <div style={{ marginTop: "0.5rem", fontSize: "0.72rem", color: "var(--text-muted)" }}>
              Tiêu chí: <span style={{ color: "#4ade80", fontWeight: 600 }}>≥80: TỐT</span> · <span style={{ color: "#fb923c", fontWeight: 600 }}>60–79: TRUNG BÌNH</span> · <span style={{ color: "#f87171", fontWeight: 600 }}>&lt;60: CẦN CẢI THIỆN</span>
            </div>
          </div>

          {/* Issue rates */}
          <div className="card" style={{ marginBottom: "1.25rem" }}>
            <div style={{ fontWeight: 700, fontSize: "0.88rem", marginBottom: "0.75rem" }}>📈 Tỉ Lệ Các Vấn Đề Chính</div>
            <IssueBar label="Tỉ Lệ Lặp Lại" pct={data.issueRates.repetition} warn={20} />
            <IssueBar label="Code Dump Rate" pct={data.issueRates.codeDump} warn={15} />
            <IssueBar label="Tỉ Lệ Mơ Hồ" pct={data.issueRates.vague} warn={10} />
            <IssueBar label="Tổng Có Vấn Đề" pct={data.issueRates.total} warn={18} />
            <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: "0.5rem" }}>
              ⚠ Ngưỡng cảnh báo: Lặp lại &gt;20% · Code Dump &gt;15% · Mơ hồ &gt;10%
            </div>
          </div>

          {/* Member ranking */}
          <div style={{ fontWeight: 700, fontSize: "0.9rem", marginBottom: "0.75rem" }}>👥 Bảng Xếp Hạng Thành Viên</div>
          {data.members.map((m, i) => <MemberPQCard key={m.userId} m={m} rank={i + 1} />)}
          {data.members.length === 0 && (
            <div className="card" style={{ textAlign: "center", color: "var(--text-muted)", padding: "2rem" }}>
              Không có dữ liệu. Cần có user_prompt events trong khoảng thời gian này.
            </div>
          )}

          {/* Weekly trend table */}
          {data.weeklyTrend.length > 0 && (
            <div className="card" style={{ marginTop: "1.25rem" }}>
              <div style={{ fontWeight: 700, fontSize: "0.88rem", marginBottom: "0.75rem" }}>📈 Phân Tích Xu Hướng Theo Tuần</div>

              {/* Mini chart */}
              <div style={{ display: "flex", alignItems: "flex-end", gap: 6, marginBottom: "1rem", height: 64 }}>
                {data.weeklyTrend.map((w) => (
                  <div key={w.week} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                    <div style={{ fontSize: "0.6rem", color: scoreColor(w.score), fontWeight: 700 }}>{w.score}</div>
                    <div style={{
                      width: "100%", background: scoreColor(w.score), borderRadius: "3px 3px 0 0",
                      height: `${Math.max(8, (w.score / 100) * 48)}px`, opacity: 0.85,
                    }} />
                    <div style={{ fontSize: "0.58rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>{w.week}</div>
                  </div>
                ))}
              </div>

              {/* Trend table */}
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem" }}>
                  <thead>
                    <tr>
                      {["Tuần", "Prompts", "Repetition%", "CodeDump%", "Vague%", "Score", "Xu Hướng"].map((h) => (
                        <th key={h} style={{ textAlign: "left", padding: "6px 10px", color: "var(--text-muted)", borderBottom: "1px solid var(--border)", fontWeight: 600, fontSize: "0.7rem", background: "var(--surface)" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.weeklyTrend.map((w) => (
                      <tr key={w.week} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "6px 10px", fontWeight: 600 }}>{w.week}</td>
                        <td style={{ padding: "6px 10px" }}>{w.prompts}</td>
                        <td style={{ padding: "6px 10px", color: w.repetitionPct > 20 ? "#f87171" : "var(--text)" }}>{w.repetitionPct}%</td>
                        <td style={{ padding: "6px 10px", color: w.codeDumpPct > 15 ? "#f87171" : "var(--text)" }}>{w.codeDumpPct}%</td>
                        <td style={{ padding: "6px 10px", color: w.vaguePct > 10 ? "#f87171" : "var(--text)" }}>{w.vaguePct}%</td>
                        <td style={{ padding: "6px 10px", fontWeight: 700, color: scoreColor(w.score) }}>{w.score}</td>
                        <td style={{ padding: "6px 10px", color: w.trend.startsWith("↑") ? "#4ade80" : w.trend.startsWith("↓") ? "#f87171" : "var(--text-muted)" }}>{w.trend}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Summary */}
              {data.weeklyTrend.length > 1 && (
                <div style={{ marginTop: "0.75rem", padding: "0.75rem", background: scoreDiff >= 0 ? "rgba(74,222,128,0.06)" : "rgba(248,113,113,0.06)", borderRadius: 8, fontSize: "0.78rem" }}>
                  <strong>Tuần đầu → Tuần cuối:</strong> Score từ <strong style={{ color: scoreColor(firstScore) }}>{firstScore}</strong> → <strong style={{ color: scoreColor(lastScore) }}>{lastScore}</strong>
                  <span style={{ color: scoreDiff >= 0 ? "#4ade80" : "#f87171", marginLeft: 8 }}>({scoreDiff >= 0 ? "+" : ""}{scoreDiff} điểm, {scoreDiff >= 0 ? "+" : ""}{Math.round((scoreDiff / firstScore) * 100)}%)</span>
                  <div style={{ marginTop: 4, color: "var(--text-muted)" }}>
                    {scoreDiff >= 0 ? "📈 Xu hướng tích cực — chất lượng prompt cải thiện qua các tuần" : "📉 Xu hướng giảm — cần chú ý cải thiện chất lượng prompt"}
                  </div>
                </div>
              )}

              {/* Top 3 improvers */}
              {data.members.length >= 2 && (() => {
                const sorted = [...data.members].filter((m) => m.weeklyScores.length >= 2)
                  .map((m) => ({
                    m,
                    first: m.weeklyScores[0].score,
                    last: m.weeklyScores[m.weeklyScores.length - 1].score,
                    diff: m.weeklyScores[m.weeklyScores.length - 1].score - m.weeklyScores[0].score,
                  }))
                  .sort((a, b) => b.diff - a.diff)
                  .slice(0, 3);
                if (sorted.length === 0) return null;
                return (
                  <div style={{ marginTop: "1rem" }}>
                    <div style={{ fontWeight: 700, fontSize: "0.82rem", marginBottom: "0.6rem" }}>🏆 Top thành viên cải thiện nhiều nhất</div>
                    {sorted.map((s, i) => (
                      <div key={s.m.userId} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.5rem 0.75rem", background: "var(--surface)", borderRadius: 8, marginBottom: 6 }}>
                        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: "50%", fontWeight: 700, fontSize: "0.75rem", flexShrink: 0, background: i === 0 ? "#ffd700" : i === 1 ? "#c0c0c0" : "#cd7f32", color: i === 0 ? "#000" : "#fff" }}>{i + 1}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: "0.82rem" }}>{s.m.email}</div>
                          <div style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
                            {s.m.weeklyScores[0].week}: {s.first} → {s.m.weeklyScores[s.m.weeklyScores.length - 1].week}: {s.last}
                          </div>
                        </div>
                        <span style={{ fontWeight: 700, color: s.diff >= 0 ? "#4ade80" : "#f87171", fontSize: "0.88rem" }}>{s.diff >= 0 ? "+" : ""}{Math.round(s.diff * 10) / 10} điểm</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}
        </>
      )}
    </>
  );
}

// ─── Team report view ─────────────────────────────────────────────────────────

function TeamReportView({ from, to }: { from: string; to: string }) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [report, setReport] = useState<TeamReportData | null>(null);
  const tick = useAutoRefresh(60_000);

  async function generate() {
    setStatus("loading");
    try {
      const qs = new URLSearchParams({ from, to });
      const res = await fetch(`/api/report/team?${qs}`);
      const data: TeamReportData = await res.json();
      setReport(data); setStatus("done");
    } catch { setStatus("error"); }
  }

  // Auto-load on mount and when date range / userId changes
  useEffect(() => { generate(); }, [from, to]);
  // Auto-refresh on socket event / interval (only if already loaded)
  useEffect(() => { if (status === "done") generate(); }, [tick]);

  const maxTokens = Math.max(...(report?.members.map((m) => m.totalTokens) ?? [1]));
  const maxPrompts = Math.max(...(report?.members.map((m) => m.totalPrompts) ?? [1]));

  return (
    <>
      <div style={{ textAlign: "right", marginBottom: "1rem" }}>
        <button
          onClick={generate}
          disabled={status === "loading"}
          style={{
            background: status === "loading" ? "var(--surface)" : "var(--accent)",
            color: "#fff", border: "none", borderRadius: 6,
            padding: "0.45rem 1.25rem", fontWeight: 600, fontSize: "0.85rem",
            cursor: status === "loading" ? "default" : "pointer",
            opacity: status === "loading" ? 0.7 : 1,
          }}
        >
          {status === "loading" ? "Đang tạo…" : status === "done" ? "Tạo lại" : "Generate Team Report"}
        </button>
      </div>

      {status === "loading" && (
        <div className="card" style={{ textAlign: "center", padding: "2rem" }}>
          <div style={{ color: "var(--accent)", fontSize: "0.9rem" }}>⏳ Đang phân tích dữ liệu team…</div>
        </div>
      )}

      {status === "error" && (
        <div className="card" style={{ color: "var(--red)", textAlign: "center" }}>Có lỗi. Thử lại nhé.</div>
      )}

      {status === "done" && report && (
        <>
          {/* Overview */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: "0.75rem", marginBottom: "1rem" }}>
            {[
              { label: "Tổng Prompts", value: report.totalPrompts.toLocaleString(), color: "var(--accent)" },
              { label: "Sessions", value: report.totalSessions, color: "var(--green)" },
              { label: "Tokens", value: fmt(report.totalTokens), color: "#f59e0b" },
              { label: "Thành viên", value: report.totalMembers, color: "#a78bfa" },
              { label: "Chi phí ước tính", value: `$${report.estimatedCostUsd.toFixed(2)}`, color: "#f97316" },
            ].map((c) => (
              <div key={c.label} className="card" style={{ padding: "0.75rem 1rem" }}>
                <div style={{ color: "var(--text-muted)", fontSize: "0.68rem" }}>{c.label}</div>
                <div style={{ color: c.color, fontSize: "1.4rem", fontWeight: 700, lineHeight: 1.2 }}>{c.value}</div>
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="card" style={{ marginBottom: "1rem", padding: "0.75rem 1rem", fontSize: "0.75rem" }}>
            <span style={{ fontWeight: 600, marginRight: "1rem" }}>📊 Giải thích metrics:</span>
            <span style={{ color: "var(--text-muted)", marginRight: "1rem" }}>
              <strong style={{ color: "var(--green)" }}>Prompt Efficiency</strong> = % prompt thực của user / tổng prompts (loại bỏ file selections, interrupts, system messages)
            </span>
            <span style={{ color: "var(--text-muted)", marginRight: "1rem" }}>
              <strong style={{ color: "#06b6d4" }}>Tokens/Prompt</strong> = mức độ phức tạp trung bình mỗi request
            </span>
            <span style={{ color: "var(--text-muted)" }}>
              <strong style={{ color: "#a78bfa" }}>Session Depth</strong> = số prompt/session (cao = tác vụ phức tạp)
            </span>
          </div>

          {/* Member cards */}
          {report.members.map((m, i) => (
            <MemberCard key={m.userId} member={m} rank={i + 1} maxTokens={maxTokens} maxPrompts={maxPrompts} />
          ))}

          {report.members.length === 0 && (
            <div className="card" style={{ textAlign: "center", color: "var(--text-muted)", padding: "2rem" }}>
              Không có dữ liệu trong khoảng thời gian này.
            </div>
          )}

          {/* Export */}
          {report.members.length > 0 && (
            <div style={{ textAlign: "center", marginTop: "1.5rem" }}>
              <button
                onClick={() => exportTeamHTML(report, from, to)}
                style={{
                  background: "var(--accent)", color: "#fff", border: "none", borderRadius: 6,
                  padding: "0.5rem 1.5rem", fontWeight: 600, fontSize: "0.85rem", cursor: "pointer",
                }}
              >
                ↓ Tải Team Report HTML
              </button>
            </div>
          )}

        </>
      )}
    </>
  );
}

// ─── Project report view (existing) ──────────────────────────────────────────

function ProjectReportView({ from, to }: { from: string; to: string }) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [report, setReport] = useState<ReportData | null>(null);
  const [visibleProjects, setVisibleProjects] = useState<number>(0);
  const [currentProject, setCurrentProject] = useState<string>("");
  const timerRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const tick = useAutoRefresh(60_000);

  useEffect(() => () => { timerRef.current.forEach(clearTimeout); }, []);

  async function generate() {
    setStatus("loading"); setVisibleProjects(0);
    timerRef.current.forEach(clearTimeout); timerRef.current = [];
    try {
      const qs = new URLSearchParams({ from, to });
      const res = await fetch(`/api/report?${qs}`);
      const data: ReportData = await res.json();
      setReport(data); setStatus("done");
      setCurrentProject(data.projects[0]?.name ?? "");
      data.projects.forEach((p, i) => {
        timerRef.current.push(
          setTimeout(() => setCurrentProject(p.name), i * 300),
          setTimeout(() => setVisibleProjects(i + 1), i * 300 + 150),
        );
      });
    } catch { setStatus("error"); }
  }

  // Auto-load on mount and when date range / userId changes
  useEffect(() => { generate(); }, [from, to]);
  // Auto-refresh on socket event / interval (only if already loaded)
  useEffect(() => { if (status === "done") generate(); }, [tick]);

  return (
    <>
      <div style={{ textAlign: "right", marginBottom: "1rem" }}>
        <button
          onClick={generate}
          disabled={status === "loading"}
          style={{
            background: status === "loading" ? "var(--surface)" : "var(--accent)",
            color: "#fff", border: "none", borderRadius: 6,
            padding: "0.45rem 1.25rem", fontWeight: 600, fontSize: "0.85rem",
            cursor: status === "loading" ? "default" : "pointer",
            opacity: status === "loading" ? 0.7 : 1,
          }}
        >
          {status === "loading" ? "Đang tạo…" : status === "done" ? "Tạo lại" : "Generate Report"}
        </button>
      </div>

      {status === "loading" && (
        <div className="card" style={{ padding: "2rem", textAlign: "center" }}>
          <div style={{ color: "var(--accent)", fontSize: "0.9rem", marginBottom: 8 }}>⏳ Đang phân tích…</div>
          {currentProject && (
            <div style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
              Đang xử lý: <strong style={{ color: "var(--text)" }}>{currentProject}</strong>
            </div>
          )}
        </div>
      )}

      {status === "error" && (
        <div className="card" style={{ color: "var(--red)", textAlign: "center" }}>Có lỗi. Thử lại nhé.</div>
      )}

      {status === "done" && report && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: "0.75rem", marginBottom: "1rem" }}>
            {[
              { label: "Sessions", value: report.totalSessions, color: "var(--accent)" },
              { label: "Total Events", value: fmt(report.totalEvents), color: "var(--green)" },
              { label: "Total Tokens", value: fmt(report.totalTokens), color: "#f59e0b" },
              { label: "Est. Cost", value: `$${report.estimatedCostUsd.toFixed(2)}`, color: "#f97316" },
              { label: "Projects", value: report.projects.length, color: "#a78bfa" },
            ].map((c) => (
              <div key={c.label} className="card" style={{ padding: "0.75rem 1rem" }}>
                <div style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}>{c.label}</div>
                <div style={{ color: c.color, fontSize: "1.5rem", fontWeight: 700, lineHeight: 1.2 }}>{c.value}</div>
              </div>
            ))}
          </div>

          <div style={{ marginBottom: "1rem" }}>
            <div style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.75rem" }}>Breakdown theo dự án</div>
            {report.projects.map((p, i) => (
              <div key={p.path || p.name} className="card" style={{
                marginBottom: "0.6rem", padding: "0.9rem 1rem",
                opacity: i < visibleProjects ? 1 : 0,
                transform: i < visibleProjects ? "translateY(0)" : "translateY(8px)",
                transition: "opacity 0.25s ease, transform 0.25s ease",
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
                  <div style={{ flex: "0 0 auto", minWidth: 180 }}>
                    <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{p.name}</div>
                    <div style={{ color: "var(--text-muted)", fontSize: "0.68rem", fontFamily: "monospace", marginTop: 2, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.path || "—"}
                    </div>
                    {p.users.length > 0 && (
                      <div style={{ color: "var(--text-muted)", fontSize: "0.68rem", marginTop: 4 }}>
                        👤 {p.users.join(", ")}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap", flex: 1 }}>
                    {[
                      { label: "Sessions", value: p.sessions, color: "var(--accent)" },
                      { label: "Events", value: fmt(p.events), color: "var(--green)" },
                      { label: "Tokens", value: fmt(p.totalTokens), color: "#f59e0b" },
                      { label: "Cost", value: `$${p.estimatedCostUsd.toFixed(4)}`, color: "#f97316" },
                    ].map((m) => (
                      <div key={m.label}>
                        <div style={{ color: "var(--text-muted)", fontSize: "0.68rem" }}>{m.label}</div>
                        <div style={{ color: m.color, fontWeight: 700, fontSize: "0.95rem" }}>{m.value}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ width: 140, flexShrink: 0 }}>
                    <div style={{ color: "var(--text-muted)", fontSize: "0.68rem", marginBottom: 4 }}>Token split</div>
                    {[
                      { label: "In", val: p.inputTokens, color: "#6366f1" },
                      { label: "Out", val: p.outputTokens, color: "#22c55e" },
                      { label: "Cache", val: p.cacheReadTokens + p.cacheCreationTokens, color: "#eab308" },
                    ].map((b) => {
                      const pct = p.totalTokens > 0 ? Math.round((b.val / p.totalTokens) * 100) : 0;
                      return (
                        <div key={b.label} style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3 }}>
                          <div style={{ width: 24, fontSize: "0.6rem", color: "var(--text-muted)" }}>{b.label}</div>
                          <div style={{ flex: 1, height: 5, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
                            <div style={{ width: `${pct}%`, height: "100%", background: b.color }} />
                          </div>
                          <div style={{ width: 28, fontSize: "0.6rem", color: "var(--text-muted)", textAlign: "right" }}>{pct}%</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
            {report.projects.length === 0 && (
              <div className="card" style={{ textAlign: "center", color: "var(--text-muted)", padding: "2rem" }}>
                Không có dữ liệu trong khoảng thời gian này.
              </div>
            )}
          </div>

          {report.projects.length > 0 && (
            <div style={{ textAlign: "center", marginTop: "1.5rem" }}>
              <button
                onClick={() => exportProjectHTML(report, from, to)}
                style={{
                  background: "var(--accent)", color: "#fff", border: "none", borderRadius: 6,
                  padding: "0.5rem 1.5rem", fontWeight: 600, fontSize: "0.85rem", cursor: "pointer",
                }}
              >
                ↓ Tải Project Report HTML
              </button>
            </div>
          )}

        </>
      )}
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function ReportPageInner() {
  const searchParams = useSearchParams();
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());
  const [activePreset, setActivePreset] = useState<number | null>(30);
  const [tab, setTab] = useState<"team" | "project" | "quality">("team");
  const [userRole, setUserRole] = useState<string>("member");

  useEffect(() => {
    const role = localStorage.getItem("claude-reporter-role") ?? "member";
    setUserRole(role);
  }, []);

  // Team Report tab only for admin and dept_head
  const canSeeTeamReport = userRole === "admin" || userRole === "dept_head";

  const inputStyle: React.CSSProperties = {
    background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6,
    padding: "0.4rem 0.6rem", color: "var(--text)", fontSize: "0.85rem", outline: "none",
  };
  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "0.4rem 1rem", borderRadius: 6, fontSize: "0.82rem", fontWeight: 600,
    border: "1px solid var(--border)", cursor: "pointer",
    background: active ? "var(--accent)" : "transparent",
    color: active ? "#fff" : "var(--text-muted)",
  });

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0 }}>Report</h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", margin: "2px 0 0" }}>
            Tổng hợp và phân tích dữ liệu Claude Code
          </p>
        </div>
        <Link href="/" style={{ marginLeft: "auto", color: "var(--text-muted)", fontSize: "0.8rem", textDecoration: "none" }}>
          ← Trang chủ
        </Link>
      </div>

      {/* Controls */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <div style={{ color: "var(--text-muted)", fontSize: "0.72rem", marginBottom: 4 }}>Từ ngày</div>
            <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setActivePreset(null); }} style={inputStyle} />
          </div>
          <div>
            <div style={{ color: "var(--text-muted)", fontSize: "0.72rem", marginBottom: 4 }}>Đến ngày</div>
            <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setActivePreset(null); }} style={inputStyle} />
          </div>
          <div>
            <div style={{ color: "var(--text-muted)", fontSize: "0.72rem", marginBottom: 4 }}>Nhanh</div>
            <div style={{ display: "flex", gap: "0.3rem" }}>
              {[{ label: "7d", days: 7 }, { label: "30d", days: 30 }, { label: "90d", days: 90 }].map((r) => (
                <button key={r.label} onClick={() => { setActivePreset(r.days); setFrom(daysAgo(r.days)); setTo(today()); }}
                  style={{ background: activePreset === r.days ? "var(--accent)" : "var(--surface)", border: "1px solid var(--border)", borderRadius: 5, padding: "2px 8px", fontSize: "0.72rem", color: activePreset === r.days ? "#fff" : "var(--text-muted)", cursor: "pointer", fontWeight: activePreset === r.days ? 600 : 400 }}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <button style={tabStyle(tab === "team")} onClick={() => setTab("team")}>
          👤 My Report
        </button>
        <button style={tabStyle(tab === "project")} onClick={() => setTab("project")}>
          📁 Project Report
        </button>
        {canSeeTeamReport && (
          <button style={tabStyle(tab === "quality")} onClick={() => setTab("quality")}>
            👥 Team Report
          </button>
        )}
      </div>

      {tab === "team" && <TeamReportView from={from} to={to} />}
      {tab === "project" && <ProjectReportView from={from} to={to} />}
      {tab === "quality" && canSeeTeamReport && <PromptQualityView from={from} to={to} />}
    </div>
  );
}

export default function ReportPage() {
  return (
    <Suspense>
      <ReportPageInner />
    </Suspense>
  );
}
