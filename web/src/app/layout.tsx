import type { Metadata } from "next";
import { NavBar } from "@/components/NavBar";
import { RefreshProvider } from "@/lib/RefreshContext";
import { ToastProvider } from "@/components/Toast";
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
        <ToastProvider>
          <RefreshProvider>
            <NavBar />
            <main style={{ maxWidth: 1200, margin: "0 auto", padding: "1.5rem" }}>
              {children}
            </main>
          </RefreshProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
