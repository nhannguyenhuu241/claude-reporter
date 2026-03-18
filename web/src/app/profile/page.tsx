"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type Platform = "linux" | "windows";

interface UserInfo {
  uuid: string;
  email: string;
  role: string;
  department: { id: string; name: string } | null;
}

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [platform, setPlatform] = useState<Platform>("linux");

  const serverUrl = typeof window !== "undefined" ? window.location.origin : "";

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (!d.valid) { router.replace("/login"); return; }
        const uuid = localStorage.getItem("claude-reporter-uuid") ?? d.userId ?? "";
        setUser({ uuid, email: d.email, role: d.role ?? "member", department: d.department ?? null });
      })
      .catch(() => router.replace("/login"))
      .finally(() => setLoading(false));
  }, [router]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    localStorage.removeItem("claude-reporter-uuid");
    localStorage.removeItem("claude-reporter-email");
    localStorage.removeItem("claude-reporter-role");
    router.push("/login");
  }

  function copyUUID() {
    if (!user) return;
    navigator.clipboard.writeText(user.uuid).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // Mask UUID: show first 8 chars then ••••••••-••••-••••
  function maskedUUID(uuid: string) {
    return uuid.slice(0, 8) + "-••••-••••-••••-••••••••••••";
  }

  if (loading) return null;
  if (!user) return null;

  return (
    <div style={{ maxWidth: 520, margin: "3rem auto", padding: "0 1rem" }}>
      {/* Profile card */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
          <div style={{
            width: 52, height: 52, borderRadius: "50%", background: "var(--accent)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 700, fontSize: "1.4rem", color: "#fff", flexShrink: 0,
          }}>
            {user.email[0].toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: "1rem" }}>{user.email}</div>
            <div style={{ display: "flex", gap: "0.4rem", marginTop: 4, flexWrap: "wrap" }}>
              {user.role === "dept_head" && (
                <span style={{
                  background: "rgba(234,179,8,0.12)", border: "1px solid #eab308",
                  borderRadius: 4, padding: "1px 8px", fontSize: "0.68rem", color: "#eab308",
                }}>👑 Trưởng phòng</span>
              )}
              {user.department && (
                <span style={{
                  background: "var(--surface)", border: "1px solid var(--border)",
                  borderRadius: 4, padding: "1px 8px", fontSize: "0.68rem", color: "var(--text-muted)",
                }}>{user.department.name}</span>
              )}
            </div>
          </div>
        </div>

        {/* UUID section */}
        <div style={{ marginBottom: "1.5rem" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 8, fontWeight: 600 }}>
            UUID (dùng cho hook script)
          </div>
          <div style={{
            background: "var(--bg)", border: "1px solid var(--border)",
            borderRadius: 8, padding: "0.75rem 1rem",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.6rem" }}>
              <code style={{
                flex: 1, fontSize: "0.82rem", letterSpacing: "0.02em",
                color: revealed ? "var(--accent)" : "var(--text-muted)",
                wordBreak: "break-all", lineHeight: 1.6,
              }}>
                {revealed ? user.uuid : maskedUUID(user.uuid)}
              </code>
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                onClick={() => setRevealed((v) => !v)}
                style={{
                  background: "var(--surface)", border: "1px solid var(--border)",
                  borderRadius: 5, padding: "0.3rem 0.75rem",
                  color: "var(--text-muted)", cursor: "pointer", fontSize: "0.75rem",
                }}
              >
                {revealed ? "🙈 Ẩn" : "👁 Hiển thị"}
              </button>
              {revealed && (
                <button
                  onClick={copyUUID}
                  style={{
                    background: copied ? "#14532d" : "var(--surface)",
                    border: "1px solid var(--border)", borderRadius: 5,
                    padding: "0.3rem 0.75rem",
                    color: copied ? "var(--green)" : "var(--text-muted)",
                    cursor: "pointer", fontSize: "0.75rem",
                  }}
                >
                  {copied ? "✓ Đã copy" : "Copy"}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Install steps — shown only when UUID revealed */}
        {revealed && (
          <div style={{
            background: "var(--bg)", border: "1px solid var(--border)",
            borderRadius: 8, padding: "0.75rem 1rem", marginBottom: "1.5rem",
          }}>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600, marginBottom: "0.6rem" }}>
              Cài hook trên máy
            </div>
            <div style={{ display: "flex", gap: 0, marginBottom: 8, borderRadius: 5, overflow: "hidden", border: "1px solid var(--border)", width: "fit-content" }}>
              {([["linux", "🐧 macOS / Linux"], ["windows", "🪟 Windows"]] as [Platform, string][]).map(([p, label]) => (
                <button key={p} onClick={() => setPlatform(p)} style={{
                  padding: "3px 10px", fontSize: "0.7rem", fontWeight: platform === p ? 700 : 400,
                  background: platform === p ? "var(--accent)" : "var(--surface)",
                  color: platform === p ? "#fff" : "var(--text-muted)",
                  border: "none", cursor: "pointer",
                }}>{label}</button>
              ))}
            </div>
            {platform === "linux" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <pre style={{ background: "#111", borderRadius: 4, padding: "0.4rem 0.7rem", fontSize: "0.7rem", color: "#86efac", margin: 0, overflowX: "auto" }}>
                  {`echo '${user.uuid}' > ~/.claude-reporter-uuid`}
                </pre>
                <pre style={{ background: "#111", borderRadius: 4, padding: "0.4rem 0.7rem", fontSize: "0.7rem", color: "#86efac", margin: 0, overflowX: "auto" }}>
                  {`curl -s ${serverUrl}/api/install | bash`}
                </pre>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <pre style={{ background: "#111", borderRadius: 4, padding: "0.4rem 0.7rem", fontSize: "0.7rem", color: "#86efac", margin: 0, overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                  {`echo '${user.uuid}' | Out-File "$HOME\\.claude-reporter-uuid" -Encoding UTF8 -NoNewline`}
                </pre>
                <pre style={{ background: "#111", borderRadius: 4, padding: "0.4rem 0.7rem", fontSize: "0.7rem", color: "#86efac", margin: 0, overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                  {`iex (irm '${serverUrl}/api/install/windows')`}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
          <button
            onClick={() => router.push("/")}
            style={{
              background: "var(--accent)", border: "none", borderRadius: 6,
              padding: "0.4rem 1rem", fontSize: "0.8rem",
              color: "#fff", cursor: "pointer", fontWeight: 600,
            }}
          >
            Trang chủ
          </button>
          <button
            onClick={logout}
            style={{
              background: "none", border: "1px solid var(--border)", borderRadius: 6,
              padding: "0.4rem 1rem", fontSize: "0.8rem",
              color: "var(--text-muted)", cursor: "pointer",
            }}
          >
            Đăng xuất
          </button>
        </div>
      </div>
    </div>
  );
}
