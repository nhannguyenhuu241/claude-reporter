"use client";

import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import Link from "next/link";

interface Session {
  id: string;
  machineId: string;
  projectPath: string | null;
  model: string | null;
  status: string;
  startedAt: string;
  endedAt: string | null;
  inputTokens: number;
  outputTokens: number;
  userId: string | null;
  user: { email: string } | null;
  _count: { events: number };
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function projectName(path: string | null) {
  if (!path) return "Không có dự án";
  return path.split("/").pop() ?? path;
}

function groupByProject(sessions: Session[]) {
  const map = sessions.reduce((acc, s) => {
    const key = s.projectPath ?? "__none__";
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {} as Record<string, Session[]>);

  return Object.entries(map).sort(([, a], [, b]) => {
    const bTime = b[0]?.startedAt ? new Date(b[0].startedAt).getTime() : 0;
    const aTime = a[0]?.startedAt ? new Date(a[0].startedAt).getTime() : 0;
    return bTime - aTime;
  });
}

// ── Sub-component: project block ──────────────────────────────────────────
function ProjectBlock({
  projectKey,
  sessions,
  updatedIds,
  showUser,
  indent = false,
}: {
  projectKey: string;
  sessions: Session[];
  updatedIds: Set<string>;
  showUser: boolean;
  indent?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const name = projectName(projectKey === "__none__" ? null : projectKey);
  const totalTokens = sessions.reduce((s, x) => s + x.inputTokens + x.outputTokens, 0);
  const activeCount = sessions.filter((x) => x.status === "active").length;

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 5, overflow: "hidden", marginLeft: indent ? 16 : 0 }}>
      <button
        onClick={() => setCollapsed((v) => !v)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.4rem 0.75rem", background: "var(--bg)", border: "none", cursor: "pointer", textAlign: "left" }}
      >
        <span style={{ fontSize: "0.65rem", color: "var(--text-muted)", display: "inline-block", transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>▼</span>
        <span style={{ fontSize: "0.75rem" }}>📁</span>
        <span style={{ fontWeight: 600, fontSize: "0.82rem", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
        <span style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexShrink: 0 }}>
          {activeCount > 0 && (
            <span style={{ background: "rgba(34,197,94,0.15)", color: "var(--green)", fontSize: "0.65rem", borderRadius: 3, padding: "1px 5px", fontWeight: 600 }}>
              {activeCount} active
            </span>
          )}
          <span style={{ color: "var(--text-muted)", fontSize: "0.68rem" }}>{sessions.length} session{sessions.length > 1 ? "s" : ""}</span>
          <span style={{ color: "var(--yellow)", fontSize: "0.68rem" }}>{fmt(totalTokens)} tok</span>
          <span style={{ color: "var(--text-muted)", fontSize: "0.68rem" }}>{sessions[0]?.startedAt ? relativeTime(sessions[0].startedAt) : "—"}</span>
        </span>
      </button>

      {!collapsed && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.77rem" }}>
            <thead>
              <tr style={{ color: "var(--text-muted)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
                <th style={{ textAlign: "left", padding: "3px 10px" }}>Session</th>
                {showUser && <th style={{ textAlign: "left", padding: "3px 8px" }}>User</th>}
                <th style={{ textAlign: "left", padding: "3px 8px" }}>Status</th>
                <th style={{ textAlign: "right", padding: "3px 8px" }}>Events</th>
                <th style={{ textAlign: "right", padding: "3px 8px" }}>Tokens</th>
                <th style={{ textAlign: "right", padding: "3px 8px" }}>Started</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr
                  key={s.id}
                  style={{ borderBottom: "1px solid var(--border)", transition: "background 0.3s", background: updatedIds.has(s.id) ? "var(--accent-muted)" : "transparent" }}
                >
                  <td style={{ padding: "5px 10px" }}>
                    <Link href={`/sessions/${s.id}`} style={{ color: "var(--accent)", textDecoration: "none", fontFamily: "monospace" }}>
                      {s.id.slice(0, 8)}…
                    </Link>
                    {s.machineId !== "unknown" && (
                      <span style={{ color: "var(--text-muted)", marginLeft: 6, fontSize: "0.65rem" }}>[{s.machineId}]</span>
                    )}
                  </td>
                  {showUser && (
                    <td style={{ padding: "5px 8px", color: "var(--text-muted)", fontSize: "0.7rem", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {s.user?.email ? s.user.email.split("@")[0] : <span style={{ opacity: 0.4 }}>anon</span>}
                    </td>
                  )}
                  <td style={{ padding: "5px 8px" }}><span className={`badge badge-${s.status}`}>{s.status}</span></td>
                  <td style={{ padding: "5px 8px", textAlign: "right" }}>{s._count.events}</td>
                  <td style={{ padding: "5px 8px", textAlign: "right", color: "var(--yellow)" }}>{fmt(s.inputTokens + s.outputTokens)}</td>
                  <td style={{ padding: "5px 8px", textAlign: "right", color: "var(--text-muted)" }}>{relativeTime(s.startedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Sub-component: user block (admin only) ────────────────────────────────
function UserBlock({ userId, email, sessions, updatedIds }: {
  userId: string;
  email: string | null;
  sessions: Session[];
  updatedIds: Set<string>;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const totalTokens = sessions.reduce((s, x) => s + x.inputTokens + x.outputTokens, 0);
  const activeCount = sessions.filter((x) => x.status === "active").length;
  const projectGroups = groupByProject(sessions);
  const displayName = email ? email.split("@")[0] : "anon";
  const displayEmail = email ?? "Ẩn danh";

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
      {/* User header */}
      <button
        onClick={() => setCollapsed((v) => !v)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.55rem 0.75rem", background: "var(--surface)", border: "none", cursor: "pointer", textAlign: "left" }}
      >
        <span style={{ fontSize: "0.65rem", color: "var(--text-muted)", display: "inline-block", transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>▼</span>
        <div style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.72rem", fontWeight: 700, color: "#fff", flexShrink: 0 }}>
          {displayName[0]?.toUpperCase() ?? "?"}
        </div>
        <div style={{ flex: 1, overflow: "hidden" }}>
          <div style={{ fontWeight: 600, fontSize: "0.85rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayEmail}</div>
          <div style={{ color: "var(--text-muted)", fontSize: "0.65rem", fontFamily: "monospace" }}>{userId.slice(0, 12)}…</div>
        </div>
        <span style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexShrink: 0 }}>
          {activeCount > 0 && (
            <span style={{ background: "rgba(34,197,94,0.15)", color: "var(--green)", fontSize: "0.68rem", borderRadius: 3, padding: "1px 6px", fontWeight: 600 }}>
              {activeCount} active
            </span>
          )}
          <span style={{ color: "var(--text-muted)", fontSize: "0.72rem" }}>{projectGroups.length} project{projectGroups.length > 1 ? "s" : ""}</span>
          <span style={{ color: "var(--text-muted)", fontSize: "0.72rem" }}>{sessions.length} sessions</span>
          <span style={{ color: "var(--yellow)", fontSize: "0.72rem" }}>{fmt(totalTokens)} tok</span>
        </span>
      </button>

      {/* Project groups inside user */}
      {!collapsed && (
        <div style={{ padding: "0.5rem 0.75rem", display: "flex", flexDirection: "column", gap: "0.4rem", background: "var(--bg)" }}>
          {projectGroups.map(([key, slist]) => (
            <ProjectBlock key={key} projectKey={key} sessions={slist} updatedIds={updatedIds} showUser={false} indent={false} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────
export function SessionList({ adminMode = false }: { adminMode?: boolean }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [updatedIds, setUpdatedIds] = useState<Set<string>>(new Set());
  const [myUuid, setMyUuid] = useState<string | null>(null);
  const myUuidRef = useRef<string | null>(null);

  useEffect(() => {
    myUuidRef.current = myUuid;
  }, [myUuid]);

  useEffect(() => {
    const uuid = localStorage.getItem("claude-reporter-uuid");
    if (uuid) setMyUuid(uuid);
  }, []);

  async function load(userId?: string | null) {
    const qs = userId ? `?limit=100&userId=${userId}` : "?limit=100";
    const res = await fetch(`/api/sessions${qs}`);
    const data = await res.json();
    setSessions(data.sessions ?? []);
  }

  useEffect(() => {
    if (!adminMode && !myUuid) return;
    load(adminMode ? null : myUuid);

    const socket = io({ path: "/socket.io" });
    socket.on("session_started", () => load(adminMode ? null : myUuidRef.current));
    socket.on("session_updated", ({ sessionId }: { sessionId: string }) => {
      setUpdatedIds((prev) => new Set(Array.from(prev).concat(sessionId)));
      setTimeout(() => setUpdatedIds((prev) => { const n = new Set(prev); n.delete(sessionId); return n; }), 1500);
      load(adminMode ? null : myUuidRef.current);
    });

    return () => { socket.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myUuid, adminMode]);

  // Group by user (admin) or by project (personal)
  const userGroups = adminMode
    ? Object.entries(
        sessions.reduce((acc, s) => {
          const key = s.userId ?? "__anon__";
          if (!acc[key]) acc[key] = { email: s.user?.email ?? null, sessions: [] };
          acc[key].sessions.push(s);
          return acc;
        }, {} as Record<string, { email: string | null; sessions: Session[] }>)
      ).sort(([, a], [, b]) => {
        const bTime = b.sessions[0]?.startedAt ? new Date(b.sessions[0].startedAt).getTime() : 0;
        const aTime = a.sessions[0]?.startedAt ? new Date(a.sessions[0].startedAt).getTime() : 0;
        return bTime - aTime;
      })
    : null;

  const projectGroups = !adminMode ? groupByProject(sessions) : null;

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", marginBottom: "0.75rem", gap: "0.75rem" }}>
        <span style={{ fontWeight: 600 }}>
          Sessions
          <span style={{ color: "var(--text-muted)", fontWeight: 400, fontSize: "0.8rem", marginLeft: 8 }}>({sessions.length})</span>
        </span>
        {adminMode && (
          <span style={{ marginLeft: "auto", fontSize: "0.72rem", color: "var(--text-muted)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, padding: "2px 8px" }}>
            All users
          </span>
        )}
      </div>

      {sessions.length === 0 ? (
        <div style={{ padding: "2rem", textAlign: "center" }}>
          <div style={{ color: "var(--text-muted)", marginBottom: 8 }}>
            {adminMode ? "Chưa có session nào được ghi nhận." : "Chưa có session nào của bạn."}
          </div>
          {!adminMode && (
            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
              Đảm bảo đã cài hook và UUID trên máy — xem lại tại{" "}
              <Link href="/login" style={{ color: "var(--accent)", textDecoration: "none" }}>trang đăng ký</Link>
              . Dữ liệu sẽ hiện trong vòng 5 phút.
            </div>
          )}
        </div>
      ) : adminMode && userGroups ? (
        /* ── Admin: User → Project → Session ── */
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {userGroups.map(([userId, { email, sessions: uSessions }]) => (
            <UserBlock key={userId} userId={userId} email={email} sessions={uSessions} updatedIds={updatedIds} />
          ))}
        </div>
      ) : (
        /* ── Personal: Project → Session ── */
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {projectGroups!.map(([key, slist]) => (
            <ProjectBlock key={key} projectKey={key} sessions={slist} updatedIds={updatedIds} showUser={false} />
          ))}
        </div>
      )}
    </div>
  );
}
