"use client";

import { useEffect, useRef, useState, use, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { io, Socket } from "socket.io-client";

interface Event {
  id: number;
  eventType: string;
  timestamp: string;
  toolName?: string;
  toolInput?: string;
  toolOutput?: string;
  toolDurationMs?: number;
  userPrompt?: string;
  assistantMessage?: string;
  inputTokens?: number;
  outputTokens?: number;
}

interface Pagination {
  page: number;
  limit: number;
  totalEvents: number;
  totalPages: number;
  hasMore: boolean;
}

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
  cacheCreationTokens: number;
  cacheReadTokens: number;
  _count: { events: number };
  events: Event[];
  pagination: Pagination;
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
  tool_start: "#312e81",
  tool_use: "#1e3a5f",
  user_prompt: "#14532d",
  assistant_message: "#3f1f45",
  session_start: "#1c2b1c",
  session_end: "#292524",
};

export default function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const socketRef = useRef<Socket | null>(null);
  const eventIdsRef = useRef<Set<number>>(new Set());

  const fetchPage = useCallback(async (pageNum: number, replace = false) => {
    const userId = localStorage.getItem("claude-reporter-uuid");
    const qs = new URLSearchParams({ page: String(pageNum), limit: "100" });
    if (userId) qs.set("userId", userId);

    const res = await fetch(`/api/sessions/${id}?${qs}`);
    if (!res.ok) { router.replace("/"); return; }
    const data: Session = await res.json();

    if (replace) {
      eventIdsRef.current = new Set(data.events.map((e) => e.id));
      setSession(data);
    } else {
      setSession((prev) => {
        if (!prev) return data;
        const newEvents = data.events.filter((e) => !eventIdsRef.current.has(e.id));
        newEvents.forEach((e) => eventIdsRef.current.add(e.id));
        return { ...data, events: [...prev.events, ...newEvents] };
      });
    }
    setPage(pageNum);
  }, [id, router]);

  useEffect(() => {
    fetchPage(1, true).finally(() => setLoading(false));
  }, [fetchPage]);

  // Real-time: subscribe to session room for live events
  useEffect(() => {
    const socket = io({ path: "/socket.io" });
    socketRef.current = socket;
    socket.on("connect", () => socket.emit("subscribe", { sessionId: id }));
    socket.on("event", ({ event }: { event: Event }) => {
      if (eventIdsRef.current.has(event.id)) return;
      eventIdsRef.current.add(event.id);
      setSession((prev) => {
        if (!prev) return prev;
        return { ...prev, events: [...prev.events, event] };
      });
    });
    return () => {
      socket.emit("unsubscribe", { sessionId: id });
      socket.disconnect();
      socketRef.current = null;
    };
  }, [id]);

  async function loadMore() {
    if (!session?.pagination.hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      await fetchPage(page + 1);
    } finally {
      setLoadingMore(false);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
        Loading…
      </div>
    );
  }

  if (!session) return null;

  const totalTokens =
    session.inputTokens + session.outputTokens + session.cacheCreationTokens + session.cacheReadTokens;
  const estimatedCost =
    (session.inputTokens * 3 + session.outputTokens * 15 + session.cacheCreationTokens * 3.75 + session.cacheReadTokens * 0.3) /
    1_000_000;

  const { pagination } = session;

  return (
    <div>
      <div style={{ marginBottom: "1rem" }}>
        <Link href="/" style={{ color: "var(--text-muted)", textDecoration: "none", fontSize: "0.8rem" }}>
          ← Dashboard
        </Link>
      </div>

      {/* Session header */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
          <div>
            <div style={{ fontFamily: "monospace", fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: 4 }}>
              Session ID
            </div>
            <div style={{ fontFamily: "monospace", fontWeight: 600 }}>{session.id}</div>
            {session.projectPath && (
              <div style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginTop: 4 }}>
                {session.projectPath}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Status</div>
              <span className={`badge badge-${session.status}`}>{session.status}</span>
            </div>
            <div>
              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Machine</div>
              <div style={{ fontSize: "0.85rem" }}>{session.machineId}</div>
            </div>
            <div>
              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Model</div>
              <div style={{ fontSize: "0.85rem" }}>{session.model ?? "—"}</div>
            </div>
            <div>
              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Tokens</div>
              <div style={{ fontSize: "0.85rem", color: "var(--yellow)" }}>
                {totalTokens.toLocaleString()}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Events</div>
              <div style={{ fontSize: "0.85rem" }}>
                {session.events.length}
                {pagination.totalEvents > session.events.length && (
                  <span style={{ color: "var(--text-muted)" }}> / {pagination.totalEvents}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Event timeline */}
      <div className="card">
        <div style={{ fontWeight: 600, marginBottom: "0.75rem" }}>
          Event Timeline
          <span style={{ color: "var(--text-muted)", fontWeight: 400, fontSize: "0.75rem", marginLeft: 8 }}>
            Hiển thị {session.events.length} / {pagination.totalEvents} events
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {session.events.map((e) => (
            <div
              key={e.id}
              style={{
                background: EVENT_COLORS[e.eventType] ?? "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "0.5rem 0.75rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: "0.75rem" }}>
                <span>
                  {EVENT_ICONS[e.eventType] ?? "•"}{" "}
                  <strong>{e.toolName ?? e.eventType}</strong>
                  {e.toolDurationMs && (
                    <span style={{ color: "var(--text-muted)", marginLeft: 8 }}>{e.toolDurationMs}ms</span>
                  )}
                </span>
                <span style={{ color: "var(--text-muted)" }}>
                  {new Date(e.timestamp).toLocaleTimeString()}
                  {(e.inputTokens || e.outputTokens) && (
                    <span style={{ marginLeft: 8, color: "var(--yellow)" }}>
                      +{((e.inputTokens ?? 0) + (e.outputTokens ?? 0)).toLocaleString()} tok
                    </span>
                  )}
                </span>
              </div>
              {e.userPrompt && (
                <pre style={{ margin: 0, fontSize: "0.75rem", color: "var(--green)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {e.userPrompt.slice(0, 500)}{e.userPrompt.length > 500 && "…"}
                </pre>
              )}
              {e.assistantMessage && (
                <pre style={{ margin: 0, fontSize: "0.75rem", color: "var(--text)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {e.assistantMessage.slice(0, 500)}{e.assistantMessage.length > 500 && "…"}
                </pre>
              )}
              {e.toolInput && (
                <details style={{ marginTop: 4 }}>
                  <summary style={{ fontSize: "0.7rem", color: "var(--text-muted)", cursor: "pointer" }}>Input</summary>
                  <pre style={{ margin: "4px 0 0", fontSize: "0.7rem", color: "var(--text-muted)", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 200, overflowY: "auto" }}>
                    {e.toolInput.slice(0, 2000)}
                  </pre>
                </details>
              )}
            </div>
          ))}
        </div>

        {/* Load more */}
        {pagination.hasMore && (
          <div style={{ textAlign: "center", marginTop: "1rem" }}>
            <button
              onClick={loadMore}
              disabled={loadingMore}
              style={{
                background: loadingMore ? "var(--surface)" : "var(--accent)",
                color: "#fff", border: "none", borderRadius: 6,
                padding: "0.45rem 1.5rem", fontWeight: 600,
                fontSize: "0.85rem", cursor: loadingMore ? "default" : "pointer",
                opacity: loadingMore ? 0.7 : 1,
              }}
            >
              {loadingMore ? "Đang tải…" : `Tải thêm (${pagination.totalEvents - session.events.length} còn lại)`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
