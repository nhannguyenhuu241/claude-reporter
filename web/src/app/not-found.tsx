import Link from "next/link";

export default function NotFound() {
  return (
    <div style={{
      minHeight: "70vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", textAlign: "center",
      padding: "2rem",
    }}>
      <div style={{
        fontSize: "6rem", fontWeight: 900, lineHeight: 1,
        background: "linear-gradient(135deg, #6366f1, #a78bfa)",
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        marginBottom: "0.5rem",
      }}>
        404
      </div>
      <div style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "0.5rem" }}>
        Trang không tồn tại
      </div>
      <div style={{ color: "var(--text-muted)", fontSize: "0.88rem", maxWidth: 360, marginBottom: "2rem" }}>
        Địa chỉ bạn truy cập không tồn tại hoặc đã bị xóa.
      </div>
      <Link href="/" style={{
        background: "var(--accent)", color: "#fff", borderRadius: 8,
        padding: "0.5rem 1.5rem", fontWeight: 600, fontSize: "0.88rem",
        textDecoration: "none",
      }}>
        ← Về trang chủ
      </Link>
    </div>
  );
}
