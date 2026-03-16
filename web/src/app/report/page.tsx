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
  if (s == null) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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

// ─── Project report HTML export — dựa theo center_summary_template ────────────

function exportProjectHTML(data: ReportData, from: string, to: string) {
  const projectRows = data.projects.map((p, i) => {
    const totalTok = p.totalTokens;
    return `<tr>
      <td><span class="rank-badge ${i === 0 ? "rank-1" : i === 1 ? "rank-2" : i === 2 ? "rank-3" : "rank-other"}">${i + 1}</span></td>
      <td><strong>${escapeHtml(p.name)}</strong><br><small style="color:#888;font-family:monospace;font-size:11px">${escapeHtml(p.path)}</small></td>
      <td style="text-align:right">${p.sessions}</td>
      <td style="text-align:right">${p.events}</td>
      <td style="text-align:right">
        <div style="display:flex;align-items:center;gap:8px;justify-content:flex-end">
          <div class="score-bar"><div class="score-bar-fill good" style="width:${data.totalTokens > 0 ? Math.min((totalTok / data.totalTokens) * 100, 100).toFixed(0) : 0}%"></div></div>
          <strong style="color:#1a1a2e">${fmt(totalTok)}</strong>
        </div>
      </td>
      <td>${p.users.map(escapeHtml).join(", ") || "<span style='color:#aaa'>—</span>"}</td>
      <td style="text-align:right;color:#888;font-size:12px">${p.lastActivity ? new Date(p.lastActivity).toLocaleDateString("vi-VN") : "—"}</td>
    </tr>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Claude Reporter — Báo Cáo Cá Nhân ${from} → ${to}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background:linear-gradient(135deg,#0f2027 0%,#203a43 50%,#2c5364 100%);min-height:100vh;padding:20px;color:#333}
  .container{max-width:1200px;margin:0 auto}
  .header{background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);color:white;padding:40px;border-radius:20px;margin-bottom:25px;box-shadow:0 15px 50px rgba(0,0,0,0.4);text-align:center}
  .header h1{font-size:32px;margin-bottom:8px}
  .header .subtitle{font-size:15px;opacity:.8}
  .header-stats{display:flex;justify-content:center;gap:24px;margin-top:25px;flex-wrap:wrap}
  .header-stat{background:rgba(255,255,255,0.1);padding:18px 28px;border-radius:12px;backdrop-filter:blur(10px);min-width:120px;text-align:center}
  .header-stat span{font-size:12px;opacity:.9;display:block}
  .header-stat strong{display:block;font-size:24px;margin-top:6px}
  .grid-4{display:grid;grid-template-columns:repeat(4,1fr);gap:20px;margin-bottom:25px}
  @media(max-width:900px){.grid-4{grid-template-columns:repeat(2,1fr)}}
  @media(max-width:500px){.grid-4{grid-template-columns:1fr}}
  .card{background:white;border-radius:15px;padding:25px;box-shadow:0 5px 20px rgba(0,0,0,0.1);transition:transform .3s}
  .card:hover{transform:translateY(-3px)}
  .card-title{font-size:12px;color:#666;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px}
  .card-value{font-size:30px;font-weight:bold;color:#1a1a2e}
  .card-value.good{color:#28a745}.card-value.warning{color:#fd7e14}.card-value.danger{color:#dc3545}
  .card-subtitle{font-size:12px;color:#888;margin-top:5px}
  .section{background:white;border-radius:15px;padding:25px;margin-bottom:25px;box-shadow:0 5px 20px rgba(0,0,0,0.1)}
  .section-title{font-size:17px;font-weight:bold;color:#1a1a2e;margin-bottom:20px;padding-bottom:10px;border-bottom:2px solid #eee;display:flex;align-items:center;gap:10px}
  table{width:100%;border-collapse:collapse}
  th{background:linear-gradient(135deg,#1a1a2e,#16213e);color:white;padding:13px 12px;text-align:left;font-weight:600;font-size:13px}
  th:first-child{border-radius:8px 0 0 0}th:last-child{border-radius:0 8px 0 0}
  td{padding:13px 12px;border-bottom:1px solid #eee;font-size:14px}
  tr:hover td{background:#f8f9fa}
  .rank-badge{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;font-weight:bold;font-size:12px}
  .rank-1{background:linear-gradient(135deg,#ffd700,#ffb700);color:#333}
  .rank-2{background:linear-gradient(135deg,#c0c0c0,#a0a0a0);color:#333}
  .rank-3{background:linear-gradient(135deg,#cd7f32,#b87333);color:white}
  .rank-other{background:#e9ecef;color:#666}
  .score-bar{height:7px;background:#e9ecef;border-radius:4px;overflow:hidden;width:80px;display:inline-block;vertical-align:middle;margin-right:6px}
  .score-bar-fill{height:100%;border-radius:4px}
  .score-bar-fill.good{background:linear-gradient(90deg,#28a745,#20c997)}
  .footer{text-align:center;padding:20px;color:rgba(255,255,255,.7);font-size:12px}
  *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
  @media print{body{background:white!important;padding:10px!important}.section{break-inside:avoid}.header{break-inside:avoid}.print-btn{display:none!important}}
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>◆ Claude Reporter — Báo Cáo Cá Nhân</h1>
    <div class="subtitle">Kỳ báo cáo: ${from} → ${to} | Xuất lúc ${new Date().toLocaleString("vi-VN")}</div>
    <div class="header-stats">
      <div class="header-stat"><span>Sessions</span><strong>${data.totalSessions}</strong></div>
      <div class="header-stat"><span>Tổng Tokens</span><strong>${fmt(data.totalTokens)}</strong></div>
      <div class="header-stat"><span>Events</span><strong>${fmt(data.totalEvents)}</strong></div>
      <div class="header-stat"><span>Projects</span><strong>${data.projects.length}</strong></div>
    </div>
  </div>

  <div class="grid-4">
    <div class="card">
      <div class="card-title">Tổng Sessions</div>
      <div class="card-value">${data.totalSessions}</div>
      <div class="card-subtitle">Trong kỳ báo cáo</div>
    </div>
    <div class="card">
      <div class="card-title">Tổng Tokens</div>
      <div class="card-value">${fmt(data.totalTokens)}</div>
      <div class="card-subtitle">Input + Output + Cache</div>
    </div>
    <div class="card">
      <div class="card-title">Tổng Events</div>
      <div class="card-value">${fmt(data.totalEvents)}</div>
      <div class="card-subtitle">Tool calls + messages</div>
    </div>
    <div class="card">
      <div class="card-title">Dự Án</div>
      <div class="card-value">${data.projects.length}</div>
      <div class="card-subtitle">Project đã làm việc</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">📁 Danh Sách Dự Án</div>
    <div style="overflow-x:auto">
      <table>
        <thead><tr>
          <th style="width:40px">#</th>
          <th>Dự Án</th>
          <th style="text-align:right">Sessions</th>
          <th style="text-align:right">Events</th>
          <th style="text-align:right">Tokens</th>
          <th>Users</th>
          <th style="text-align:right">Hoạt động cuối</th>
        </tr></thead>
        <tbody>${projectRows}</tbody>
      </table>
    </div>
  </div>

  <div class="footer">
    <strong>Claude Reporter — Báo Cáo Cá Nhân</strong><br>
    Ngày tạo: ${new Date().toLocaleString("vi-VN")} | Kỳ báo cáo: ${from} → ${to}
  </div>
</div>
</body></html>`;

  downloadBlob(new Blob([html], { type: "text/html" }), `claude-personal-report-${from}-${to}.html`);
}

// ─── Team report HTML export — dựa theo dashboard_template ────────────────────

function exportTeamHTML(data: TeamReportData, from: string, to: string) {
  const avgEfficiency = data.members.length > 0
    ? Math.round(data.members.reduce((s, m) => s + m.promptEfficiency, 0) / data.members.length)
    : 0;
  const topPerformer = data.members.length > 0
    ? data.members.reduce((best, m) => m.promptEfficiency > best.promptEfficiency ? m : best, data.members[0])
    : null;
  const avgRepetition = data.members.length > 0
    ? Math.round(data.members.reduce((s, m) => s + (100 - m.promptEfficiency), 0) / data.members.length)
    : 0;

  const effColor = (v: number) => v >= 80 ? "#28a745" : v >= 60 ? "#fd7e14" : "#dc3545";
  const effClass = (v: number) => v >= 80 ? "good" : v >= 60 ? "warning" : "danger";
  const rankBadge = (i: number) => i === 0 ? "rank-1" : i === 1 ? "rank-2" : i === 2 ? "rank-3" : "rank-other";

  const memberRows = data.members.map((m, i) => {
    const eff = m.promptEfficiency;
    return `<tr>
      <td><span class="rank-badge ${rankBadge(i)}">${i + 1}</span></td>
      <td>
        <div class="member-name">${escapeHtml(m.email)}</div>
        <div style="font-size:12px;color:#888">${m.activeDays} ngày hoạt động</div>
      </td>
      <td style="text-align:right">${m.totalPrompts.toLocaleString()}<br><small style="color:#888">${m.meaningfulPrompts} meaningful</small></td>
      <td>${fmt(m.totalTokens)}</td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="progress-bar"><div class="progress-fill ${effClass(eff)}" style="width:${eff}%"></div></div>
          <strong style="color:${effColor(eff)}">${eff}%</strong>
        </div>
        <div style="font-size:11px;color:#aaa;font-family:monospace">= 100 - (rep×0.4) - (code×0.3) - (vague×0.3)</div>
      </td>
      <td style="text-align:center">${m.sessionDepth}</td>
      <td style="text-align:center;color:#22c55e">${m.cacheHitRate}%</td>
      <td><span class="status-badge ${effClass(eff)}">${eff >= 80 ? "TỐT" : eff >= 60 ? "TRUNG BÌNH" : "CẦN CẢI THIỆN"}</span></td>
    </tr>`;
  }).join("");

  const memberDetails = data.members.map((m, idx) => {
    const projectSections = m.projects.map((p) => {
      const weekItems = p.weeks.map((w) => `
        <div style="margin-bottom:12px">
          <div style="font-size:12px;font-weight:600;color:#fd7e14;margin-bottom:6px">
            📅 Tuần ${w.week} — ${w.count} prompts${w.noiseCount > 0 ? ` + ${w.noiseCount} system` : ""}
          </div>
          <ol style="margin:0;padding-left:20px">
            ${w.prompts.map((q) => `<li style="font-size:13px;color:#555;padding:2px 0;line-height:1.5;border-bottom:1px solid #f0f0f0">${escapeHtml(q)}</li>`).join("")}
          </ol>
        </div>`).join("");
      return `
        <div style="border-left:3px solid #1e3c72;padding-left:12px;margin-bottom:16px">
          <div style="font-weight:600;font-size:14px;margin-bottom:4px">📂 ${escapeHtml(p.name)}</div>
          <div style="font-size:12px;color:#888;margin-bottom:8px">${p.sessions} sessions · ${p.totalPrompts} prompts (${p.meaningfulPrompts} meaningful)</div>
          ${weekItems}
        </div>`;
    }).join("");
    return `
    <button class="collapsible" onclick="toggleCollapsible(this)">
      <span><span class="rank-badge ${rankBadge(idx)}" style="margin-right:8px">${idx + 1}</span>${escapeHtml(m.email)} — ${m.totalPrompts} prompts · Efficiency ${m.promptEfficiency}%</span>
      <span>▼</span>
    </button>
    <div class="collapsible-content">
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
        ${[
          ["Tokens/Prompt", fmt(m.tokensPerPrompt), "#06b6d4"],
          ["Session Depth", String(m.sessionDepth), "#a78bfa"],
          ["Cache Hit", m.cacheHitRate + "%", "#22c55e"],
          ["Active Days", String(m.activeDays), "#888"],
        ].map(([l, v, c]) => `<div style="background:#f8f9fa;border:1px solid #eee;border-radius:6px;padding:4px 12px;font-size:12px;color:#666">${l}: <strong style="color:${c}">${v}</strong></div>`).join("")}
      </div>
      ${projectSections || "<p style='color:#aaa;font-size:13px'>Chưa có dữ liệu project.</p>"}
    </div>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Dashboard Phân Tích Hiệu Quả Prompt — ${from} → ${to}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background:linear-gradient(135deg,#1e3c72 0%,#2a5298 100%);min-height:100vh;padding:20px;color:#333}
  .container{max-width:1400px;margin:0 auto}
  .header{background:linear-gradient(135deg,#1e3c72 0%,#2a5298 100%);color:white;padding:35px;border-radius:16px;margin-bottom:22px;box-shadow:0 10px 40px rgba(0,0,0,0.3)}
  .header h1{font-size:26px;margin-bottom:8px}
  .header-sub{font-size:14px;opacity:.85}
  .header-stats{display:flex;gap:24px;margin-top:18px;flex-wrap:wrap}
  .header-stat{background:rgba(255,255,255,0.15);padding:12px 22px;border-radius:10px;text-align:center}
  .header-stat span{font-size:13px;opacity:.9;display:block}
  .header-stat strong{display:block;font-size:22px;margin-top:4px}
  .cards-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:18px;margin-bottom:22px}
  .card{background:white;border-radius:12px;padding:22px;box-shadow:0 4px 15px rgba(0,0,0,0.1)}
  .card-title{font-size:13px;color:#666;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px}
  .card-value{font-size:30px;font-weight:bold;color:#1e3c72}
  .card-value.good{color:#28a745}.card-value.warning{color:#ffc107}.card-value.danger{color:#dc3545}
  .card-subtitle{font-size:12px;color:#888;margin-top:5px}
  .section{background:white;border-radius:12px;padding:25px;margin-bottom:22px;box-shadow:0 4px 15px rgba(0,0,0,0.1)}
  .section-title{font-size:17px;font-weight:bold;color:#1e3c72;margin-bottom:18px;padding-bottom:10px;border-bottom:2px solid #eee}
  .formula-box{background:linear-gradient(135deg,#f8f9fa,#e9ecef);border:2px solid #1e3c72;border-radius:10px;padding:20px;margin-bottom:22px}
  .formula-box h3{color:#1e3c72;margin-bottom:12px;font-size:15px}
  .formula-box code{display:block;background:#1e3c72;color:#fff;padding:14px;border-radius:7px;font-size:13px;margin-bottom:12px;font-family:'Courier New',monospace}
  .formula-box ul{margin-left:20px;color:#555}.formula-box li{margin:7px 0;font-size:13px}
  .metrics-chart{display:flex;flex-direction:column;gap:14px}
  .metric-bar{display:flex;align-items:center;gap:14px}
  .metric-label{width:160px;font-size:13px;font-weight:500}
  .metric-bar-container{flex:1;height:28px;background:#e9ecef;border-radius:14px;overflow:hidden}
  .metric-bar-fill{height:100%;border-radius:14px;display:flex;align-items:center;justify-content:flex-end;padding-right:10px;color:white;font-weight:bold;font-size:12px}
  .metric-bar-fill.green{background:linear-gradient(90deg,#28a745,#1e7e34)}
  .metric-bar-fill.orange{background:linear-gradient(90deg,#fd7e14,#e8590c)}
  .metric-bar-fill.red{background:linear-gradient(90deg,#dc3545,#c82333)}
  .metric-value{width:55px;text-align:right;font-weight:bold}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{background:linear-gradient(135deg,#1e3c72 0%,#2a5298 100%);color:white;padding:12px 10px;text-align:left;font-weight:600}
  th:first-child{border-radius:7px 0 0 0}th:last-child{border-radius:0 7px 0 0}
  td{padding:12px 10px;border-bottom:1px solid #eee}
  tr:hover td{background:#f8f9fa}
  .rank-badge{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;font-weight:bold;font-size:12px}
  .rank-1{background:linear-gradient(135deg,#ffd700,#ffb700);color:#333}
  .rank-2{background:linear-gradient(135deg,#c0c0c0,#a0a0a0);color:#333}
  .rank-3{background:linear-gradient(135deg,#cd7f32,#b87333);color:white}
  .rank-other{background:#e9ecef;color:#666}
  .member-name{font-weight:600;color:#1e3c72}
  .progress-bar{width:80px;height:7px;background:#e9ecef;border-radius:4px;overflow:hidden;display:inline-block;vertical-align:middle;margin-right:6px}
  .progress-fill{height:100%;border-radius:4px}
  .progress-fill.good{background:#28a745}.progress-fill.warning{background:#ffc107}.progress-fill.danger{background:#dc3545}
  .status-badge{display:inline-block;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600}
  .status-badge.good{background:#d4edda;color:#155724}.status-badge.warning{background:#fff3cd;color:#856404}.status-badge.danger{background:#f8d7da;color:#721c24}
  .collapsible{cursor:pointer;padding:14px;background:#f8f9fa;border:none;width:100%;text-align:left;font-size:14px;font-weight:600;border-radius:8px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center}
  .collapsible:hover{background:#e9ecef}
  .collapsible-content{display:none;padding:16px;background:#fff;border:1px solid #eee;border-radius:8px;margin-bottom:14px}
  .collapsible-content.active{display:block}
  .footer{text-align:center;padding:20px;color:rgba(255,255,255,.75);font-size:13px}
  *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
  @media print{body{background:white!important;padding:10px!important}.section{break-inside:avoid}.header{break-inside:avoid}.collapsible-content{display:block!important}.print-btn{display:none!important}}
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>📊 Dashboard Phân Tích Hiệu Quả Prompt</h1>
    <div class="header-sub">Kỳ báo cáo: ${from} → ${to} | Xuất lúc ${new Date().toLocaleString("vi-VN")}</div>
    <div class="header-stats">
      <div class="header-stat"><span>Thành Viên</span><strong>${data.totalMembers}</strong></div>
      <div class="header-stat"><span>Tổng Prompts</span><strong>${data.totalPrompts.toLocaleString()}</strong></div>
      <div class="header-stat"><span>Sessions</span><strong>${data.totalSessions.toLocaleString()}</strong></div>
      <div class="header-stat"><span>Tổng Tokens</span><strong>${fmt(data.totalTokens)}</strong></div>
      <div class="header-stat"><span>Điểm TB</span><strong>${avgEfficiency}/100</strong></div>
    </div>
  </div>

  <div class="cards-grid">
    <div class="card">
      <div class="card-title">Tổng Prompts</div>
      <div class="card-value">${data.totalPrompts.toLocaleString()}</div>
      <div class="card-subtitle">Trong kỳ báo cáo</div>
    </div>
    <div class="card">
      <div class="card-title">Điểm Hiệu Quả Trung Bình</div>
      <div class="card-value ${effClass(avgEfficiency)}">${avgEfficiency}</div>
      <div class="card-subtitle">Trung bình toàn nhóm</div>
    </div>
    <div class="card">
      <div class="card-title">Thành viên</div>
      <div class="card-value">${data.totalMembers}</div>
      <div class="card-subtitle">Đang theo dõi</div>
    </div>
    ${topPerformer ? `<div class="card">
      <div class="card-title">Top Performer</div>
      <div class="card-value good" style="font-size:18px">${escapeHtml(topPerformer.email.split("@")[0])}</div>
      <div class="card-subtitle">Điểm hiệu quả: ${topPerformer.promptEfficiency}%</div>
    </div>` : ""}
  </div>

  <div class="formula-box">
    <h3>📐 Công Thức Tính Điểm Hiệu Quả</h3>
    <code>Efficiency Score = Meaningful Prompts / Total Prompts × 100</code>
    <ul>
      <li><strong>Meaningful Prompts</strong>: Các prompt có nội dung rõ ràng, không phải system noise</li>
      <li><strong>Tiêu chí đánh giá</strong>: ≥80: TỐT | 60-79: TRUNG BÌNH | &lt;60: CẦN CẢI THIỆN</li>
      <li><strong>Session Depth</strong>: Số lượng events trung bình mỗi session</li>
      <li><strong>Cache Hit Rate</strong>: Tỷ lệ tokens đọc từ cache / tổng tokens</li>
    </ul>
  </div>

  <div class="section">
    <div class="section-title">📈 Chỉ Số Hiệu Quả Trung Bình</div>
    <div class="metrics-chart">
      <div class="metric-bar">
        <div class="metric-label">Prompt Efficiency TB</div>
        <div class="metric-bar-container"><div class="metric-bar-fill ${avgEfficiency >= 80 ? "green" : avgEfficiency >= 60 ? "orange" : "red"}" style="width:${Math.min(avgEfficiency, 100)}%">${avgEfficiency}%</div></div>
        <div class="metric-value" style="color:${effColor(avgEfficiency)}">${avgEfficiency}%</div>
      </div>
      <div class="metric-bar">
        <div class="metric-label">Avg Cache Hit Rate</div>
        <div class="metric-bar-container">
          ${(() => { const v = data.members.length > 0 ? Math.round(data.members.reduce((s,m) => s + m.cacheHitRate, 0) / data.members.length) : 0; return `<div class="metric-bar-fill ${v >= 30 ? "green" : "orange"}" style="width:${Math.min(v,100)}%">${v}%</div>`; })()}
        </div>
        <div class="metric-value" style="color:#22c55e">${data.members.length > 0 ? Math.round(data.members.reduce((s,m) => s + m.cacheHitRate, 0) / data.members.length) : 0}%</div>
      </div>
      <div class="metric-bar">
        <div class="metric-label">Avg Session Depth</div>
        <div class="metric-bar-container">
          ${(() => { const v = data.members.length > 0 ? Math.round(data.members.reduce((s,m) => s + m.sessionDepth, 0) / data.members.length) : 0; const pct = Math.min((v / 20) * 100, 100); return `<div class="metric-bar-fill ${pct >= 50 ? "green" : "orange"}" style="width:${pct}%">${v}</div>`; })()}
        </div>
        <div class="metric-value" style="color:#a78bfa">${data.members.length > 0 ? Math.round(data.members.reduce((s,m) => s + m.sessionDepth, 0) / data.members.length) : 0}</div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">👥 Bảng Xếp Hạng Thành Viên</div>
    <div style="overflow-x:auto">
      <table>
        <thead><tr>
          <th style="width:40px">#</th>
          <th>Thành Viên</th>
          <th style="text-align:right">Prompts</th>
          <th>Tokens</th>
          <th>Hiệu Quả</th>
          <th style="text-align:center">Depth</th>
          <th style="text-align:center">Cache Hit</th>
          <th>Trạng Thái</th>
        </tr></thead>
        <tbody>${memberRows}</tbody>
      </table>
    </div>
  </div>

  <div class="section">
    <div class="section-title">🔍 Chi Tiết Theo Thành Viên</div>
    ${memberDetails}
  </div>

  <div class="footer">
    <strong>Dashboard Phân Tích Hiệu Quả Prompt</strong><br>
    Ngày tạo: ${new Date().toLocaleString("vi-VN")} | Kỳ báo cáo: ${from} → ${to}<br>
    <span style="font-size:11px;opacity:.7">TỐT ≥80 | TRUNG BÌNH 60-79 | CẦN CẢI THIỆN &lt;60</span>
  </div>
</div>
<script>
function toggleCollapsible(el){
  const c=el.nextElementSibling;
  const a=el.querySelector('span:last-child');
  if(c.classList.contains('active')){c.classList.remove('active');a.textContent='▼';}
  else{c.classList.add('active');a.textContent='▲';}
}
</script>
</body></html>`;

  downloadBlob(new Blob([html], { type: "text/html" }), `claude-team-report-${from}-${to}.html`);
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
      if (!res.ok) { setStatus("error"); return; }
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
  const [pqData, setPqData] = useState<PQData | null>(null);
  const tick = useAutoRefresh(60_000);

  async function generate() {
    setStatus("loading");
    try {
      const qs = new URLSearchParams({ from, to });
      const [teamRes, pqRes] = await Promise.all([
        fetch(`/api/report/team?${qs}`),
        fetch(`/api/report/prompt-quality?${qs}`),
      ]);
      if (!teamRes.ok) { setStatus("error"); return; }
      const data: TeamReportData = await teamRes.json();
      setReport(data);
      if (pqRes.ok) {
        const pq: PQData = await pqRes.json();
        setPqData(pq);
      }
      setStatus("done");
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

          {/* ── Prompt Quality Section ── */}
          {pqData && (
            <div style={{ marginTop: "1.75rem" }}>
              <div style={{ fontWeight: 700, fontSize: "1rem", marginBottom: "1rem", borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem" }}>
                📊 Chất Lượng Prompt
              </div>

              {/* PQ overview cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: "0.75rem", marginBottom: "1.25rem" }}>
                <div className="card" style={{ padding: "0.75rem 1rem" }}>
                  <div style={{ color: "var(--text-muted)", fontSize: "0.68rem" }}>Điểm Hiệu Quả TB</div>
                  <div style={{ color: scoreColor(pqData.avgEfficiencyScore), fontSize: "1.4rem", fontWeight: 700, lineHeight: 1.2 }}>{pqData.avgEfficiencyScore}</div>
                  <div style={{ fontSize: "0.62rem", color: "var(--text-muted)" }}>Trung bình toàn team</div>
                </div>
                <div className="card" style={{ padding: "0.75rem 1rem" }}>
                  <div style={{ color: "var(--text-muted)", fontSize: "0.68rem" }}>Prompts Có Vấn Đề</div>
                  <div style={{ color: "#fb923c", fontSize: "1.4rem", fontWeight: 700, lineHeight: 1.2 }}>{pqData.problematicPct}%</div>
                  <div style={{ fontSize: "0.62rem", color: "var(--text-muted)" }}>{pqData.problematicCount} prompts cần cải thiện</div>
                </div>
                <div className="card" style={{ padding: "0.75rem 1rem" }}>
                  <div style={{ color: "var(--text-muted)", fontSize: "0.68rem" }}>Top Performer</div>
                  <div style={{ color: "#4ade80", fontSize: "1.1rem", fontWeight: 700, lineHeight: 1.4 }}>{pqData.topPerformer?.email.split("@")[0] ?? "—"}</div>
                  <div style={{ fontSize: "0.62rem", color: "var(--text-muted)" }}>Điểm: {pqData.topPerformer?.efficiencyScore ?? 0}</div>
                </div>
              </div>

              {/* Issue rates */}
              <div className="card" style={{ marginBottom: "1.25rem" }}>
                <div style={{ fontWeight: 700, fontSize: "0.88rem", marginBottom: "0.75rem" }}>📈 Tỉ Lệ Các Vấn Đề Chính</div>
                <IssueBar label="Tỉ Lệ Lặp Lại" pct={pqData.issueRates.repetition} warn={20} />
                <IssueBar label="Code Dump Rate" pct={pqData.issueRates.codeDump} warn={15} />
                <IssueBar label="Tỉ Lệ Mơ Hồ" pct={pqData.issueRates.vague} warn={10} />
                <IssueBar label="Tổng Có Vấn Đề" pct={pqData.issueRates.total} warn={18} />
                <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: "0.5rem" }}>
                  ⚠ Ngưỡng cảnh báo: Lặp lại &gt;20% · Code Dump &gt;15% · Mơ hồ &gt;10%
                </div>
              </div>

              {/* Weekly trend */}
              {pqData.weeklyTrend.length > 0 && (() => {
                const firstScore = pqData.weeklyTrend[0]?.score ?? 0;
                const lastScore = pqData.weeklyTrend[pqData.weeklyTrend.length - 1]?.score ?? 0;
                const scoreDiff = Math.round((lastScore - firstScore) * 10) / 10;
                return (
                  <div className="card">
                    <div style={{ fontWeight: 700, fontSize: "0.88rem", marginBottom: "0.75rem" }}>📈 Phân Tích Xu Hướng Theo Tuần</div>

                    {/* Mini chart */}
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, marginBottom: "1rem", height: 64 }}>
                      {pqData.weeklyTrend.map((w) => (
                        <div key={w.week} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                          <div style={{ fontSize: "0.6rem", color: scoreColor(w.score), fontWeight: 700 }}>{w.score}</div>
                          <div style={{ width: "100%", background: scoreColor(w.score), borderRadius: "3px 3px 0 0", height: `${Math.max(8, (w.score / 100) * 48)}px`, opacity: 0.85 }} />
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
                              <th key={h} style={{ textAlign: "left", padding: "6px 10px", color: "var(--text-muted)", borderBottom: "1px solid var(--border)", fontWeight: 600, fontSize: "0.7rem", background: "var(--surface)" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {pqData.weeklyTrend.map((w) => (
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
                    {pqData.weeklyTrend.length > 1 && (
                      <div style={{ marginTop: "0.75rem", padding: "0.75rem", background: scoreDiff >= 0 ? "rgba(74,222,128,0.06)" : "rgba(248,113,113,0.06)", borderRadius: 8, fontSize: "0.78rem" }}>
                        <strong>Tuần đầu → Tuần cuối:</strong> Score từ <strong style={{ color: scoreColor(firstScore) }}>{firstScore}</strong> → <strong style={{ color: scoreColor(lastScore) }}>{lastScore}</strong>
                        <span style={{ color: scoreDiff >= 0 ? "#4ade80" : "#f87171", marginLeft: 8 }}>({scoreDiff >= 0 ? "+" : ""}{scoreDiff} điểm, {scoreDiff >= 0 ? "+" : ""}{Math.round((scoreDiff / (firstScore || 1)) * 100)}%)</span>
                        <div style={{ marginTop: 4, color: "var(--text-muted)" }}>
                          {scoreDiff >= 0 ? "📈 Xu hướng tích cực — chất lượng prompt cải thiện qua các tuần" : "📉 Xu hướng giảm — cần chú ý cải thiện chất lượng prompt"}
                        </div>
                      </div>
                    )}

                    {/* Top 3 improvers */}
                    {pqData.members.length >= 2 && (() => {
                      const sorted = [...pqData.members].filter((m) => m.weeklyScores.length >= 2)
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
                );
              })()}
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
      if (!res.ok) { setStatus("error"); return; }
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
  const [userRole, setUserRole] = useState<string>("member");

  useEffect(() => {
    const role = localStorage.getItem("claude-reporter-role") ?? "member";
    setUserRole(role);
  }, []);

  const canSeeTeamReport = userRole === "admin" || userRole === "dept_head";
  const [tab, setTab] = useState<"project" | "team" | "quality">("project");

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
        <button style={tabStyle(tab === "project")} onClick={() => setTab("project")}>
          📁 Báo cáo cá nhân
        </button>
        {canSeeTeamReport && (
          <button style={tabStyle(tab === "team")} onClick={() => setTab("team")}>
            👥 Báo cáo phòng ban
          </button>
        )}
        {canSeeTeamReport && (
          <button style={tabStyle(tab === "quality")} onClick={() => setTab("quality")}>
            📊 Chất lượng Prompt
          </button>
        )}
      </div>

      {tab === "project" && <ProjectReportView from={from} to={to} />}
      {tab === "team" && canSeeTeamReport && <TeamReportView from={from} to={to} />}
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
