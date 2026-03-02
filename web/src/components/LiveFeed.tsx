"use client";

import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

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

function truncate(s: string, n = 120) {
  return s && s.length > n ? s.slice(0, n) + "…" : s;
}

function eventLabel(e: LiveEvent) {
  if (e.eventType === "tool_use" || e.eventType === "tool_start")
    return e.toolName ?? "unknown tool";
  if (e.eventType === "user_prompt") return truncate(e.userPrompt ?? "");
  if (e.eventType === "assistant_message") return truncate(e.assistantMessage ?? "");
  return e.eventType;
}

export function LiveFeed() {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const socket = io({ path: "/socket.io" });

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on("event", ({ event }: { event: LiveEvent }) => {
      setEvents((prev) => [event, ...prev].slice(0, 200));
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <div className="card" style={{ height: 360, display: "flex", flexDirection: "column" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "0.75rem",
        }}
      >
        <span style={{ fontWeight: 600 }}>Live Activity</span>
        <span
          style={{
            fontSize: "0.7rem",
            color: connected ? "var(--green)" : "var(--red)",
          }}
        >
          ● {connected ? "connected" : "disconnected"}
        </span>
      </div>

      <div
        ref={listRef}
        style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 4 }}
      >
        {events.length === 0 ? (
          <div style={{ color: "var(--text-muted)", fontSize: "0.8rem", padding: "1rem 0" }}>
            Waiting for events… Start a Claude Code session to see activity here.
          </div>
        ) : (
          events.map((e) => (
            <div
              key={e.id}
              style={{
                display: "flex",
                gap: "0.5rem",
                fontSize: "0.78rem",
                padding: "4px 0",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <span style={{ minWidth: 20 }}>{EVENT_ICONS[e.eventType] ?? "•"}</span>
              <span style={{ color: "var(--text-muted)", minWidth: 70, fontSize: "0.7rem" }}>
                {new Date(e.timestamp).toLocaleTimeString()}
              </span>
              <span
                style={{
                  color: "var(--accent)",
                  minWidth: 60,
                  fontSize: "0.7rem",
                  fontFamily: "monospace",
                }}
              >
                {e.sessionId.slice(0, 8)}
              </span>
              <span style={{ color: "var(--text)", overflow: "hidden", whiteSpace: "nowrap" }}>
                {eventLabel(e)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
