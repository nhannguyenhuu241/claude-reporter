"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SessionList } from "@/components/SessionList";

interface AdminUser {
  id: string;
  email: string;
  createdAt: string;
  role: string;
  department: { id: string; name: string } | null;
  totalSessions: number;
  activeSessions: number;
  totalEvents: number;
  totalTokens: number;
  estimatedCostUsd: number;
  projects: string[];
  lastActiveAt: string | null;
}

interface AdminProject {
  name: string;
  path: string;
  sessions: number;
  events: number;
  totalTokens: number;
  estimatedCostUsd: number;
  users: string[];
  lastActivity: string;
}

interface AdminDepartment {
  id: string;
  name: string;
  createdAt: string;
  userCount: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function relTime(iso: string | null) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

type Tab = "departments" | "users" | "projects" | "sessions" | "system";

interface QueueHealth {
  queue: { waiting: number; active: number; completed: number; failed: number; delayed: number; ok: boolean };
  failedJobs: Array<{ id: string; failedReason: string; timestamp: number; attemptsMade: number; eventCount: number }>;
  redis: { ok: boolean; usedMemory: string; maxMemory: string; connectedClients: number; evictionPolicy: string };
  db: { ok: boolean; latencyMs: number };
  ingestionRate: Array<{ minute: string; count: number }>;
  eventsLast5m: number;
  eventsLastHour: number;
  topUsers: Array<{ email: string; count: number }>;
  dedupHealth: { total: number; noUuid: number; ratio: number };
  timestamp: string;
}

export default function AdminPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [authError, setAuthError] = useState("");
  const [tab, setTab] = useState<Tab>("departments");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [projects, setProjects] = useState<AdminProject[]>([]);
  const [departments, setDepartments] = useState<AdminDepartment[]>([]);
  const [anonymousSessions, setAnonymousSessions] = useState(0);
  const [loading, setLoading] = useState(false);

  const [sysHealth, setSysHealth] = useState<QueueHealth | null>(null);
  const [sysLoading, setSysLoading] = useState(false);
  const [queueAction, setQueueAction] = useState("");

  const [newDeptName, setNewDeptName] = useState("");
  const [deptCreating, setDeptCreating] = useState(false);
  const [deptError, setDeptError] = useState("");
  const [editingDept, setEditingDept] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    // Try auto-login via existing cookie
    loadAll();
  }, []);

  // Auto-refresh system health every 10s when on system tab
  useEffect(() => {
    if (tab !== "system" || !authenticated) return;
    loadSysHealth();
    const id = setInterval(loadSysHealth, 10_000);
    return () => clearInterval(id);
  }, [tab, authenticated]);

  async function loadSysHealth() {
    setSysLoading(true);
    try {
      const res = await fetch("/api/admin/queue");
      if (res.ok) setSysHealth(await res.json());
    } catch { /* ignore */ }
    setSysLoading(false);
  }

  async function doQueueAction(action: string, jobId?: string) {
    setQueueAction(action);
    try {
      await fetch("/api/admin/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, jobId }),
      });
      await loadSysHealth();
    } catch { /* ignore */ }
    setQueueAction("");
  }

  async function loadAll() {
    setLoading(true);

    let usersRes: Response, projsRes: Response, deptsRes: Response;
    try {
      [usersRes, projsRes, deptsRes] = await Promise.all([
        fetch("/api/admin/users"),
        fetch("/api/admin/projects"),
        fetch("/api/admin/departments"),
      ]);
    } catch {
      setLoading(false);
      return;
    }

    if (usersRes.status === 401 || projsRes.status === 401 || deptsRes.status === 401) {
      setAuthenticated(false);
      setAuthError("");
      setLoading(false);
      return;
    }

    try {
      const [ud, pd, dd] = await Promise.all([usersRes.json(), projsRes.json(), deptsRes.json()]);
      setUsers(ud.users ?? []);
      setProjects(pd.projects ?? []);
      setDepartments(dd.departments ?? []);
      setAnonymousSessions(ud.anonymousSessions ?? 0);
      setAuthenticated(true);
      localStorage.setItem("_cr_admin", "1");
    } catch {
      setAuthError("Lỗi khi tải dữ liệu");
    }
    setLoading(false);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError("");
    setLoading(true);
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const d = await res.json();
      setAuthError(d.error ?? "Đăng nhập thất bại");
      setLoading(false);
      return;
    }
    localStorage.setItem("_cr_admin", "1");
    await loadAll();
  }

  async function logout() {
    await fetch("/api/admin/login", { method: "DELETE" });
    localStorage.removeItem("_cr_admin");
    setAuthenticated(false);
    setEmail("");
    setPassword("");
    setUsers([]);
    setProjects([]);
    setDepartments([]);
    setAnonymousSessions(0);
  }

  async function handleCreateDept(e: React.FormEvent) {
    e.preventDefault();
    if (!newDeptName.trim()) return;
    setDeptCreating(true);
    setDeptError("");
    const res = await fetch("/api/admin/departments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newDeptName.trim() }),
    });
    setDeptCreating(false);
    if (res.ok) {
      setNewDeptName("");
      await loadAll();
    } else {
      const d = await res.json();
      setDeptError(d.error ?? "Lỗi khi tạo phòng ban");
    }
  }

  async function handleRenameDept(id: string, name: string) {
    const res = await fetch(`/api/admin/departments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setEditingDept(null);
    if (res.ok) await loadAll();
  }

  async function handleDeleteDept(id: string, name: string) {
    if (!confirm(`Xóa phòng ban "${name}"? Users sẽ không còn thuộc phòng ban này.`)) return;
    const res = await fetch(`/api/admin/departments/${id}`, { method: "DELETE" });
    if (res.ok) await loadAll();
  }

  const totalTokens = users.reduce((s, u) => s + u.totalTokens, 0);
  const totalCost = users.reduce((s, u) => s + u.estimatedCostUsd, 0);

  async function handleAssignDept(userId: string, departmentId: string | null) {
    await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ departmentId }),
    });
    await loadAll();
  }

  async function handleToggleRole(userId: string, currentRole: string) {
    const newRole = currentRole === "dept_head" ? "member" : "dept_head";
    await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    await loadAll();
  }

  async function handleReset(scope: "sessions" | "all") {
    const label = scope === "all" ? "toàn bộ dữ liệu (users + sessions + events)" : "sessions + events";
    if (!confirm(`Xác nhận xóa ${label}?`)) return;
    const res = await fetch("/api/admin/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope }),
    });
    if (res.ok) {
      alert("Đã xóa thành công. Tải lại trang.");
      await loadAll();
    } else {
      alert("Lỗi khi xóa.");
    }
  }

  // ── Login gate ──────────────────────────────
  if (!authenticated) {
    return (
      <div style={{ maxWidth: 400, margin: "6rem auto" }}>
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: "1.1rem", marginBottom: 4 }}>Admin</div>
          <div style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginBottom: "1.25rem" }}>
            Đăng nhập để truy cập trang quản trị.
          </div>
          <form onSubmit={handleLogin}>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setAuthError(""); }}
              required
              style={{
                width: "100%",
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "0.5rem 0.75rem",
                color: "var(--text)",
                fontSize: "0.85rem",
                marginBottom: "0.6rem",
                boxSizing: "border-box",
                outline: "none",
              }}
            />
            <input
              type="password"
              placeholder="Mật khẩu"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setAuthError(""); }}
              required
              style={{
                width: "100%",
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "0.5rem 0.75rem",
                color: "var(--text)",
                fontSize: "0.85rem",
                marginBottom: "0.75rem",
                boxSizing: "border-box",
                outline: "none",
              }}
            />
            {authError && (
              <div style={{ color: "var(--red, #ef4444)", fontSize: "0.8rem", marginBottom: "0.5rem" }}>
                {authError}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                background: "var(--accent)",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                padding: "0.5rem",
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "Đang đăng nhập…" : "Đăng nhập"}
            </button>
          </form>
          <div style={{ marginTop: "1rem", textAlign: "center" }}>
            <Link href="/login" style={{ color: "var(--text-muted)", fontSize: "0.8rem", textDecoration: "none" }}>
              ← Member login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Admin dashboard ──────────────────────────
  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: "1.5rem", gap: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0 }}>Admin Dashboard</h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.78rem", margin: "2px 0 0" }}>
            {departments.length} phòng ban · {users.length} nhân viên · {projects.length} projects
          </p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <button
            onClick={() => handleReset("sessions")}
            style={{
              background: "none",
              border: "1px solid #f97316",
              borderRadius: 5,
              color: "#f97316",
              fontSize: "0.78rem",
              cursor: "pointer",
              padding: "4px 10px",
            }}
            title="Xóa toàn bộ sessions + events, giữ lại danh sách users"
          >
            Reset Sessions
          </button>
          <button
            onClick={() => handleReset("all")}
            style={{
              background: "none",
              border: "1px solid var(--red, #ef4444)",
              borderRadius: 5,
              color: "var(--red, #ef4444)",
              fontSize: "0.78rem",
              cursor: "pointer",
              padding: "4px 10px",
            }}
            title="Xóa toàn bộ: users + sessions + events"
          >
            Reset All
          </button>
          <button
            onClick={logout}
            style={{
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: 5,
              color: "var(--text-muted)",
              fontSize: "0.78rem",
              cursor: "pointer",
              padding: "4px 10px",
            }}
          >
            Logout
          </button>
        </div>
      </div>

      {/* Global stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: "0.75rem",
          marginBottom: "1.5rem",
        }}
      >
        {[
          { label: "Phòng ban", value: departments.length, color: "#a78bfa" },
          { label: "Nhân viên đã đăng ký", value: users.length, color: "var(--accent)" },
          { label: "Sessions (đã link)", value: users.reduce((s, u) => s + u.totalSessions, 0), color: "var(--green)" },
          { label: "Sessions (ẩn danh)", value: anonymousSessions, color: "var(--text-muted)", note: "chưa link UUID" },
          { label: "Total Tokens", value: fmt(totalTokens), color: "var(--yellow)" },
          { label: "Projects", value: projects.length, color: "#34d399" },
        ].map((c) => (
          <div key={c.label} className="card" style={{ padding: "0.75rem 1rem" }}>
            <div style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}>{c.label}</div>
            <div style={{ color: c.color, fontSize: "1.5rem", fontWeight: 700, lineHeight: 1.2 }}>{c.value}</div>
            {"note" in c && c.note && (
              <div style={{ color: "var(--text-muted)", fontSize: "0.65rem", marginTop: 2 }}>{c.note}</div>
            )}
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "0.4rem", marginBottom: "1rem" }}>
        {([
          { key: "departments", label: `🏢 Phòng ban (${departments.length})` },
          { key: "users", label: `👤 Users (${users.length})` },
          { key: "projects", label: `📁 Projects (${projects.length})` },
          { key: "sessions", label: "🗂 Sessions" },
          { key: "system", label: sysHealth?.queue.failed ? `⚠️ System (${sysHealth.queue.failed} lỗi)` : "⚙️ System" },
        ] as { key: Tab; label: string }[]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              background: tab === key ? "var(--accent)" : key === "system" && sysHealth?.queue.failed ? "rgba(239,68,68,0.12)" : "var(--surface)",
              color: tab === key ? "#fff" : key === "system" && sysHealth?.queue.failed ? "#ef4444" : "var(--text-muted)",
              border: key === "system" && sysHealth?.queue.failed ? "1px solid #ef4444" : "1px solid var(--border)",
              borderRadius: 5,
              padding: "4px 14px",
              fontSize: "0.8rem",
              fontWeight: tab === key ? 600 : 400,
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Departments tab */}
      {tab === "departments" && (
        <div>
          <div className="card" style={{ marginBottom: "1rem", padding: "1rem" }}>
            <div style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: "0.75rem" }}>
              Tạo phòng ban mới
            </div>
            <form onSubmit={handleCreateDept} style={{ display: "flex", gap: "0.5rem" }}>
              <input
                type="text"
                value={newDeptName}
                onChange={(e) => { setNewDeptName(e.target.value); setDeptError(""); }}
                placeholder="Tên phòng ban (vd: Engineering, Marketing…)"
                disabled={deptCreating}
                style={{
                  flex: 1,
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  padding: "0.45rem 0.75rem",
                  color: "var(--text)",
                  fontSize: "0.85rem",
                  outline: "none",
                }}
              />
              <button
                type="submit"
                disabled={deptCreating || !newDeptName.trim()}
                style={{
                  background: "var(--accent)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  padding: "0.45rem 1rem",
                  fontWeight: 600,
                  fontSize: "0.82rem",
                  cursor: "pointer",
                  opacity: deptCreating || !newDeptName.trim() ? 0.5 : 1,
                }}
              >
                {deptCreating ? "Đang tạo…" : "+ Tạo"}
              </button>
            </form>
            {deptError && (
              <div style={{ color: "var(--red)", fontSize: "0.75rem", marginTop: "0.4rem" }}>{deptError}</div>
            )}
          </div>

          <div className="card">
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                <thead>
                  <tr style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>Phòng ban</th>
                    <th style={{ textAlign: "right", padding: "6px 8px" }}>Thành viên</th>
                    <th style={{ textAlign: "right", padding: "6px 8px" }}>Tokens</th>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>Users</th>
                    <th style={{ textAlign: "right", padding: "6px 8px" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {departments.map((d) => {
                    const deptUsers = users.filter((u) => u.department?.id === d.id);
                    return (
                      <tr key={d.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "7px 8px" }}>
                          {editingDept?.id === d.id ? (
                            <form
                              onSubmit={(e) => { e.preventDefault(); handleRenameDept(d.id, editingDept.name); }}
                              style={{ display: "flex", gap: "0.4rem" }}
                            >
                              <input
                                autoFocus
                                value={editingDept.name}
                                onChange={(e) => setEditingDept({ ...editingDept, name: e.target.value })}
                                style={{
                                  background: "var(--bg)", border: "1px solid var(--accent)",
                                  borderRadius: 4, padding: "2px 6px", color: "var(--text)", fontSize: "0.8rem",
                                }}
                              />
                              <button type="submit" style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: 4, padding: "2px 8px", fontSize: "0.72rem", cursor: "pointer" }}>OK</button>
                              <button type="button" onClick={() => setEditingDept(null)} style={{ background: "none", border: "1px solid var(--border)", borderRadius: 4, padding: "2px 6px", fontSize: "0.72rem", color: "var(--text-muted)", cursor: "pointer" }}>Hủy</button>
                            </form>
                          ) : (
                            <div style={{ fontWeight: 500 }}>{d.name}</div>
                          )}
                        </td>
                        <td style={{ padding: "7px 8px", textAlign: "right", color: "var(--accent)", fontWeight: 600 }}>
                          {d.userCount}
                        </td>
                        <td style={{ padding: "7px 8px", textAlign: "right", color: "var(--yellow)" }}>
                          {fmt(d.totalTokens)}
                        </td>
                        <td style={{ padding: "7px 8px" }}>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                            {deptUsers.slice(0, 4).map((u) => (
                              <span key={u.id} style={{
                                background: "var(--surface)", border: "1px solid var(--border)",
                                borderRadius: 3, padding: "1px 5px", fontSize: "0.65rem", color: "var(--text-muted)",
                              }}>
                                {u.email.split("@")[0]}
                              </span>
                            ))}
                            {deptUsers.length > 4 && (
                              <span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>+{deptUsers.length - 4}</span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: "7px 8px", textAlign: "right" }}>
                          <div style={{ display: "flex", gap: "0.4rem", justifyContent: "flex-end" }}>
                            <button
                              onClick={() => setEditingDept({ id: d.id, name: d.name })}
                              style={{ background: "none", border: "1px solid var(--border)", borderRadius: 4, padding: "2px 8px", fontSize: "0.7rem", color: "var(--text-muted)", cursor: "pointer" }}
                            >
                              Đổi tên
                            </button>
                            <button
                              onClick={() => handleDeleteDept(d.id, d.name)}
                              style={{ background: "none", border: "1px solid var(--red, #ef4444)", borderRadius: 4, padding: "2px 8px", fontSize: "0.7rem", color: "var(--red, #ef4444)", cursor: "pointer" }}
                            >
                              Xóa
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {departments.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
                        Chưa có phòng ban nào. Tạo phòng ban đầu tiên ở trên.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Users table */}
      {tab === "users" && (
        <div className="card">
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
              <thead>
                <tr style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Email</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Phòng ban</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Vai trò</th>
                  <th style={{ textAlign: "right", padding: "6px 8px" }}>Sessions</th>
                  <th style={{ textAlign: "right", padding: "6px 8px" }}>Tokens</th>
                  <th style={{ textAlign: "right", padding: "6px 8px" }}>Last active</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "7px 8px" }}>
                      <div style={{ fontWeight: 500 }}>{u.email}</div>
                      <div style={{ color: "var(--text-muted)", fontFamily: "monospace", fontSize: "0.68rem" }}>
                        {u.id.slice(0, 12)}…
                      </div>
                    </td>
                    <td style={{ padding: "7px 8px" }}>
                      <select
                        value={u.department?.id ?? ""}
                        onChange={(e) => handleAssignDept(u.id, e.target.value || null)}
                        style={{
                          background: "var(--bg)",
                          border: `1px solid ${u.department ? "rgba(167,139,250,0.5)" : "var(--border)"}`,
                          borderRadius: 4, padding: "2px 6px", fontSize: "0.72rem",
                          color: u.department ? "#a78bfa" : "var(--text-muted)",
                          cursor: "pointer", outline: "none", maxWidth: 140,
                        }}
                      >
                        <option value="">— Chưa gán —</option>
                        {departments.map((d) => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: "7px 8px" }}>
                      <button
                        onClick={() => handleToggleRole(u.id, u.role)}
                        title={u.role === "dept_head" ? "Bấm để đổi về member" : "Bấm để phong Trưởng phòng"}
                        style={{
                          background: u.role === "dept_head" ? "rgba(234,179,8,0.15)" : "var(--surface)",
                          border: `1px solid ${u.role === "dept_head" ? "#eab308" : "var(--border)"}`,
                          borderRadius: 4, padding: "2px 8px", fontSize: "0.7rem",
                          color: u.role === "dept_head" ? "#eab308" : "var(--text-muted)",
                          cursor: "pointer", whiteSpace: "nowrap",
                        }}
                      >
                        {u.role === "dept_head" ? "👑 Trưởng phòng" : "Thành viên"}
                      </button>
                    </td>
                    <td style={{ padding: "7px 8px", textAlign: "right" }}>
                      {u.totalSessions}
                      {u.activeSessions > 0 && (
                        <span style={{ color: "var(--green)", fontSize: "0.68rem", marginLeft: 4 }}>+{u.activeSessions}</span>
                      )}
                    </td>
                    <td style={{ padding: "7px 8px", textAlign: "right", color: "var(--yellow)" }}>
                      {fmt(u.totalTokens)}
                    </td>
                    <td style={{ padding: "7px 8px", textAlign: "right", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                      {relTime(u.lastActiveAt)}
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ padding: "2rem", textAlign: "center" }}>
                      <div style={{ color: "var(--text-muted)", marginBottom: 6 }}>
                        Chưa có nhân viên nào đăng ký UUID.
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        Nhân viên cần vào{" "}
                        <span style={{ color: "var(--accent)" }}>/login</span>{" "}
                        → nhập email → chọn phòng ban → lấy UUID → chạy{" "}
                        <code style={{ background: "var(--bg)", padding: "1px 4px", borderRadius: 3 }}>
                          npx claude-reporter-setup
                        </code>{" "}
                        để gắn UUID vào hook.
                      </div>
                      {anonymousSessions > 0 && (
                        <div style={{ marginTop: 8, fontSize: "0.75rem", color: "#f97316" }}>
                          ⚠ Có {anonymousSessions} session ẩn danh (hook gửi nhưng chưa link UUID).
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sessions (all users) */}
      {tab === "sessions" && <SessionList adminMode />}

      {/* Projects table */}
      {tab === "projects" && (
        <div className="card">
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
              <thead>
                <tr style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Project</th>
                  <th style={{ textAlign: "right", padding: "6px 8px" }}>Sessions</th>
                  <th style={{ textAlign: "right", padding: "6px 8px" }}>Events</th>
                  <th style={{ textAlign: "right", padding: "6px 8px" }}>Tokens</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Users</th>
                  <th style={{ textAlign: "right", padding: "6px 8px" }}>Last active</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.path || p.name} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "7px 8px" }}>
                      <div style={{ fontWeight: 500 }}>{p.name}</div>
                      <div
                        style={{
                          color: "var(--text-muted)",
                          fontFamily: "monospace",
                          fontSize: "0.68rem",
                          maxWidth: 260,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {p.path || "—"}
                      </div>
                    </td>
                    <td style={{ padding: "7px 8px", textAlign: "right" }}>{p.sessions}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right", color: "var(--text-muted)" }}>{fmt(p.events)}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right", color: "var(--yellow)" }}>{fmt(p.totalTokens)}</td>
                    <td style={{ padding: "7px 8px" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                        {p.users.map((u) => (
                          <span
                            key={u}
                            style={{
                              background: "var(--surface)",
                              border: "1px solid var(--border)",
                              borderRadius: 3,
                              padding: "1px 5px",
                              fontSize: "0.65rem",
                              color: "var(--text-muted)",
                            }}
                          >
                            {u.split("@")[0]}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: "7px 8px", textAlign: "right", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                      {relTime(p.lastActivity)}
                    </td>
                  </tr>
                ))}
                {projects.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
                      Chưa có project nào được ghi nhận.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {/* System Health tab */}
      {tab === "system" && (
        <div>
          {/* Toolbar */}
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
              {sysHealth ? `Cập nhật: ${new Date(sysHealth.timestamp).toLocaleTimeString()}` : "Đang tải…"}
            </span>
            <button onClick={loadSysHealth} disabled={sysLoading}
              style={{ marginLeft: "auto", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 5, padding: "4px 12px", fontSize: "0.78rem", cursor: "pointer", color: "var(--text-muted)" }}>
              {sysLoading ? "…" : "↻ Làm mới"}
            </button>
            {sysHealth?.queue.failed && sysHealth.queue.failed > 0 ? (
              <button onClick={() => doQueueAction("retry_all")} disabled={!!queueAction}
                style={{ background: "#f97316", color: "#fff", border: "none", borderRadius: 5, padding: "4px 12px", fontSize: "0.78rem", cursor: "pointer", fontWeight: 600 }}>
                {queueAction === "retry_all" ? "…" : `↺ Retry ${sysHealth.queue.failed} lỗi`}
              </button>
            ) : null}
            {sysHealth?.queue.waiting && sysHealth.queue.waiting > 0 ? (
              <button onClick={() => { if (confirm("Drain toàn bộ queue đang chờ?")) doQueueAction("drain"); }} disabled={!!queueAction}
                style={{ background: "none", border: "1px solid #ef4444", borderRadius: 5, padding: "4px 12px", fontSize: "0.78rem", cursor: "pointer", color: "#ef4444" }}>
                {queueAction === "drain" ? "…" : "🗑 Drain queue"}
              </button>
            ) : null}
          </div>

          {/* Status cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.75rem", marginBottom: "1.25rem" }}>
            {/* Queue */}
            {[
              { label: "Queue waiting", value: sysHealth?.queue.waiting ?? "…", color: (sysHealth?.queue.waiting ?? 0) > 50 ? "#f97316" : "var(--green)" },
              { label: "Queue active", value: sysHealth?.queue.active ?? "…", color: "var(--accent)" },
              { label: "Queue failed", value: sysHealth?.queue.failed ?? "…", color: (sysHealth?.queue.failed ?? 0) > 0 ? "#ef4444" : "var(--green)" },
              { label: "Events / 5m", value: sysHealth?.eventsLast5m ?? "…", color: "var(--yellow)" },
              { label: "Events / 1h", value: sysHealth?.eventsLastHour ?? "…", color: "var(--text-muted)" },
              { label: "No-UUID events (1h)", value: sysHealth ? `${sysHealth.dedupHealth.noUuid} (${sysHealth.dedupHealth.ratio}%)` : "…",
                color: (sysHealth?.dedupHealth.ratio ?? 0) > 30 ? "#f97316" : "var(--green)" },
            ].map((c) => (
              <div key={c.label} className="card" style={{ padding: "0.75rem 1rem" }}>
                <div style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}>{c.label}</div>
                <div style={{ color: c.color, fontSize: "1.4rem", fontWeight: 700 }}>{String(c.value)}</div>
              </div>
            ))}
          </div>

          {/* Infrastructure status */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.75rem", marginBottom: "1.25rem" }}>
            <div className="card" style={{ padding: "0.85rem 1rem" }}>
              <div style={{ fontWeight: 600, fontSize: "0.8rem", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: sysHealth?.db.ok ? "var(--green)" : "#ef4444" }}>●</span> PostgreSQL
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                {sysHealth?.db.ok ? `Latency: ${sysHealth.db.latencyMs}ms` : "Không kết nối được"}
              </div>
            </div>
            <div className="card" style={{ padding: "0.85rem 1rem" }}>
              <div style={{ fontWeight: 600, fontSize: "0.8rem", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: sysHealth?.redis.ok ? "var(--green)" : "#ef4444" }}>●</span> Redis
              </div>
              {sysHealth?.redis.ok ? (
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
                  <div>Memory: {sysHealth.redis.usedMemory} / {sysHealth.redis.maxMemory}</div>
                  <div>Clients: {sysHealth.redis.connectedClients}</div>
                  <div style={{ color: sysHealth.redis.evictionPolicy !== "noeviction" ? "#f97316" : "var(--text-muted)" }}>
                    Policy: {sysHealth.redis.evictionPolicy}
                    {sysHealth.redis.evictionPolicy !== "noeviction" && " ⚠️"}
                  </div>
                </div>
              ) : <div style={{ fontSize: "0.75rem", color: "#ef4444" }}>Không kết nối được</div>}
            </div>
            <div className="card" style={{ padding: "0.85rem 1rem" }}>
              <div style={{ fontWeight: 600, fontSize: "0.8rem", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: sysHealth?.queue.ok ? "var(--green)" : "#ef4444" }}>●</span> BullMQ Worker
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
                <div>Completed: {sysHealth?.queue.completed ?? "…"}</div>
                <div>Delayed: {sysHealth?.queue.delayed ?? "…"}</div>
                <div style={{ color: (sysHealth?.queue.failed ?? 0) > 0 ? "#ef4444" : "var(--text-muted)" }}>
                  Failed: {sysHealth?.queue.failed ?? "…"}
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1.25rem" }}>
            {/* Ingestion rate chart (mini bar) */}
            <div className="card" style={{ padding: "0.85rem 1rem" }}>
              <div style={{ fontWeight: 600, fontSize: "0.8rem", marginBottom: "0.6rem" }}>Ingestion rate (30 phút gần nhất)</div>
              {sysHealth?.ingestionRate.length ? (
                <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 48 }}>
                  {(() => {
                    const max = Math.max(...sysHealth.ingestionRate.map((r) => r.count), 1);
                    // Fill up to 30 buckets
                    const now = Date.now();
                    const buckets = Array.from({ length: 30 }, (_, i) => {
                      const t = new Date(Math.floor((now - (29 - i) * 60_000) / 60_000) * 60_000).toISOString().slice(0, 16) + ":00.000Z";
                      const match = sysHealth.ingestionRate.find((r) => r.minute.slice(0, 16) === t.slice(0, 16));
                      return match?.count ?? 0;
                    });
                    return buckets.map((v, i) => (
                      <div key={i} title={`${v} events`} style={{
                        flex: 1, height: `${Math.max(2, (v / max) * 100)}%`,
                        background: v > max * 0.7 ? "#f97316" : "var(--accent)",
                        borderRadius: 2, opacity: 0.85,
                      }} />
                    ));
                  })()}
                </div>
              ) : (
                <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>Không có dữ liệu</div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                <span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>30m trước</span>
                <span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>Hiện tại</span>
              </div>
            </div>

            {/* Top users by volume */}
            <div className="card" style={{ padding: "0.85rem 1rem" }}>
              <div style={{ fontWeight: 600, fontSize: "0.8rem", marginBottom: "0.6rem" }}>Top users (1 giờ qua)</div>
              {sysHealth?.topUsers.length ? (
                <div>
                  {sysHealth.topUsers.map((u) => {
                    const maxCount = sysHealth.topUsers[0]?.count ?? 1;
                    return (
                      <div key={u.email} style={{ marginBottom: 4 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", marginBottom: 2 }}>
                          <span style={{ color: "var(--text)" }}>{u.email.split("@")[0]}</span>
                          <span style={{ color: "var(--text-muted)" }}>{u.count} events</span>
                        </div>
                        <div style={{ height: 4, background: "var(--surface)", borderRadius: 2 }}>
                          <div style={{ height: "100%", width: `${(u.count / maxCount) * 100}%`, background: "var(--accent)", borderRadius: 2 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>Không có activity trong 1h</div>}
            </div>
          </div>

          {/* Failed jobs table */}
          {sysHealth?.failedJobs.length ? (
            <div className="card" style={{ padding: "0.85rem 1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "#ef4444" }}>
                  Failed Jobs ({sysHealth.failedJobs.length})
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button onClick={() => doQueueAction("retry_all")} disabled={!!queueAction}
                    style={{ background: "#f97316", color: "#fff", border: "none", borderRadius: 5, padding: "3px 10px", fontSize: "0.75rem", cursor: "pointer" }}>
                    {queueAction === "retry_all" ? "…" : "↺ Retry All"}
                  </button>
                  <button onClick={() => { if (confirm("Xóa tất cả failed jobs?")) doQueueAction("clean_failed"); }} disabled={!!queueAction}
                    style={{ background: "none", border: "1px solid #ef4444", borderRadius: 5, padding: "3px 10px", fontSize: "0.75rem", cursor: "pointer", color: "#ef4444" }}>
                    🗑 Clear All
                  </button>
                </div>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      {["Job ID", "Events", "Attempts", "Thời gian", "Lỗi", ""].map((h) => (
                        <th key={h} style={{ padding: "5px 8px", textAlign: "left", color: "var(--text-muted)", fontWeight: 500 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sysHealth.failedJobs.map((j) => (
                      <tr key={j.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "6px 8px", color: "var(--text-muted)", fontFamily: "monospace" }}>{j.id.slice(0, 8)}…</td>
                        <td style={{ padding: "6px 8px" }}>{j.eventCount}</td>
                        <td style={{ padding: "6px 8px", color: j.attemptsMade >= 3 ? "#ef4444" : "var(--text)" }}>{j.attemptsMade}/3</td>
                        <td style={{ padding: "6px 8px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                          {j.timestamp ? relTime(new Date(j.timestamp).toISOString()) : "—"}
                        </td>
                        <td style={{ padding: "6px 8px", color: "#ef4444", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                          title={j.failedReason}>
                          {j.failedReason.slice(0, 80)}
                        </td>
                        <td style={{ padding: "6px 8px" }}>
                          <button onClick={() => doQueueAction("retry", j.id)} disabled={!!queueAction}
                            style={{ background: "none", border: "1px solid var(--accent)", borderRadius: 4, padding: "2px 8px", fontSize: "0.7rem", cursor: "pointer", color: "var(--accent)" }}>
                            {queueAction === `retry${j.id}` ? "…" : "↺ Retry"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : sysHealth ? (
            <div className="card" style={{ padding: "1rem", textAlign: "center", color: "var(--green)", fontSize: "0.85rem" }}>
              ✓ Không có failed jobs — hệ thống hoạt động bình thường
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
