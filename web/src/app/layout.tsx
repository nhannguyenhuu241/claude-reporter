import type { Metadata } from "next";
import Link from "next/link";
import { UserBadge } from "@/components/UserBadge";
import "./globals.css";

export const metadata: Metadata = {
  title: "Claude Reporter",
  description: "Real-time Claude Code session monitoring",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <nav
          style={{
            borderBottom: "1px solid var(--border)",
            padding: "0.75rem 1.5rem",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
          }}
        >
          <span style={{ color: "var(--accent)", fontWeight: 700, fontSize: "1.1rem" }}>
            ◆ Claude Reporter
          </span>
          <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
            real-time session monitor
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginLeft: "auto" }}>
            <UserBadge />
          </div>
        </nav>
        <main style={{ maxWidth: 1200, margin: "0 auto", padding: "1.5rem" }}>
          {children}
        </main>
      </body>
    </html>
  );
}
