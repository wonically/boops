import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

interface Player {
  id: string;
  name: string;
  x: number;
  y: number;
  color: string;
  auraIntensity: number;
  roomId: string;
}

const rooms = new Map<string, Map<string, Player>>();

io.on("connection", (socket) => {
  console.log(`Connected: ${socket.id}`);

  socket.on("join-room", ({ roomId, name, color }: { roomId: string; name: string; color: string }) => {
    socket.join(roomId);

    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Map());
    }

    const player: Player = {
      id: socket.id,
      name,
      x: 400 + Math.random() * 200 - 100,
      y: 300 + Math.random() * 200 - 100,
      color,
      auraIntensity: 0,
      roomId,
    };

    rooms.get(roomId)!.set(socket.id, player);

    socket.emit("room-state", Array.from(rooms.get(roomId)!.values()));
    socket.to(roomId).emit("player-joined", player);
  });

  socket.on("move", ({ x, y, roomId }: { x: number; y: number; roomId: string }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const player = room.get(socket.id);
    if (!player) return;

    player.x = x;
    player.y = y;

    socket.to(roomId).emit("player-moved", { id: socket.id, x, y });
  });

  socket.on("aura-update", ({ roomId, intensity }: { roomId: string; intensity: number }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const player = room.get(socket.id);
    if (!player) return;

    player.auraIntensity = intensity;
    socket.to(roomId).emit("player-aura", { id: socket.id, intensity });
  });

  socket.on("rtc-offer", ({ to, offer }: { to: string; offer: RTCSessionDescriptionInit }) => {
    socket.to(to).emit("rtc-offer", { from: socket.id, offer });
  });

  socket.on("rtc-answer", ({ to, answer }: { to: string; answer: RTCSessionDescriptionInit }) => {
    socket.to(to).emit("rtc-answer", { from: socket.id, answer });
  });

  socket.on("rtc-ice", ({ to, candidate }: { to: string; candidate: RTCIceCandidateInit }) => {
    socket.to(to).emit("rtc-ice", { from: socket.id, candidate });
  });

  socket.on("disconnect", () => {
    for (const [roomId, room] of rooms.entries()) {
      if (room.has(socket.id)) {
        room.delete(socket.id);
        io.to(roomId).emit("player-left", socket.id);
        if (room.size === 0) rooms.delete(roomId);
        break;
      }
    }
    console.log(`Disconnected: ${socket.id}`);
  });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", rooms: rooms.size });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on :${PORT}`);
});
