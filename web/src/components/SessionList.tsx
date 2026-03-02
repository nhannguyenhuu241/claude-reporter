"use client";

import { useEffect, useState } from "react";
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

export function SessionList() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [updatedIds, setUpdatedIds] = useState<Set<string>>(new Set());
  const [myUuid, setMyUuid] = useState<string | null>(null);
  const [filterMine, setFilterMine] = useState(false);

  useEffect(() => {
    const uuid = localStorage.getItem("claude-reporter-uuid");
    if (uuid) setMyUuid(uuid);
  }, []);

  async function load(userId?: string | null) {
    const qs = userId ? `?limit=50&userId=${userId}` : "?limit=50";
    const res = await fetch(`/api/sessions${qs}`);
    const data = await res.json();
    setSessions(data.sessions ?? []);
  }

  useEffect(() => {
    load();

    const socket = io({ path: "/socket.io" });
    socket.on("session_started", () => load(filterMine ? myUuid : null));
    socket.on("session_updated", ({ sessionId }: { sessionId: string }) => {
      setUpdatedIds((prev) => new Set(Array.from(prev).concat(sessionId)));
      setTimeout(
        () =>
          setUpdatedIds((prev) => {
            const next = new Set(prev);
            next.delete(sessionId);
            return next;
          }),
        1500
      );
      load(filterMine ? myUuid : null);
    });

    return () => { socket.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load(filterMine ? myUuid : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterMine, myUuid]);

  return (
    <div className="card">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          marginBottom: "0.75rem",
          gap: "0.75rem",
        }}
      >
        <span style={{ fontWeight: 600 }}>
          Sessions
          <span style={{ color: "var(--text-muted)", fontWeight: 400, fontSize: "0.8rem", marginLeft: 8 }}>
            ({sessions.length})
          </span>
        </span>

        {myUuid && (
          <div style={{ marginLeft: "auto", display: "flex", gap: "0.4rem" }}>
            <button
              onClick={() => setFilterMine(false)}
              style={{
                background: !filterMine ? "var(--accent)" : "var(--surface)",
                color: !filterMine ? "#fff" : "var(--text-muted)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                padding: "2px 10px",
                fontSize: "0.75rem",
                cursor: "pointer",
                fontWeight: !filterMine ? 600 : 400,
              }}
            >
              All
            </button>
            <button
              onClick={() => setFilterMine(true)}
              style={{
                background: filterMine ? "var(--accent)" : "var(--surface)",
                color: filterMine ? "#fff" : "var(--text-muted)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                padding: "2px 10px",
                fontSize: "0.75rem",
                cursor: "pointer",
                fontWeight: filterMine ? 600 : 400,
              }}
            >
              Mine
            </button>
          </div>
        )}
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
          <thead>
            <tr style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>
              <th style={{ textAlign: "left", padding: "4px 8px" }}>Session</th>
              <th style={{ textAlign: "left", padding: "4px 8px" }}>Project</th>
              <th style={{ textAlign: "left", padding: "4px 8px" }}>User</th>
              <th style={{ textAlign: "left", padding: "4px 8px" }}>Status</th>
              <th style={{ textAlign: "right", padding: "4px 8px" }}>Events</th>
              <th style={{ textAlign: "right", padding: "4px 8px" }}>Tokens</th>
              <th style={{ textAlign: "right", padding: "4px 8px" }}>Started</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr
                key={s.id}
                style={{
                  borderBottom: "1px solid var(--border)",
                  transition: "background 0.3s",
                  background: updatedIds.has(s.id) ? "var(--accent-muted)" : "transparent",
                }}
              >
                <td style={{ padding: "6px 8px" }}>
                  <Link
                    href={`/sessions/${s.id}`}
                    style={{ color: "var(--accent)", textDecoration: "none", fontFamily: "monospace" }}
                  >
                    {s.id.slice(0, 8)}…
                  </Link>
                  {s.machineId !== "unknown" && (
                    <span style={{ color: "var(--text-muted)", marginLeft: 6, fontSize: "0.7rem" }}>
                      [{s.machineId}]
                    </span>
                  )}
                </td>
                <td
                  style={{
                    padding: "6px 8px",
                    color: "var(--text-muted)",
                    maxWidth: 180,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {s.projectPath ? s.projectPath.split("/").pop() : "—"}
                </td>
                <td
                  style={{
                    padding: "6px 8px",
                    color: "var(--text-muted)",
                    maxWidth: 140,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontSize: "0.75rem",
                  }}
                >
                  {s.user?.email
                    ? s.user.email.split("@")[0]
                    : <span style={{ opacity: 0.4 }}>anon</span>}
                </td>
                <td style={{ padding: "6px 8px" }}>
                  <span className={`badge badge-${s.status}`}>{s.status}</span>
                </td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>
                  {s._count.events}
                </td>
                <td style={{ padding: "6px 8px", textAlign: "right", color: "var(--yellow)" }}>
                  {fmt(s.inputTokens + s.outputTokens)}
                </td>
                <td style={{ padding: "6px 8px", textAlign: "right", color: "var(--text-muted)" }}>
                  {relativeTime(s.startedAt)}
                </td>
              </tr>
            ))}
            {sessions.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  style={{ padding: "1.5rem", textAlign: "center", color: "var(--text-muted)" }}
                >
                  {filterMine
                    ? "No sessions for your UUID yet."
                    : "No sessions recorded yet. Configure Claude Code hooks to start capturing."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
