import Link from "next/link";

export default function NotFound() {
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
      {/* Animated dot grid background */}
      <div style={{
        position: "absolute",
        inset: 0,
        backgroundImage: `radial-gradient(circle, #6366f120 1px, transparent 1px)`,
        backgroundSize: "40px 40px",
        animation: "grid-move 8s linear infinite",
        pointerEvents: "none",
      }} />

      {/* Radial glow center */}
      <div style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: 600,
        height: 600,
        borderRadius: "50%",
        background: "radial-gradient(circle, #6366f112 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      {/* Scanline effect */}
      <div style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 2,
        background: "linear-gradient(90deg, transparent, #6366f130, transparent)",
        animation: "scanline 6s linear infinite",
        pointerEvents: "none",
      }} />

      {/* Content */}
      <div style={{ position: "relative", zIndex: 1, animation: "fade-up 0.6s ease both" }}>

        {/* Terminal header */}
        <div style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.5rem",
          background: "#18181b",
          border: "1px solid #27272a",
          borderRadius: "8px 8px 0 0",
          padding: "0.4rem 1rem",
          fontSize: "0.72rem",
          color: "#71717a",
          marginBottom: 0,
        }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444", display: "inline-block" }} />
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#eab308", display: "inline-block" }} />
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
          <span style={{ marginLeft: "0.5rem" }}>bash — signal_finder.sh</span>
        </div>

        {/* Terminal body */}
        <div style={{
          background: "#0d0d0f",
          border: "1px solid #27272a",
          borderTop: "none",
          borderRadius: "0 0 12px 12px",
          padding: "1.5rem 2rem 2rem",
          textAlign: "left",
          minWidth: 400,
          maxWidth: 560,
          marginBottom: "2.5rem",
          boxShadow: "0 24px 60px rgba(0,0,0,0.5), 0 0 0 1px #6366f110",
        }}>
          <div style={{ fontSize: "0.78rem", color: "#71717a", marginBottom: "1rem", lineHeight: 1.8 }}>
            <span style={{ color: "#22c55e" }}>●</span>
            {" "}
            <span style={{ color: "#6366f1" }}>~/claude-reporter</span>
            {" "}
            <span style={{ color: "#71717a" }}>$</span>
            {" "}
            <span style={{ color: "#e4e4e7" }}>curl -X GET /api/this-page</span>
          </div>

          <div style={{ fontSize: "0.75rem", color: "#71717a", lineHeight: 2, marginBottom: "0.5rem" }}>
            <div><span style={{ color: "#6366f160" }}>&gt;</span> {" "}<span style={{ color: "#eab308" }}>WARN</span> resolving route...</div>
            <div><span style={{ color: "#6366f160" }}>&gt;</span> {" "}<span style={{ color: "#eab308" }}>WARN</span> checking filesystem...</div>
            <div><span style={{ color: "#6366f160" }}>&gt;</span> {" "}<span style={{ color: "#ef4444" }}>ERROR</span> route not found in registry</div>
            <div><span style={{ color: "#6366f160" }}>&gt;</span> {" "}<span style={{ color: "#ef4444" }}>ERROR</span> fallback lookup: <span style={{ color: "#71717a" }}>null</span></div>
          </div>

          <div style={{ height: "1px", background: "#27272a", margin: "1rem 0" }} />

          {/* Giant 404 */}
          <div style={{ position: "relative", textAlign: "center", margin: "0.5rem 0 1rem" }}>
            {/* Base layer */}
            <div style={{
              fontSize: "7rem",
              fontWeight: 900,
              lineHeight: 1,
              background: "linear-gradient(135deg, #6366f1, #a78bfa, #818cf8)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              letterSpacing: "-4px",
              animation: "flicker 4s ease-in-out infinite",
            }}>404</div>
            {/* Glitch layer 1 */}
            <div style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              fontSize: "7rem",
              fontWeight: 900,
              lineHeight: 1,
              color: "#06b6d4",
              letterSpacing: "-4px",
              opacity: 0.4,
              animation: "glitch-1 3s steps(1) infinite",
              pointerEvents: "none",
            }}>404</div>
            {/* Glitch layer 2 */}
            <div style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              fontSize: "7rem",
              fontWeight: 900,
              lineHeight: 1,
              color: "#f97316",
              letterSpacing: "-4px",
              opacity: 0.3,
              animation: "glitch-2 3s steps(1) infinite 0.5s",
              pointerEvents: "none",
            }}>404</div>
          </div>

          <div style={{ textAlign: "center", marginBottom: "0.75rem" }}>
            <span style={{ fontSize: "0.72rem", color: "#71717a" }}>
              <span style={{ color: "#6366f180" }}>// </span>
              <span style={{ color: "#a78bfa" }}>SIGNAL_LOST</span>
              {" · "}
              tín hiệu bị mất
            </span>
          </div>

          <div style={{ textAlign: "center", fontSize: "0.75rem", color: "#71717a" }}>
            <span>$ route_not_found</span>
            <span style={{ animation: "terminal-cursor 1s step-end infinite", color: "#6366f1" }}>█</span>
          </div>
        </div>

        {/* Description */}
        <div style={{
          fontSize: "1.1rem",
          fontWeight: 700,
          color: "#e4e4e7",
          marginBottom: "0.5rem",
        }}>
          Trang không tồn tại
        </div>
        <div style={{
          color: "#71717a",
          fontSize: "0.85rem",
          maxWidth: 380,
          marginBottom: "1.75rem",
          lineHeight: 1.6,
        }}>
          Địa chỉ bạn truy cập không tồn tại hoặc đã bị xóa khỏi hệ thống.
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/" style={{
            background: "linear-gradient(135deg, #6366f1, #7c3aed)",
            color: "#fff",
            borderRadius: 8,
            padding: "0.6rem 1.75rem",
            fontWeight: 600,
            fontSize: "0.85rem",
            textDecoration: "none",
            boxShadow: "0 0 20px #6366f130",
            transition: "all 0.2s",
          }}>
            ← Về trang chủ
          </Link>
          <Link href="/sessions" style={{
            background: "none",
            color: "#71717a",
            border: "1px solid #27272a",
            borderRadius: 8,
            padding: "0.6rem 1.75rem",
            fontWeight: 600,
            fontSize: "0.85rem",
            textDecoration: "none",
            transition: "all 0.2s",
          }}>
            Sessions
          </Link>
        </div>
      </div>
    </div>
  );
}
