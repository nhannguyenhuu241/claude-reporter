"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type State = "idle" | "loading" | "done" | "error";

interface Department {
  id: string;
  name: string;
}

interface RegisterResult {
  uuid: string;
  email: string;
  isNew: boolean;
  department: { id: string; name: string } | null;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [deptsLoading, setDeptsLoading] = useState(true);
  const [state, setState] = useState<State>("idle");
  const [result, setResult] = useState<RegisterResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [checking, setChecking] = useState(true);
  const [existingAccount, setExistingAccount] = useState<{ uuid: string; email: string; role: string } | null>(null);
  const [uuidCopied, setUuidCopied] = useState(false);

  // Check if UUID already valid → show existing account screen instead of redirecting
  useEffect(() => {
    const uuid = localStorage.getItem("claude-reporter-uuid");
    if (!uuid) { setChecking(false); return; }
    fetch(`/api/auth/verify/${uuid}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.valid) {
          localStorage.setItem("claude-reporter-email", d.email);
          localStorage.setItem("claude-reporter-role", d.role ?? "member");
          setExistingAccount({ uuid, email: d.email, role: d.role ?? "member" });
        }
        setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [router]);

  useEffect(() => {
    fetch("/api/departments")
      .then((r) => r.json())
      .then((d) => setDepartments(d.departments ?? []))
      .catch(() => {})
      .finally(() => setDeptsLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("loading");
    try {
      const body: { email: string; departmentId?: string } = { email };
      if (departmentId) body.departmentId = departmentId;

      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error ?? "Something went wrong");
        setState("error");
        return;
      }
      setResult(data);
      setState("done");
      localStorage.setItem("claude-reporter-uuid", data.uuid);
      localStorage.setItem("claude-reporter-email", data.email);
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

  if (checking) return null;

  // ── Already logged in ──────────────────────────────────────────────────────
  if (existingAccount) {
    return (
      <div style={{ maxWidth: 480, margin: "4rem auto" }}>
        <div className="card">
          <div style={{ textAlign: "center", marginBottom: "1.25rem" }}>
            <div style={{
              width: 52, height: 52, borderRadius: "50%", background: "var(--accent)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 700, fontSize: "1.4rem", color: "#fff", margin: "0 auto 0.75rem",
            }}>
              {existingAccount.email[0].toUpperCase()}
            </div>
            <div style={{ fontWeight: 700, fontSize: "1rem" }}>{existingAccount.email}</div>
            {existingAccount.role === "dept_head" && (
              <div style={{ color: "#eab308", fontSize: "0.78rem", marginTop: 4 }}>👑 Trưởng phòng</div>
            )}
          </div>

          <div style={{ marginBottom: "1.25rem" }}>
            <div style={{ color: "var(--text-muted)", fontSize: "0.72rem", marginBottom: 6 }}>UUID của bạn</div>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <code style={{
                flex: 1, background: "var(--bg)", border: "1px solid var(--border)",
                borderRadius: 6, padding: "0.45rem 0.75rem", fontSize: "0.78rem",
                color: "var(--accent)", wordBreak: "break-all",
              }}>
                {existingAccount.uuid}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(existingAccount.uuid).then(() => {
                    setUuidCopied(true);
                    setTimeout(() => setUuidCopied(false), 2000);
                  });
                }}
                style={{
                  background: uuidCopied ? "#14532d" : "var(--surface)",
                  border: "1px solid var(--border)", borderRadius: 6,
                  padding: "0.45rem 0.75rem", color: uuidCopied ? "var(--green)" : "var(--text-muted)",
                  cursor: "pointer", fontSize: "0.78rem", whiteSpace: "nowrap", flexShrink: 0,
                }}
              >
                {uuidCopied ? "✓ Copied" : "Copy"}
              </button>
            </div>
          </div>

          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
            <Link
              href={existingAccount.role === "dept_head" ? "/dept" : "/"}
              style={{
                background: "var(--accent)", color: "#fff", borderRadius: 6,
                padding: "0.45rem 1.25rem", fontWeight: 600, fontSize: "0.85rem",
                textDecoration: "none",
              }}
            >
              Về trang chủ →
            </Link>
            <button
              onClick={() => {
                localStorage.removeItem("claude-reporter-uuid");
                localStorage.removeItem("claude-reporter-email");
                localStorage.removeItem("claude-reporter-role");
                setExistingAccount(null);
              }}
              style={{
                background: "none", border: "1px solid var(--border)", borderRadius: 6,
                padding: "0.45rem 1rem", fontSize: "0.82rem",
                color: "var(--text-muted)", cursor: "pointer",
              }}
            >
              Đăng ký email khác
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 560, margin: "4rem auto" }}>
      <div className="card">
        <h1 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "0.25rem" }}>
          Đăng ký / Lấy UUID
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "1.5rem" }}>
          Nhập email để tạo hoặc lấy lại UUID. Nếu email đã đăng ký, UUID cũ sẽ được trả về.
        </p>

        {state !== "done" && (
          <form onSubmit={handleSubmit}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                disabled={state === "loading"}
                style={{
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  padding: "0.5rem 0.75rem",
                  color: "var(--text)",
                  fontSize: "0.9rem",
                  outline: "none",
                }}
              />

              <div>
                <label
                  htmlFor="dept-select"
                  style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 4 }}
                >
                  Phòng ban
                </label>
                {deptsLoading ? (
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", padding: "0.4rem 0" }}>
                    Đang tải…
                  </div>
                ) : departments.length === 0 ? (
                  <div style={{
                    fontSize: "0.78rem", color: "var(--text-muted)",
                    background: "var(--bg)", border: "1px solid var(--border)",
                    borderRadius: 6, padding: "0.45rem 0.75rem",
                  }}>
                    Chưa có phòng ban nào — liên hệ admin để thiết lập
                  </div>
                ) : (
                  <select
                    id="dept-select"
                    value={departmentId}
                    onChange={(e) => setDepartmentId(e.target.value)}
                    disabled={state === "loading"}
                    style={{
                      width: "100%",
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      padding: "0.5rem 0.75rem",
                      color: departmentId ? "var(--text)" : "var(--text-muted)",
                      fontSize: "0.88rem",
                      outline: "none",
                      cursor: "pointer",
                    }}
                  >
                    <option value="">-- Chọn phòng ban --</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

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
                {state === "loading" ? "Đang tải…" : "Lấy / Tạo UUID"}
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
            {/* Status banner */}
            <div
              style={{
                background: result.isNew ? "rgba(34,197,94,0.1)" : "rgba(99,102,241,0.1)",
                border: `1px solid ${result.isNew ? "var(--green)" : "var(--accent)"}`,
                borderRadius: 6,
                padding: "0.6rem 0.85rem",
                marginBottom: "1rem",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <span style={{ fontSize: "1rem" }}>{result.isNew ? "✅" : "🔑"}</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>
                  {result.isNew ? "Tài khoản mới đã tạo!" : "Tìm thấy tài khoản của bạn"}
                </div>
                <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
                  {result.isNew
                    ? `Đăng ký thành công cho ${result.email}`
                    : `Email ${result.email} đã đăng ký trước đó — đây là UUID của bạn:`}
                  {result.department && (
                    <span style={{ marginLeft: 6 }}>
                      · Phòng ban: <strong style={{ color: "var(--accent)" }}>{result.department.name}</strong>
                    </span>
                  )}
                </div>
              </div>
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

            {/* Onboarding steps */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>

              {/* Step 1 — done */}
              <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
                <div style={{
                  width: 26, height: 26, borderRadius: "50%", background: "var(--green)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "0.8rem", fontWeight: 700, color: "#fff", flexShrink: 0, marginTop: 2,
                }}>✓</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>Đã lấy UUID</div>
                  <div style={{ color: "var(--text-muted)", fontSize: "0.72rem", marginTop: 2, fontFamily: "monospace" }}>
                    {result.uuid}
                  </div>
                </div>
              </div>

              {/* Step 2 — cài hook */}
              <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
                <div style={{
                  width: 26, height: 26, borderRadius: "50%", background: "var(--accent)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "0.8rem", fontWeight: 700, color: "#fff", flexShrink: 0, marginTop: 2,
                }}>2</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: 4 }}>
                    Cài hook trên máy
                  </div>
                  <div style={{ color: "var(--text-muted)", fontSize: "0.72rem", marginBottom: 6 }}>
                    Chạy lệnh sau trong terminal — tự động cài UUID + hook:
                  </div>
                  <pre style={{
                    background: "#000", borderRadius: 4, padding: "0.5rem 0.75rem",
                    fontSize: "0.82rem", color: "#a3e635", margin: 0, overflowX: "auto",
                  }}>
                    {`npx claude-reporter-setup`}
                  </pre>
                  <details style={{ marginTop: 6 }}>
                    <summary style={{ color: "var(--text-muted)", fontSize: "0.7rem", cursor: "pointer" }}>
                      hoặc cài thủ công
                    </summary>
                    <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                      <pre style={{
                        background: "#111", borderRadius: 4, padding: "0.35rem 0.6rem",
                        fontSize: "0.7rem", color: "#86efac", margin: 0, overflowX: "auto",
                      }}>{`echo '${result.uuid}' > ~/.claude-reporter-uuid`}</pre>
                      <pre style={{
                        background: "#111", borderRadius: 4, padding: "0.35rem 0.6rem",
                        fontSize: "0.7rem", color: "#86efac", margin: 0, overflowX: "auto",
                      }}>{`curl -s ${serverUrl}/api/install | bash`}</pre>
                    </div>
                  </details>
                </div>
              </div>

              {/* Step 3 — dùng Claude */}
              <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
                <div style={{
                  width: 26, height: 26, borderRadius: "50%", background: "var(--surface)",
                  border: "1px solid var(--border)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "0.8rem", fontWeight: 700, color: "var(--text-muted)", flexShrink: 0, marginTop: 2,
                }}>3</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>Mở Claude Code và làm việc bình thường</div>
                  <div style={{ color: "var(--text-muted)", fontSize: "0.72rem", marginTop: 2 }}>
                    Session sẽ hiện trên dashboard trong vòng 5 phút.
                  </div>
                </div>
              </div>

            </div>

            <div style={{ marginTop: "1.25rem", display: "flex", gap: "0.75rem", justifyContent: "center", alignItems: "center" }}>
              <Link
                href="/"
                style={{
                  background: "var(--accent)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  padding: "0.5rem 1.25rem",
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  textDecoration: "none",
                  cursor: "pointer",
                }}
              >
                Về trang chủ →
              </Link>
              <button
                onClick={() => { setState("idle"); setResult(null); setEmail(""); setDepartmentId(""); }}
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
