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

type Tab = "departments" | "users" | "projects" | "sessions";

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

  const [newDeptName, setNewDeptName] = useState("");
  const [deptCreating, setDeptCreating] = useState(false);
  const [deptError, setDeptError] = useState("");
  const [editingDept, setEditingDept] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    // Try auto-login via existing cookie
    loadAll();
  }, []);

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
          { label: "Total Cost", value: `$${totalCost.toFixed(2)}`, color: "#f97316" },
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
        ] as { key: Tab; label: string }[]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              background: tab === key ? "var(--accent)" : "var(--surface)",
              color: tab === key ? "#fff" : "var(--text-muted)",
              border: "1px solid var(--border)",
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
                    <th style={{ textAlign: "right", padding: "6px 8px" }}>Cost</th>
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
                        <td style={{ padding: "7px 8px", textAlign: "right", color: "#f97316" }}>
                          ${d.estimatedCostUsd.toFixed(2)}
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
                  <th style={{ textAlign: "right", padding: "6px 8px" }}>Cost</th>
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
                    <td style={{ padding: "7px 8px", textAlign: "right", color: "#f97316" }}>
                      ${u.estimatedCostUsd.toFixed(2)}
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
                  <th style={{ textAlign: "right", padding: "6px 8px" }}>Cost</th>
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
                    <td style={{ padding: "7px 8px", textAlign: "right", color: "#f97316" }}>${p.estimatedCostUsd.toFixed(2)}</td>
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
    </div>
  );
}
