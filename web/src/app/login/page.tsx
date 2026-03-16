"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Mode = "login" | "register";
type State = "idle" | "loading" | "error";
type Platform = "linux" | "windows";

interface Department {
  id: string;
  name: string;
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [deptsLoading, setDeptsLoading] = useState(true);
  const [state, setState] = useState<State>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [checking, setChecking] = useState(true);

  // If already logged in → redirect home
  useEffect(() => {
    const uuid = localStorage.getItem("claude-reporter-uuid");
    if (!uuid) { setChecking(false); return; }
    fetch(`/api/auth/verify/${uuid}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.valid) {
          localStorage.setItem("claude-reporter-email", d.email);
          localStorage.setItem("claude-reporter-role", d.role ?? "member");
          router.replace("/");
        } else {
          setChecking(false);
        }
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
    if (mode === "register" && password !== confirmPassword) {
      setErrorMsg("Mật khẩu nhập lại không khớp");
      setState("error");
      return;
    }
    setState("loading");
    setErrorMsg("");
    try {
      const url = mode === "register" ? "/api/auth/register" : "/api/auth/login";
      const body: Record<string, string> = { email, password };
      if (mode === "register" && departmentId) body.departmentId = departmentId;

      const res = await fetch(url, {
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

      localStorage.setItem("claude-reporter-uuid", data.uuid);
      localStorage.setItem("claude-reporter-email", data.email);
      localStorage.setItem("claude-reporter-role", data.role ?? "member");

      // First-time register → go to profile to see UUID + install steps
      // Login → go home
      router.push(mode === "register" ? "/profile" : "/");
    } catch {
      setErrorMsg("Network error — is the server running?");
      setState("error");
    }
  }

  if (checking) return null;

  return (
    <div style={{ maxWidth: 440, margin: "4rem auto" }}>
      <div className="card">
        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid var(--border)", marginBottom: "1.5rem" }}>
          {(["login", "register"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setState("idle"); setErrorMsg(""); setConfirmPassword(""); }}
              style={{
                flex: 1, padding: "0.6rem", fontWeight: mode === m ? 700 : 400,
                fontSize: "0.88rem", background: "none", border: "none",
                borderBottom: mode === m ? "2px solid var(--accent)" : "2px solid transparent",
                color: mode === m ? "var(--accent)" : "var(--text-muted)",
                cursor: "pointer", marginBottom: -1,
              }}
            >
              {m === "login" ? "Đăng nhập" : "Đăng ký"}
            </button>
          ))}
        </div>

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
                background: "var(--bg)", border: "1px solid var(--border)",
                borderRadius: 6, padding: "0.5rem 0.75rem",
                color: "var(--text)", fontSize: "0.9rem", outline: "none",
              }}
            />

            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "register" ? "Mật khẩu (tối thiểu 6 ký tự)" : "Mật khẩu"}
              required
              disabled={state === "loading"}
              style={{
                background: "var(--bg)", border: "1px solid var(--border)",
                borderRadius: 6, padding: "0.5rem 0.75rem",
                color: "var(--text)", fontSize: "0.9rem", outline: "none",
              }}
            />

            {mode === "register" && (
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Nhập lại mật khẩu"
                required
                disabled={state === "loading"}
                style={{
                  background: "var(--bg)",
                  border: `1px solid ${confirmPassword && confirmPassword !== password ? "var(--red)" : "var(--border)"}`,
                  borderRadius: 6, padding: "0.5rem 0.75rem",
                  color: "var(--text)", fontSize: "0.9rem", outline: "none",
                }}
              />
            )}

            {mode === "register" && (
              <div>
                <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 4 }}>
                  Phòng ban
                </label>
                {deptsLoading ? (
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", padding: "0.4rem 0" }}>Đang tải…</div>
                ) : departments.length === 0 ? (
                  <div style={{
                    fontSize: "0.78rem", color: "var(--text-muted)",
                    background: "var(--bg)", border: "1px solid var(--border)",
                    borderRadius: 6, padding: "0.45rem 0.75rem",
                  }}>
                    Chưa có phòng ban — liên hệ admin để thiết lập
                  </div>
                ) : (
                  <select
                    value={departmentId}
                    onChange={(e) => setDepartmentId(e.target.value)}
                    disabled={state === "loading"}
                    style={{
                      width: "100%", background: "var(--bg)", border: "1px solid var(--border)",
                      borderRadius: 6, padding: "0.5rem 0.75rem",
                      color: departmentId ? "var(--text)" : "var(--text-muted)",
                      fontSize: "0.88rem", outline: "none", cursor: "pointer",
                    }}
                  >
                    <option value="">-- Chọn phòng ban --</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={state === "loading"}
              style={{
                background: "var(--accent)", color: "#fff", border: "none",
                borderRadius: 6, padding: "0.5rem 1rem", fontWeight: 600,
                cursor: "pointer", fontSize: "0.85rem",
                opacity: state === "loading" ? 0.6 : 1, marginTop: 4,
              }}
            >
              {state === "loading" ? "Đang xử lý…" : mode === "login" ? "Đăng nhập" : "Tạo tài khoản"}
            </button>
          </div>

          {state === "error" && (
            <p style={{ color: "var(--red)", fontSize: "0.8rem", marginTop: "0.5rem" }}>{errorMsg}</p>
          )}
        </form>

        <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", textAlign: "center", marginTop: "1rem" }}>
          {mode === "login" ? (
            <>Chưa có tài khoản?{" "}
              <button onClick={() => { setMode("register"); setState("idle"); setErrorMsg(""); }}
                style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: "0.75rem", padding: 0 }}>
                Đăng ký ngay
              </button>
            </>
          ) : (
            <>Đã có tài khoản?{" "}
              <button onClick={() => { setMode("login"); setState("idle"); setErrorMsg(""); }}
                style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: "0.75rem", padding: 0 }}>
                Đăng nhập
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
