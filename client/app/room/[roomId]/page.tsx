"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { io, Socket } from "socket.io-client";

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3001";
const SPATIAL_RADIUS = 300;
const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 800;
const AVATAR_RADIUS = 20;
const MOVE_SPEED = 4;

interface Player {
  id: string;
  name: string;
  x: number;
  y: number;
  color: string;
  auraIntensity: number;
  targetX?: number;
  targetY?: number;
}

export default function RoomPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const roomId = params.roomId as string;
  const name = searchParams.get("name") || "anon";
  const color = searchParams.get("color") || "#4ECDC4";

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const playersRef = useRef<Map<string, Player>>(new Map());
  const myPosRef = useRef({ x: 400, y: 300 });
  const keysRef = useRef<Set<string>>(new Set());
  const animFrameRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodesRef = useRef<Map<string, GainNode>>(new Map());
  const streamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const [muted, setMuted] = useState(false);
  const [connected, setConnected] = useState(false);
  const [playerCount, setPlayerCount] = useState(0);

  const getDistance = (x1: number, y1: number, x2: number, y2: number) =>
    Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);

  const updateSpatialAudio = useCallback(() => {
    const myPos = myPosRef.current;
    for (const [peerId, gainNode] of gainNodesRef.current.entries()) {
      const player = playersRef.current.get(peerId);
      if (!player) continue;
      const dist = getDistance(myPos.x, myPos.y, player.x, player.y);
      const volume = Math.max(0, 1 - dist / SPATIAL_RADIUS);
      gainNode.gain.setTargetAtTime(volume, audioContextRef.current!.currentTime, 0.1);
    }
  }, []);

  useEffect(() => {
    const socket = io(SERVER_URL);
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("join-room", { roomId, name, color });
    });

    socket.on("room-state", (players: Player[]) => {
      for (const p of players) {
        if (p.id === socket.id) {
          myPosRef.current = { x: p.x, y: p.y };
        } else {
          playersRef.current.set(p.id, p);
        }
      }
      setPlayerCount(players.length);
    });

    socket.on("player-joined", (player: Player) => {
      playersRef.current.set(player.id, player);
      setPlayerCount(playersRef.current.size + 1);
      setupPeerConnection(player.id, true);
    });

    socket.on("player-moved", ({ id, x, y }: { id: string; x: number; y: number }) => {
      const player = playersRef.current.get(id);
      if (player) {
        player.targetX = x;
        player.targetY = y;
      }
    });

    socket.on("player-aura", ({ id, intensity }: { id: string; intensity: number }) => {
      const player = playersRef.current.get(id);
      if (player) player.auraIntensity = intensity;
    });

    socket.on("player-left", (id: string) => {
      playersRef.current.delete(id);
      gainNodesRef.current.delete(id);
      const pc = peersRef.current.get(id);
      if (pc) { pc.close(); peersRef.current.delete(id); }
      setPlayerCount(playersRef.current.size + 1);
    });

    socket.on("rtc-offer", async ({ from, offer }: { from: string; offer: RTCSessionDescriptionInit }) => {
      await handleOffer(from, offer);
    });

    socket.on("rtc-answer", async ({ from, answer }: { from: string; answer: RTCSessionDescriptionInit }) => {
      const pc = peersRef.current.get(from);
      if (pc) await pc.setRemoteDescription(answer);
    });

    socket.on("rtc-ice", async ({ from, candidate }: { from: string; candidate: RTCIceCandidateInit }) => {
      const pc = peersRef.current.get(from);
      if (pc) await pc.addIceCandidate(candidate);
    });

    initAudio();

    return () => {
      socket.disconnect();
      for (const pc of peersRef.current.values()) pc.close();
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, [roomId, name, color]);

  async function initAudio() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      audioContextRef.current = new AudioContext();
    } catch (err) {
      console.warn("Mic access denied:", err);
    }
  }

  async function setupPeerConnection(peerId: string, initiator: boolean) {
    if (!streamRef.current || !audioContextRef.current) return;

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    peersRef.current.set(peerId, pc);

    streamRef.current.getTracks().forEach((track) => {
      pc.addTrack(track, streamRef.current!);
    });

    pc.ontrack = (event) => {
      const remoteStream = event.streams[0];
      const source = audioContextRef.current!.createMediaStreamSource(remoteStream);
      const gainNode = audioContextRef.current!.createGain();
      gainNode.gain.value = 0;
      source.connect(gainNode);
      gainNode.connect(audioContextRef.current!.destination);
      gainNodesRef.current.set(peerId, gainNode);
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current?.emit("rtc-ice", { to: peerId, candidate: event.candidate });
      }
    };

    if (initiator) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socketRef.current?.emit("rtc-offer", { to: peerId, offer });
    }
  }

  async function handleOffer(from: string, offer: RTCSessionDescriptionInit) {
    await setupPeerConnection(from, false);
    const pc = peersRef.current.get(from)!;
    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socketRef.current?.emit("rtc-answer", { to: from, answer });
  }

  // Game loop
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => keysRef.current.add(e.key.toLowerCase());
    const handleKeyUp = (e: KeyboardEvent) => keysRef.current.delete(e.key.toLowerCase());
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    let lastEmit = 0;

    const gameLoop = () => {
      const keys = keysRef.current;
      const pos = myPosRef.current;
      let moved = false;

      if (keys.has("w") || keys.has("arrowup")) { pos.y = Math.max(AVATAR_RADIUS, pos.y - MOVE_SPEED); moved = true; }
      if (keys.has("s") || keys.has("arrowdown")) { pos.y = Math.min(CANVAS_HEIGHT - AVATAR_RADIUS, pos.y + MOVE_SPEED); moved = true; }
      if (keys.has("a") || keys.has("arrowleft")) { pos.x = Math.max(AVATAR_RADIUS, pos.x - MOVE_SPEED); moved = true; }
      if (keys.has("d") || keys.has("arrowright")) { pos.x = Math.min(CANVAS_WIDTH - AVATAR_RADIUS, pos.x + MOVE_SPEED); moved = true; }

      if (moved) {
        const now = Date.now();
        if (now - lastEmit > 50) {
          socketRef.current?.emit("move", { x: pos.x, y: pos.y, roomId });
          lastEmit = now;
        }
      }

      // Lerp remote players
      for (const player of playersRef.current.values()) {
        if (player.targetX !== undefined) {
          player.x += (player.targetX - player.x) * 0.15;
          player.y += (player.targetY! - player.y) * 0.15;
        }
      }

      updateSpatialAudio();
      draw();
      animFrameRef.current = requestAnimationFrame(gameLoop);
    };

    animFrameRef.current = requestAnimationFrame(gameLoop);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [roomId, updateSpatialAudio]);

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    for (let x = 0; x < CANVAS_WIDTH; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_HEIGHT); ctx.stroke();
    }
    for (let y = 0; y < CANVAS_HEIGHT; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_WIDTH, y); ctx.stroke();
    }

    // Draw spatial radius indicator for self
    const myPos = myPosRef.current;
    ctx.beginPath();
    ctx.arc(myPos.x, myPos.y, SPATIAL_RADIUS, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.stroke();

    // Draw other players
    for (const player of playersRef.current.values()) {
      drawPlayer(ctx, player);
    }

    // Draw self
    drawPlayer(ctx, { id: "self", name, x: myPos.x, y: myPos.y, color, auraIntensity: 0 });
  }

  function drawPlayer(ctx: CanvasRenderingContext2D, player: Player) {
    const { x, y, color: pColor, name: pName, auraIntensity } = player;

    // Aura glow
    const glowRadius = AVATAR_RADIUS + 10 + auraIntensity * 30;
    const gradient = ctx.createRadialGradient(x, y, AVATAR_RADIUS, x, y, glowRadius);
    gradient.addColorStop(0, pColor + "40");
    gradient.addColorStop(1, pColor + "00");
    ctx.beginPath();
    ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    // Avatar circle
    ctx.beginPath();
    ctx.arc(x, y, AVATAR_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = pColor;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Name
    ctx.fillStyle = "#fff";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(pName, x, y + AVATAR_RADIUS + 16);
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4">
      <div className="flex items-center gap-4 mb-4">
        <div className={`w-3 h-3 rounded-full ${connected ? "bg-green-400" : "bg-red-400"}`} />
        <span className="text-gray-400 text-sm">
          room <span className="text-white font-mono font-bold">{roomId}</span> · {playerCount} online
        </span>
        <button
          onClick={() => setMuted(!muted)}
          className={`px-3 py-1 rounded text-sm ${muted ? "bg-red-600 text-white" : "bg-gray-700 text-gray-300"}`}
        >
          {muted ? "unmute" : "mute"}
        </button>
        <button
          onClick={() => navigator.clipboard.writeText(window.location.href)}
          className="px-3 py-1 rounded text-sm bg-gray-700 text-gray-300 hover:bg-gray-600"
        >
          copy link
        </button>
      </div>

      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="border border-gray-800 rounded-xl bg-gray-900/50"
      />

      <p className="text-gray-500 text-sm mt-4">WASD or arrow keys to move · get closer to hear others</p>
    </div>
  );
}
