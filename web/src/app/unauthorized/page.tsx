import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      textAlign: "center",
      padding: "2rem",
      position: "relative",
      overflow: "hidden",
      background: "var(--bg)",
    }}>
      {/* Amber dot grid */}
      <div style={{
        position: "absolute",
        inset: 0,
        backgroundImage: `radial-gradient(circle, #eab30818 1px, transparent 1px)`,
        backgroundSize: "40px 40px",
        animation: "grid-move 10s linear infinite",
        pointerEvents: "none",
      }} />

      {/* Amber radial glow */}
      <div style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: 650,
        height: 650,
        borderRadius: "50%",
        background: "radial-gradient(circle, #eab30812 0%, transparent 65%)",
        pointerEvents: "none",
      }} />

      {/* Pulse ring */}
      <div style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: 360,
        height: 360,
        borderRadius: "50%",
        border: "1px solid #eab30825",
        animation: "pulse-ring 3s ease-out infinite",
        pointerEvents: "none",
      }} />

      {/* Content */}
      <div style={{ position: "relative", zIndex: 1, animation: "fade-up 0.5s ease both" }}>

        {/* Lock shield icon */}
        <div style={{
          width: 72,
          height: 72,
          borderRadius: 20,
          background: "linear-gradient(135deg, #1c1507, #2d1f05)",
          border: "1px solid #eab30840",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "2rem",
          margin: "0 auto 1.5rem",
          boxShadow: "0 0 24px #eab30820",
          animation: "float-y 4s ease-in-out infinite",
        }}>
          🔒
        </div>

        {/* Error code */}
        <div style={{ position: "relative", marginBottom: "0.25rem" }}>
          <div style={{
            fontSize: "7rem",
            fontWeight: 900,
            lineHeight: 1,
            background: "linear-gradient(135deg, #eab308, #f97316, #fbbf24)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            letterSpacing: "-4px",
            animation: "flicker 6s ease-in-out infinite",
          }}>401</div>
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0,
            fontSize: "7rem", fontWeight: 900, lineHeight: 1,
            color: "#ef4444", letterSpacing: "-4px", opacity: 0.2,
            animation: "glitch-1 4s steps(1) infinite",
            pointerEvents: "none",
          }}>401</div>
        </div>

        <div style={{ marginBottom: "0.5rem" }}>
          <span style={{ fontSize: "0.72rem", color: "#71717a" }}>
            <span style={{ color: "#eab30860" }}>// </span>
            <span style={{ color: "#fbbf24" }}>UNAUTHORIZED</span>
            {" · "}
            truy cập bị từ chối
          </span>
        </div>

        {/* Auth status card */}
        <div style={{
          background: "#0d0d0f",
          border: "1px solid #2a1f05",
          borderLeft: "3px solid #eab308",
          borderRadius: 10,
          padding: "1.25rem 1.5rem",
          textAlign: "left",
          maxWidth: 480,
          margin: "1.25rem auto",
          boxShadow: "0 0 30px #eab30810",
        }}>
          <div style={{ fontSize: "0.75rem", color: "#71717a", lineHeight: 2 }}>
            <div>
              <span style={{ color: "#eab308" }}>AUTH</span>
              {" "}
              <span style={{ color: "#71717a" }}>checking credentials...</span>
            </div>
            <div>
              <span style={{ color: "#ef4444" }}>FAIL</span>
              {" "}
              <span style={{ color: "#71717a" }}>no valid session token found</span>
            </div>
            <div>
              <span style={{ color: "#ef4444" }}>FAIL</span>
              {" "}
              <span style={{ color: "#71717a" }}>access policy: <span style={{ color: "#fbbf24" }}>DENY</span></span>
            </div>
          </div>

          <div style={{ height: 1, background: "#27272a", margin: "0.75rem 0" }} />

          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            fontSize: "0.72rem",
            color: "#71717a",
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: "50%",
              background: "#ef4444",
              display: "inline-block",
              boxShadow: "0 0 6px #ef4444",
            }} />
            Phiên đăng nhập không hợp lệ hoặc đã hết hạn.
          </div>
        </div>

        {/* Title */}
        <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#e4e4e7", marginBottom: "0.4rem" }}>
          Không có quyền truy cập
        </div>
        <div style={{ color: "#71717a", fontSize: "0.85rem", maxWidth: 380, marginBottom: "1.75rem", lineHeight: 1.6 }}>
          Bạn cần đăng nhập để xem trang này. Phiên làm việc có thể đã hết hạn.
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/login" style={{
            background: "linear-gradient(135deg, #eab308, #f97316)",
            color: "#0a0a0a",
            borderRadius: 8,
            padding: "0.6rem 1.75rem",
            fontWeight: 700,
            fontSize: "0.85rem",
            textDecoration: "none",
            boxShadow: "0 0 20px #eab30830",
          }}>
            → Đăng nhập
          </Link>
          <Link href="/" style={{
            background: "none",
            color: "#71717a",
            border: "1px solid #27272a",
            borderRadius: 8,
            padding: "0.6rem 1.75rem",
            fontWeight: 600,
            fontSize: "0.85rem",
            textDecoration: "none",
          }}>
            Về trang chủ
          </Link>
        </div>
      </div>
    </div>
  );
}
