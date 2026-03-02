/**
 * Custom Next.js server that attaches Socket.io for real-time dashboard updates.
 * Run with: tsx server.ts (dev) or NODE_ENV=production tsx server.ts (prod)
 */
import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server as SocketIOServer } from "socket.io";

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT ?? "3456", 10);
const hostname = "0.0.0.0"; // bind to all interfaces for self-hosted

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Singleton reference exported for API routes to emit events
export let io: SocketIOServer | null = null;

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  // Make io available to API routes via globalThis
  (globalThis as unknown as { __io: SocketIOServer }).__io = io;

  io.on("connection", (socket) => {
    console.log(`[ws] client connected: ${socket.id}`);
    socket.on("disconnect", () => {
      console.log(`[ws] client disconnected: ${socket.id}`);
    });
  });

  httpServer.listen(port, hostname, () => {
    console.log(`> Claude Reporter ready on http://localhost:${port}`);
    console.log(`> Hook endpoint: POST http://localhost:${port}/api/events`);
  });
});
