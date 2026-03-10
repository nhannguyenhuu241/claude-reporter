"use client";

import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import Link from "next/link";
import { UserBadge } from "@/components/UserBadge";

function AdminNav() {
  return (
    <nav
      style={{
        borderBottom: "1px solid #7c3aed44",
        background: "rgba(109,40,217,0.06)",
        padding: "0.75rem 1.5rem",
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
      }}
    >
      <Link href="/admin" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <span style={{ color: "#a78bfa", fontWeight: 700, fontSize: "1.1rem" }}>◆ Claude Reporter</span>
        <span style={{
          background: "rgba(167,139,250,0.15)", border: "1px solid rgba(167,139,250,0.4)",
          borderRadius: 4, padding: "1px 8px", fontSize: "0.68rem", color: "#a78bfa",
        }}>
          ADMIN
        </span>
      </Link>

      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginLeft: "1rem" }}>
        {[
          { href: "/admin", label: "Dashboard" },
          { href: "/admin#departments", label: "Phòng ban" },
          { href: "/admin#users", label: "Users" },
        ].map((l) => (
          <Link
            key={l.href}
            href={l.href}
            style={{
              color: "var(--text-muted)", fontSize: "0.8rem", textDecoration: "none",
              padding: "2px 8px", borderRadius: 4,
            }}
          >
            {l.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

function MemberNav() {
  return (
    <nav
      style={{
        borderBottom: "1px solid var(--border)",
        padding: "0.75rem 1.5rem",
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
      }}
    >
      <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <span style={{ color: "var(--accent)", fontWeight: 700, fontSize: "1.1rem" }}>◆ Claude Reporter</span>
      </Link>
      <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>real-time session monitor</span>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginLeft: "auto" }}>
        <UserBadge />
      </div>
    </nav>
  );
}

export function NavBar() {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    setIsAdmin(localStorage.getItem("_cr_admin") === "1");
  }, [pathname]);

  if (pathname.startsWith("/admin") || isAdmin) return <AdminNav />;
  return <MemberNav />;
}
