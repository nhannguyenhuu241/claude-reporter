"use client";

import { useState } from "react";

type State = "idle" | "loading" | "done" | "error";

interface RegisterResult {
  uuid: string;
  email: string;
  isNew: boolean;
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>("idle");
  const [result, setResult] = useState<RegisterResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("loading");
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error ?? "Something went wrong");
        setState("error");
        return;
      }
      setResult(data);
      setState("done");
      // Persist UUID in localStorage for "Mine" filter on dashboard
      localStorage.setItem("claude-reporter-uuid", data.uuid);
    } catch {
      setErrorMsg("Network error — is the server running?");
      setState("error");
    }
  }

  function copyUUID() {
    if (!result) return;
    navigator.clipboard.writeText(result.uuid).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const serverUrl =
    typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div style={{ maxWidth: 560, margin: "4rem auto" }}>
      <div className="card">
        <h1 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "0.25rem" }}>
          Đăng ký máy của bạn
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "1.5rem" }}>
          Nhập email để nhận UUID định danh. UUID này gắn với tất cả
          Claude sessions chạy trên máy bạn.
        </p>

        {state !== "done" && (
          <form onSubmit={handleSubmit}>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                disabled={state === "loading"}
                style={{
                  flex: 1,
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  padding: "0.5rem 0.75rem",
                  color: "var(--text)",
                  fontSize: "0.9rem",
                  outline: "none",
                }}
              />
              <button
                type="submit"
                disabled={state === "loading"}
                style={{
                  background: "var(--accent)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  padding: "0.5rem 1rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontSize: "0.85rem",
                  opacity: state === "loading" ? 0.6 : 1,
                }}
              >
                {state === "loading" ? "Đang tạo…" : "Lấy UUID"}
              </button>
            </div>
            {state === "error" && (
              <p style={{ color: "var(--red)", fontSize: "0.8rem", marginTop: "0.5rem" }}>
                {errorMsg}
              </p>
            )}
          </form>
        )}

        {state === "done" && result && (
          <div>
            {/* Status badge */}
            <div style={{ marginBottom: "1rem" }}>
              <span className={`badge ${result.isNew ? "badge-active" : "badge-completed"}`}>
                {result.isNew ? "Tài khoản mới" : "Chào mừng trở lại"}
              </span>
              <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginLeft: 8 }}>
                {result.email}
              </span>
            </div>

            {/* UUID display */}
            <div style={{ marginBottom: "1.5rem" }}>
              <div style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginBottom: 6 }}>
                UUID của bạn
              </div>
              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  alignItems: "center",
                }}
              >
                <code
                  style={{
                    flex: 1,
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    padding: "0.5rem 0.75rem",
                    fontSize: "0.85rem",
                    color: "var(--accent)",
                    wordBreak: "break-all",
                  }}
                >
                  {result.uuid}
                </code>
                <button
                  onClick={copyUUID}
                  style={{
                    background: copied ? "#14532d" : "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    padding: "0.5rem 0.75rem",
                    color: copied ? "var(--green)" : "var(--text-muted)",
                    cursor: "pointer",
                    fontSize: "0.8rem",
                    whiteSpace: "nowrap",
                  }}
                >
                  {copied ? "✓ Đã copy" : "Copy"}
                </button>
              </div>
            </div>

            {/* Setup instructions */}
            <div
              style={{
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "1rem",
              }}
            >
              <div style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: "0.75rem" }}>
                Cài đặt trên máy bạn
              </div>

              {/* Primary: npx */}
              <div style={{ marginBottom: "1rem" }}>
                <div style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginBottom: 4 }}>
                  Chạy lệnh này trong terminal rồi dán UUID khi được hỏi
                </div>
                <pre
                  style={{
                    background: "#000",
                    borderRadius: 4,
                    padding: "0.5rem 0.75rem",
                    fontSize: "0.8rem",
                    color: "#a3e635",
                    margin: 0,
                    overflowX: "auto",
                  }}
                >
                  {`npx claude-reporter-setup`}
                </pre>
              </div>

              {/* Divider */}
              <div style={{ color: "var(--text-muted)", fontSize: "0.7rem", marginBottom: "0.75rem", textAlign: "center" }}>
                — hoặc cài thủ công —
              </div>

              {/* Manual step 1 */}
              <div style={{ marginBottom: "0.6rem" }}>
                <div style={{ color: "var(--text-muted)", fontSize: "0.7rem", marginBottom: 3 }}>
                  1. Lưu UUID
                </div>
                <pre
                  style={{
                    background: "#111",
                    borderRadius: 4,
                    padding: "0.4rem 0.6rem",
                    fontSize: "0.72rem",
                    color: "#86efac",
                    margin: 0,
                    overflowX: "auto",
                  }}
                >
                  {`echo '${result.uuid}' > ~/.claude-reporter-uuid`}
                </pre>
              </div>

              {/* Manual step 2 */}
              <div>
                <div style={{ color: "var(--text-muted)", fontSize: "0.7rem", marginBottom: 3 }}>
                  2. Cài hook
                </div>
                <pre
                  style={{
                    background: "#111",
                    borderRadius: 4,
                    padding: "0.4rem 0.6rem",
                    fontSize: "0.72rem",
                    color: "#86efac",
                    margin: 0,
                    overflowX: "auto",
                  }}
                >
                  {`curl -s ${serverUrl}/api/install | bash`}
                </pre>
              </div>
            </div>

            <div style={{ marginTop: "1rem", textAlign: "center" }}>
              <button
                onClick={() => { setState("idle"); setResult(null); setEmail(""); }}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  fontSize: "0.8rem",
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                Đăng ký email khác
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
