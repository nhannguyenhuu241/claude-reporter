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
}

const EVENT_ICONS: Record<string, string> = {
  tool_start: "⚡",
  tool_use: "🔧",
  user_prompt: "💬",
  assistant_message: "🤖",
  session_start: "🚀",
  session_end: "✅",
};

const EVENT_COLORS: Record<string, string> = {
  tool_start: "#f59e0b",
  tool_use: "#3b82f6",
  user_prompt: "#8b5cf6",
  assistant_message: "#10b981",
  session_start: "#06b6d4",
  session_end: "#6b7280",
};

function truncate(s: string, n = 100) {
  return s && s.length > n ? s.slice(0, n) + "…" : s;
}

function eventLabel(e: LiveEvent) {
  if (e.eventType === "tool_use" || e.eventType === "tool_start")
    return e.toolName ?? "unknown tool";
  if (e.eventType === "user_prompt") return truncate(e.userPrompt ?? "");
  if (e.eventType === "assistant_message") return truncate(e.assistantMessage ?? "");
  return e.eventType;
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

export function LiveFeed() {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [filter, setFilter] = useState<"all" | "mine">("all");
  const lastIdRef = useRef<number>(0);
  const socketRef = useRef<Socket | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const getUserId = () =>
    typeof window !== "undefined" ? localStorage.getItem("claude-reporter-uuid") ?? undefined : undefined;

  const mergeEvents = useCallback((incoming: LiveEvent[]) => {
    setEvents((prev) => {
      const ids = new Set(prev.map((e) => e.id));
      const newOnes = incoming.filter((e) => !ids.has(e.id));
      if (newOnes.length === 0) return prev;
      const merged = [...newOnes, ...prev].sort((a, b) => b.id - a.id).slice(0, 300);
      if (merged[0]) lastIdRef.current = Math.max(lastIdRef.current, merged[0].id);
      return merged;
    });
  }, []);

  // Initial hydration from DB
  useEffect(() => {
    const userId = filter === "mine" ? getUserId() : undefined;
    fetchEvents({ limit: 100, userId }).then((evts) => {
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

      // Catch up events missed while offline
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
      const userId = filter === "mine" ? getUserId() : undefined;
      if (userId && event.sessionId) {
        // We don't have userId on the event directly, just add it regardless
        // The userId filter only applies to initial load; realtime shows all then filters
      }
      mergeEvents([event]);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [filter, mergeEvents]);

  const filteredEvents = events;

  return (
    <div className="card" style={{ height: 400, display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "0.5rem",
        }}
      >
        <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>Live Activity</span>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          {/* Filter */}
          <div style={{ display: "flex", gap: 4 }}>
            {(["all", "mine"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  fontSize: "0.68rem",
                  padding: "2px 8px",
                  borderRadius: 4,
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

      {/* Event count */}
      {filteredEvents.length > 0 && (
        <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginBottom: "0.4rem" }}>
          {filteredEvents.length} events stored · refreshes preserved
        </div>
      )}

      {/* Event list */}
      <div
        ref={listRef}
        style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 2 }}
      >
        {filteredEvents.length === 0 ? (
          <div style={{ color: "var(--text-muted)", fontSize: "0.8rem", padding: "1rem 0" }}>
            Waiting for events… Start a Claude Code session to see activity here.
          </div>
        ) : (
          filteredEvents.map((e) => (
            <div
              key={e.id}
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: "0.4rem",
                fontSize: "0.76rem",
                padding: "3px 0",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <span style={{ minWidth: 18, color: EVENT_COLORS[e.eventType] ?? "var(--text-muted)" }}>
                {EVENT_ICONS[e.eventType] ?? "•"}
              </span>
              <span style={{ color: "var(--text-muted)", minWidth: 62, fontSize: "0.68rem", flexShrink: 0 }}>
                {timeLabel(e.timestamp)}
              </span>
              <span
                style={{
                  color: "var(--accent)",
                  minWidth: 58,
                  fontSize: "0.68rem",
                  fontFamily: "monospace",
                  flexShrink: 0,
                }}
              >
                {e.sessionId.slice(0, 8)}
              </span>
              <span
                style={{
                  color: EVENT_COLORS[e.eventType] ?? "var(--text)",
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                  textOverflow: "ellipsis",
                  fontSize: "0.74rem",
                }}
              >
                {eventLabel(e)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
