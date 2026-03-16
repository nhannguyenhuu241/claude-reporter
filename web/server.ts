/**
 * Custom Next.js server that attaches Socket.io for real-time dashboard updates.
 * Run with: tsx server.ts (dev) or NODE_ENV=production tsx server.ts (prod)
 *
 * Redis adapter: when REDIS_URL is set, Socket.IO uses Redis pub/sub so multiple
 * app instances can share real-time events (horizontal scaling).
 */
import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server as SocketIOServer } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT ?? "3456", 10);
const hostname = "0.0.0.0"; // bind to all interfaces for self-hosted

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Singleton reference exported for API routes to emit events
export let io: SocketIOServer | null = null;

app.prepare().then(async () => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
    : process.env.NEXT_PUBLIC_BASE_URL ?? "*";

  io = new SocketIOServer(httpServer, {
    cors: {
      origin: allowedOrigins,
      methods: ["GET", "POST"],
    },
  });

  // ── Redis adapter for horizontal scaling ──────────────────────────────────
  // When REDIS_URL is set, use Redis pub/sub so multiple app instances share
  // Socket.IO events. Falls back to in-memory (single instance) if not set.
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    try {
      const pubClient = createClient({ url: redisUrl });
      const subClient = pubClient.duplicate();
      await Promise.all([pubClient.connect(), subClient.connect()]);
      io.adapter(createAdapter(pubClient, subClient));
      console.log(`[ws] Redis adapter connected: ${redisUrl}`);

      // Clean disconnect on shutdown
      process.once("SIGTERM", () => { pubClient.quit(); subClient.quit(); });
      process.once("SIGINT",  () => { pubClient.quit(); subClient.quit(); });
    } catch (err) {
      console.warn("[ws] Redis adapter failed, falling back to in-memory:", err);
    }
  } else {
    console.log("[ws] No REDIS_URL — using in-memory adapter (single instance only)");
  }

  // Make io available to API routes via globalThis
  (globalThis as unknown as { __io: SocketIOServer }).__io = io;

  io.on("connection", (socket) => {
    console.log(`[ws] client connected: ${socket.id}`);

    // Clients can subscribe to a specific session room to receive targeted events.
    // e.g. socket.emit("subscribe", { sessionId: "abc123" })
    socket.on("subscribe", ({ sessionId }: { sessionId?: string }) => {
      if (typeof sessionId === "string" && sessionId.length > 0 && sessionId.length <= 128) {
        socket.join(`session:${sessionId}`);
      }
    });

    socket.on("unsubscribe", ({ sessionId }: { sessionId?: string }) => {
      if (typeof sessionId === "string" && sessionId.length > 0) {
        socket.leave(`session:${sessionId}`);
      }
    });

    socket.on("disconnect", () => {
      console.log(`[ws] client disconnected: ${socket.id}`);
    });
  });

  httpServer.listen(port, hostname, () => {
    console.log(`> Claude Reporter ready on http://localhost:${port}`);
    console.log(`> Hook endpoint: POST http://localhost:${port}/api/events`);
  });

  // ── Graceful shutdown ──────────────────────────────────────────────────────
  // On SIGTERM/SIGINT: stop accepting connections, close Socket.io, disconnect DB.
  // This prevents connection leaks when Docker stop / PM2 restart the process.
  async function shutdown(signal: string) {
    console.log(`\n[server] ${signal} received — shutting down gracefully`);
    httpServer.close(async () => {
      io?.close();
      // Disconnect via dynamic import to avoid circular dep at module load time
      try {
        const { prisma } = await import("./src/lib/prisma");
        await prisma.$disconnect();
      } catch { /* ignore */ }
      console.log("[server] clean shutdown complete");
      process.exit(0);
    });
    // Force exit after 10 s if clean shutdown stalls
    setTimeout(() => { console.error("[server] forced exit after 10 s"); process.exit(1); }, 10_000);
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT",  () => shutdown("SIGINT"));
});
