"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

interface LiveEvent {
  id: number;
  sessionId: string;
  eventType: string;
  timestamp: string;
  toolName?: string;
  userPrompt?: string;
  assistantMessage?: string;
  session?: {
    projectPath?: string | null;
    userId?: string | null;
    user?: { email: string } | null;
  };
}

const VISIBLE_EVENTS = new Set(["user_prompt", "assistant_message", "session_start", "session_end"]);
const PREVIEW_LEN = 200;

const EVENT_ICONS: Record<string, string> = {
  user_prompt: "💬",
  assistant_message: "🤖",
  session_start: "🚀",
  session_end: "✅",
};
const EVENT_COLORS: Record<string, string> = {
  user_prompt: "#8b5cf6",
  assistant_message: "#10b981",
  session_start: "#06b6d4",
  session_end: "#6b7280",
};
const EVENT_LABELS: Record<string, string> = {
  user_prompt: "Prompt",
  assistant_message: "Claude",
  session_start: "Session started",
  session_end: "Session ended",
};

function fullContent(e: LiveEvent) {
  if (e.eventType === "user_prompt") return e.userPrompt ?? "";
  if (e.eventType === "assistant_message") return e.assistantMessage ?? "";
  return "";
}

function projectName(path?: string | null) {
  if (!path) return "Unknown Project";
  return path.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? path;
}

function timeLabel(ts: string) {
  const d = new Date(ts);
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return d.toLocaleDateString();
}

async function fetchEvents(params: { limit?: number; after?: number; userId?: string }) {
  const q = new URLSearchParams();
  if (params.limit) q.set("limit", String(params.limit));
  if (params.after) q.set("after", String(params.after));
  if (params.userId) q.set("userId", params.userId);
  const res = await fetch(`/api/events?${q}`);
  if (!res.ok) return [];
  return ((await res.json()).events ?? []) as LiveEvent[];
}

// ── Detail Modal ──────────────────────────────────────────────────────────────
function DetailModal({ event, onClose }: { event: LiveEvent; onClose: () => void }) {
  const content = fullContent(event);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "1.5rem",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 12, maxWidth: 720, width: "100%",
          maxHeight: "80vh", display: "flex", flexDirection: "column",
          boxShadow: "0 25px 60px rgba(0,0,0,0.5)",
        }}
      >
        {/* Modal header */}
        <div style={{
          display: "flex", alignItems: "center", gap: "0.6rem",
          padding: "0.9rem 1.1rem",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}>
          <span style={{ fontSize: "1rem" }}>{EVENT_ICONS[event.eventType]}</span>
          <span style={{ fontWeight: 700, fontSize: "0.9rem", color: EVENT_COLORS[event.eventType] }}>
            {EVENT_LABELS[event.eventType]}
          </span>
          {event.session?.user?.email && (
            <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
              · {event.session.user.email}
            </span>
          )}
          <span style={{ marginLeft: "auto", fontSize: "0.68rem", color: "var(--text-muted)" }}>
            {new Date(event.timestamp).toLocaleString()}
          </span>
          <button
            onClick={onClose}
            style={{
              marginLeft: "0.5rem", background: "none", border: "none",
              color: "var(--text-muted)", fontSize: "1.1rem", cursor: "pointer",
              lineHeight: 1, padding: "0 4px",
            }}
          >✕</button>
        </div>

        {/* Session info */}
        <div style={{ padding: "0.5rem 1.1rem", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <span style={{ fontSize: "0.65rem", color: "var(--text-muted)", fontFamily: "monospace" }}>
            session: {event.sessionId}
          </span>
          {event.session?.projectPath && (
            <span style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginLeft: "1rem" }}>
              📁 {event.session.projectPath}
            </span>
          )}
        </div>

        {/* Content */}
        <div style={{ overflowY: "auto", padding: "1rem 1.1rem", flex: 1 }}>
          <pre style={{
            margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word",
            fontSize: "0.82rem", lineHeight: 1.7,
            color: event.eventType === "user_prompt" ? "var(--text)" : "var(--text-muted)",
            fontFamily: "inherit",
          }}>
            {content}
          </pre>
        </div>

        {/* Footer */}
        <div style={{
          padding: "0.6rem 1.1rem", borderTop: "1px solid var(--border)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          flexShrink: 0,
        }}>
          <span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>
            {content.length.toLocaleString()} ký tự · Nhấn Esc hoặc click ngoài để đóng
          </span>
          <button
            onClick={() => { navigator.clipboard.writeText(content); }}
            style={{
              fontSize: "0.72rem", padding: "3px 10px", borderRadius: 5,
              border: "1px solid var(--border)", background: "var(--bg)",
              color: "var(--text-muted)", cursor: "pointer",
            }}
          >
            Copy
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Event Card ────────────────────────────────────────────────────────────────
function EventCard({ e, onDetail }: { e: LiveEvent; onDetail: (e: LiveEvent) => void }) {
  const content = fullContent(e);
  const isLong = content.length > PREVIEW_LEN;
  const hasContent = e.eventType === "user_prompt" || e.eventType === "assistant_message";

  return (
    <div style={{
      padding: "6px 8px", borderRadius: 6,
      borderLeft: `3px solid ${EVENT_COLORS[e.eventType] ?? "var(--border)"}`,
      background: "rgba(255,255,255,0.02)",
    }}>
      {/* Top row */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: hasContent ? 4 : 0 }}>
        <span style={{ fontSize: "0.72rem" }}>{EVENT_ICONS[e.eventType] ?? "•"}</span>
        <span style={{ fontSize: "0.67rem", fontWeight: 600, color: EVENT_COLORS[e.eventType] ?? "var(--text-muted)" }}>
          {EVENT_LABELS[e.eventType] ?? e.eventType}
        </span>
        {e.session?.user?.email && (
          <span style={{ fontSize: "0.63rem", color: "var(--text-muted)" }}>
            {e.session.user.email.split("@")[0]}
          </span>
        )}
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.4rem", flexShrink: 0 }}>
          <span style={{ fontSize: "0.62rem", color: "var(--text-muted)" }}>{timeLabel(e.timestamp)}</span>
          {hasContent && (
            <button
              onClick={() => onDetail(e)}
              title="Xem chi tiết đầy đủ"
              style={{
                fontSize: "0.6rem", padding: "1px 6px", borderRadius: 4,
                border: `1px solid ${EVENT_COLORS[e.eventType]}44`,
                background: `${EVENT_COLORS[e.eventType]}11`,
                color: EVENT_COLORS[e.eventType],
                cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              Chi tiết ↗
            </button>
          )}
        </span>
      </div>

      {/* Content preview */}
      {hasContent && (
        <div style={{ position: "relative" }}>
          <div style={{
            fontSize: "0.76rem",
            color: e.eventType === "user_prompt" ? "var(--text)" : "var(--text-muted)",
            lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word",
          }}>
            {isLong ? content.slice(0, PREVIEW_LEN) + "…" : content}
          </div>
          {isLong && (
            <button
              onClick={() => onDetail(e)}
              style={{
                marginTop: 3, fontSize: "0.65rem", color: EVENT_COLORS[e.eventType],
                background: "none", border: "none", cursor: "pointer", padding: 0,
              }}
            >
              Xem thêm ({content.length.toLocaleString()} ký tự)
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
interface ProjectGroup {
  project: string;
  projectPath: string | null;
  events: LiveEvent[];
}

export function LiveFeed() {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [filter, setFilter] = useState<"all" | "mine">("all");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [detail, setDetail] = useState<LiveEvent | null>(null);
  const lastIdRef = useRef<number>(0);
  const socketRef = useRef<Socket | null>(null);

  const getUserId = () =>
    typeof window !== "undefined" ? localStorage.getItem("claude-reporter-uuid") ?? undefined : undefined;

  const mergeEvents = useCallback((incoming: LiveEvent[]) => {
    setEvents((prev) => {
      const ids = new Set(prev.map((e) => e.id));
      const newOnes = incoming.filter((e) => !ids.has(e.id));
      if (newOnes.length === 0) return prev;
      const merged = [...newOnes, ...prev].sort((a, b) => b.id - a.id).slice(0, 500);
      if (merged[0]) lastIdRef.current = Math.max(lastIdRef.current, merged[0].id);
      return merged;
    });
  }, []);

  useEffect(() => {
    const userId = filter === "mine" ? getUserId() : undefined;
    fetchEvents({ limit: 150, userId }).then((evts) => {
      setEvents(evts);
      if (evts.length > 0) lastIdRef.current = evts[0].id;
    });
  }, [filter]);

  useEffect(() => {
    const socket = io({ path: "/socket.io" });
    socketRef.current = socket;
    socket.on("connect", async () => {
      setConnected(true); setReconnecting(false);
      if (lastIdRef.current > 0) {
        const missed = await fetchEvents({ after: lastIdRef.current, userId: filter === "mine" ? getUserId() : undefined });
        if (missed.length > 0) mergeEvents(missed);
      }
    });
    socket.on("disconnect", () => { setConnected(false); setReconnecting(true); });
    socket.on("event", ({ event }: { event: LiveEvent }) => mergeEvents([event]));
    return () => { socket.disconnect(); socketRef.current = null; };
  }, [filter, mergeEvents]);

  // Group by project
  const visibleEvents = events.filter((e) => VISIBLE_EVENTS.has(e.eventType));
  const groups: ProjectGroup[] = [];
  const projectMap = new Map<string, ProjectGroup>();
  for (const e of visibleEvents) {
    const path = e.session?.projectPath ?? null;
    const key = path ?? "__unknown__";
    if (!projectMap.has(key)) {
      const g: ProjectGroup = { project: projectName(path), projectPath: path, events: [] };
      projectMap.set(key, g);
      groups.push(g);
    }
    projectMap.get(key)!.events.push(e);
  }

  return (
    <>
      {detail && <DetailModal event={detail} onClose={() => setDetail(null)} />}

      <div className="card" style={{ display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
          <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>Live Activity</span>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div style={{ display: "flex", gap: 4 }}>
              {(["all", "mine"] as const).map((f) => (
                <button key={f} onClick={() => setFilter(f)} style={{
                  fontSize: "0.68rem", padding: "2px 8px", borderRadius: 4,
                  border: "1px solid var(--border)",
                  background: filter === f ? "var(--accent)" : "transparent",
                  color: filter === f ? "#fff" : "var(--text-muted)", cursor: "pointer",
                }}>
                  {f === "all" ? "All" : "Mine"}
                </button>
              ))}
            </div>
            <span style={{ fontSize: "0.68rem", color: connected ? "var(--green)" : reconnecting ? "#f59e0b" : "var(--red)" }}>
              ● {connected ? "live" : reconnecting ? "reconnecting…" : "disconnected"}
            </span>
          </div>
        </div>

        {/* Project groups */}
        {groups.length === 0 ? (
          <div style={{ color: "var(--text-muted)", fontSize: "0.8rem", padding: "1rem 0" }}>
            Waiting for events… Start a Claude Code session to see activity here.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {groups.map((g) => {
              const key = g.projectPath ?? "__unknown__";
              const isCollapsed = collapsed[key] ?? false;
              return (
                <div key={key} style={{ borderRadius: 8, border: "1px solid var(--border)", overflow: "hidden" }}>
                  <button
                    onClick={() => setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }))}
                    style={{
                      width: "100%", textAlign: "left", background: "rgba(255,255,255,0.03)",
                      border: "none", borderBottom: isCollapsed ? "none" : "1px solid var(--border)",
                      padding: "6px 10px", cursor: "pointer",
                      display: "flex", alignItems: "center", gap: "0.5rem",
                    }}
                  >
                    <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{isCollapsed ? "▶" : "▼"}</span>
                    <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--accent)" }}>📁 {g.project}</span>
                    {g.projectPath && (
                      <span style={{ fontSize: "0.63rem", color: "var(--text-muted)", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {g.projectPath}
                      </span>
                    )}
                    <span style={{ marginLeft: "auto", fontSize: "0.65rem", color: "var(--text-muted)", flexShrink: 0 }}>
                      {g.events.length} events
                    </span>
                  </button>

                  {!isCollapsed && (
                    <div style={{ maxHeight: 400, overflowY: "auto", padding: "6px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
                      {g.events.map((e) => (
                        <EventCard key={e.id} e={e} onDetail={setDetail} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
