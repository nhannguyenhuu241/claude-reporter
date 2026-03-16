import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <div style={{
      minHeight: "70vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", textAlign: "center",
      padding: "2rem",
    }}>
      <div style={{
        fontSize: "6rem", fontWeight: 900, lineHeight: 1,
        background: "linear-gradient(135deg, #eab308, #f97316)",
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        marginBottom: "0.5rem",
      }}>
        401
      </div>
      <div style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "0.5rem" }}>
        Không có quyền truy cập
      </div>
      <div style={{ color: "var(--text-muted)", fontSize: "0.88rem", maxWidth: 380, marginBottom: "2rem" }}>
        Bạn cần đăng nhập để xem trang này. Vui lòng đăng nhập và thử lại.
      </div>
      <div style={{ display: "flex", gap: "0.75rem" }}>
        <Link href="/login" style={{
          background: "var(--accent)", color: "#fff", borderRadius: 8,
          padding: "0.5rem 1.5rem", fontWeight: 600, fontSize: "0.88rem",
          textDecoration: "none",
        }}>
          Đăng nhập
        </Link>
        <Link href="/" style={{
          background: "none", color: "var(--text-muted)",
          border: "1px solid var(--border)", borderRadius: 8,
          padding: "0.5rem 1.5rem", fontWeight: 600, fontSize: "0.88rem",
          textDecoration: "none",
        }}>
          Về trang chủ
        </Link>
      </div>
    </div>
  );
}
