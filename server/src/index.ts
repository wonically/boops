import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import { prisma } from "./db";

dotenv.config();

const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";
const PORT = Number(process.env.PORT) || 3001;

const app = express();
app.use(
  cors({
    origin: [CLIENT_URL, "http://localhost:3000"],
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true,
  })
);
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: [CLIENT_URL, "http://localhost:3000"],
    methods: ["GET", "POST"],
  },
});

const INTERNAL_SECRET =
  process.env.BOOPS_INTERNAL_SECRET ||
  process.env.AUTH_SECRET ||
  "boops-dev-secret-change-me-in-production";

interface Player {
  id: string;
  userId?: string;
  name: string;
  x: number;
  y: number;
  color: string;
  auraIntensity: number;
  roomId: string;
  cameraOn: boolean;
}

const rooms = new Map<string, Map<string, Player>>();

async function syncPresence(payload: {
  roomCode: string;
  userId: string;
  socketId: string;
  displayName: string;
  color: string;
  isOnline: boolean;
}) {
  try {
    const res = await fetch(`${CLIENT_URL}/api/internal/presence`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-boops-secret": INTERNAL_SECRET,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      console.warn("presence sync failed", res.status, text);
      return null;
    }
    return res.json();
  } catch (err) {
    console.warn("presence sync error", err);
    return null;
  }
}

io.on("connection", (socket) => {
  console.log(`Connected: ${socket.id}`);

  socket.on(
    "join-room",
    async ({
      roomId,
      name,
      color,
      userId,
    }: {
      roomId: string;
      name: string;
      color: string;
      userId?: string;
    }) => {
      const code = roomId.toLowerCase();

      // Prefer DB-backed rooms; allow ephemeral rooms only if no userId (legacy)
      const dbRoom = await prisma.room.findUnique({ where: { code } });
      if (!dbRoom && userId) {
        socket.emit("join-error", { error: "Room not found. Create it from the dashboard first." });
        return;
      }

      socket.join(code);

      if (!rooms.has(code)) {
        rooms.set(code, new Map());
      }

      const player: Player = {
        id: socket.id,
        userId,
        name,
        x: 400 + Math.random() * 200 - 100,
        y: 300 + Math.random() * 200 - 100,
        color,
        auraIntensity: 0,
        roomId: code,
        cameraOn: false,
      };

      rooms.get(code)!.set(socket.id, player);

      if (userId) {
        await syncPresence({
          roomCode: code,
          userId,
          socketId: socket.id,
          displayName: name,
          color,
          isOnline: true,
        });
      }

      socket.emit("room-state", Array.from(rooms.get(code)!.values()));
      socket.to(code).emit("player-joined", player);
    }
  );

  socket.on("move", ({ x, y, roomId }: { x: number; y: number; roomId: string }) => {
    const code = roomId.toLowerCase();
    const room = rooms.get(code);
    if (!room) return;
    const player = room.get(socket.id);
    if (!player) return;

    player.x = x;
    player.y = y;

    socket.to(code).emit("player-moved", { id: socket.id, x, y });
  });

  socket.on("aura-update", ({ roomId, intensity }: { roomId: string; intensity: number }) => {
    const code = roomId.toLowerCase();
    const room = rooms.get(code);
    if (!room) return;
    const player = room.get(socket.id);
    if (!player) return;

    player.auraIntensity = intensity;
    socket.to(code).emit("player-aura", { id: socket.id, intensity });
  });

  socket.on(
    "camera-state",
    ({ roomId, cameraOn }: { roomId: string; cameraOn: boolean }) => {
      const code = roomId.toLowerCase();
      const room = rooms.get(code);
      if (!room) return;
      const player = room.get(socket.id);
      if (!player) return;

      player.cameraOn = !!cameraOn;
      socket.to(code).emit("player-camera", { id: socket.id, cameraOn: player.cameraOn });
    }
  );

  socket.on("rtc-offer", ({ to, offer }: { to: string; offer: RTCSessionDescriptionInit }) => {
    socket.to(to).emit("rtc-offer", { from: socket.id, offer });
  });

  socket.on("rtc-answer", ({ to, answer }: { to: string; answer: RTCSessionDescriptionInit }) => {
    socket.to(to).emit("rtc-answer", { from: socket.id, answer });
  });

  socket.on("rtc-ice", ({ to, candidate }: { to: string; candidate: RTCIceCandidateInit }) => {
    socket.to(to).emit("rtc-ice", { from: socket.id, candidate });
  });

  socket.on("disconnect", async () => {
    for (const [roomId, room] of rooms.entries()) {
      const player = room.get(socket.id);
      if (!player) continue;

      room.delete(socket.id);
      io.to(roomId).emit("player-left", socket.id);

      if (player.userId) {
        await syncPresence({
          roomCode: roomId,
          userId: player.userId,
          socketId: socket.id,
          displayName: player.name,
          color: player.color,
          isOnline: false,
        });
      }

      if (room.size === 0) rooms.delete(roomId);
      break;
    }
    console.log(`Disconnected: ${socket.id}`);
  });
});

app.get("/health", async (_req, res) => {
  const roomCount = await prisma.room.count().catch(() => -1);
  res.json({ status: "ok", liveRooms: rooms.size, dbRooms: roomCount });
});

app.get("/rooms/:code/members", async (req, res) => {
  const room = await prisma.room.findUnique({
    where: { code: req.params.code.toLowerCase() },
    include: {
      members: {
        select: {
          displayName: true,
          color: true,
          isOnline: true,
          userId: true,
        },
        orderBy: { joinedAt: "asc" },
      },
    },
  });
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  res.json({ room });
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Boops server running on :${PORT}`);
  console.log(`CLIENT_URL=${CLIENT_URL}`);
});
