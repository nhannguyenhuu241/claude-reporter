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

// Only show meaningful event types
const VISIBLE_EVENTS = new Set(["user_prompt", "assistant_message", "session_start", "session_end"]);

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

function truncate(s: string, n = 200) {
  return s && s.length > n ? s.slice(0, n) + "…" : s;
}

function projectName(path?: string | null) {
  if (!path) return "Unknown Project";
  // Extract last meaningful segment
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

function timeLabel(ts: string) {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
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
  const data = await res.json();
  return data.events as LiveEvent[];
}

interface ProjectGroup {
  project: string;
  projectPath: string | null;
  events: LiveEvent[];
  collapsed: boolean;
}

export function LiveFeed() {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [filter, setFilter] = useState<"all" | "mine">("all");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
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

  // Initial hydration from DB
  useEffect(() => {
    const userId = filter === "mine" ? getUserId() : undefined;
    fetchEvents({ limit: 150, userId }).then((evts) => {
      setEvents(evts);
      if (evts.length > 0) lastIdRef.current = evts[0].id;
    });
  }, [filter]);

  // Socket.io connection with reconnect catch-up
  useEffect(() => {
    const socket = io({ path: "/socket.io" });
    socketRef.current = socket;

    socket.on("connect", async () => {
      setConnected(true);
      setReconnecting(false);
      if (lastIdRef.current > 0) {
        const userId = filter === "mine" ? getUserId() : undefined;
        const missed = await fetchEvents({ after: lastIdRef.current, userId });
        if (missed.length > 0) mergeEvents(missed);
      }
    });

    socket.on("disconnect", () => {
      setConnected(false);
      setReconnecting(true);
    });

    socket.on("event", ({ event }: { event: LiveEvent }) => {
      mergeEvents([event]);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [filter, mergeEvents]);

  // Group visible events by project
  const visibleEvents = events.filter((e) => VISIBLE_EVENTS.has(e.eventType));

  const groups: ProjectGroup[] = [];
  const projectMap = new Map<string, ProjectGroup>();

  for (const e of visibleEvents) {
    const path = e.session?.projectPath ?? null;
    const key = path ?? "__unknown__";
    if (!projectMap.has(key)) {
      const g: ProjectGroup = { project: projectName(path), projectPath: path, events: [], collapsed: false };
      projectMap.set(key, g);
      groups.push(g);
    }
    projectMap.get(key)!.events.push(e);
  }

  const toggleCollapse = (key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
        <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>Live Activity</span>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          {/* Filter */}
          <div style={{ display: "flex", gap: 4 }}>
            {(["all", "mine"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  fontSize: "0.68rem", padding: "2px 8px", borderRadius: 4,
                  border: "1px solid var(--border)",
                  background: filter === f ? "var(--accent)" : "transparent",
                  color: filter === f ? "#fff" : "var(--text-muted)",
                  cursor: "pointer",
                }}
              >
                {f === "all" ? "All" : "Mine"}
              </button>
            ))}
          </div>
          {/* Connection status */}
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
                {/* Project header */}
                <button
                  onClick={() => toggleCollapse(key)}
                  style={{
                    width: "100%", textAlign: "left", background: "rgba(255,255,255,0.03)",
                    border: "none", borderBottom: isCollapsed ? "none" : "1px solid var(--border)",
                    padding: "6px 10px", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: "0.5rem",
                  }}
                >
                  <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{isCollapsed ? "▶" : "▼"}</span>
                  <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--accent)" }}>
                    📁 {g.project}
                  </span>
                  {g.projectPath && (
                    <span style={{ fontSize: "0.63rem", color: "var(--text-muted)", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {g.projectPath}
                    </span>
                  )}
                  <span style={{ marginLeft: "auto", fontSize: "0.65rem", color: "var(--text-muted)", flexShrink: 0 }}>
                    {g.events.length} events
                  </span>
                </button>

                {/* Events in this project */}
                {!isCollapsed && (
                  <div style={{ maxHeight: 380, overflowY: "auto", padding: "6px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
                    {g.events.map((e) => (
                      <div
                        key={e.id}
                        style={{
                          padding: "6px 8px", borderRadius: 6,
                          borderLeft: `3px solid ${EVENT_COLORS[e.eventType] ?? "var(--border)"}`,
                          background: "rgba(255,255,255,0.02)",
                        }}
                      >
                        {/* Top row */}
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: (e.eventType === "user_prompt" || e.eventType === "assistant_message") ? 4 : 0 }}>
                          <span style={{ fontSize: "0.72rem" }}>{EVENT_ICONS[e.eventType] ?? "•"}</span>
                          <span style={{ fontSize: "0.67rem", fontWeight: 600, color: EVENT_COLORS[e.eventType] ?? "var(--text-muted)" }}>
                            {EVENT_LABELS[e.eventType] ?? e.eventType}
                          </span>
                          {e.session?.user?.email && (
                            <span style={{ fontSize: "0.63rem", color: "var(--text-muted)" }}>
                              {e.session.user.email.split("@")[0]}
                            </span>
                          )}
                          <span style={{ marginLeft: "auto", fontSize: "0.62rem", color: "var(--text-muted)", flexShrink: 0 }}>
                            {timeLabel(e.timestamp)}
                          </span>
                        </div>
                        {/* Content */}
                        {(e.eventType === "user_prompt" || e.eventType === "assistant_message") && (
                          <div style={{
                            fontSize: "0.76rem",
                            color: e.eventType === "user_prompt" ? "var(--text)" : "var(--text-muted)",
                            lineHeight: 1.5,
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                          }}>
                            {truncate(e.eventType === "user_prompt" ? (e.userPrompt ?? "") : (e.assistantMessage ?? ""))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
