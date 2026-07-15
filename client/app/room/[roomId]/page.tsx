"use client";

import { useEffect, useRef, useState, useCallback, type PointerEvent as ReactPointerEvent } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { useTheme } from "@/lib/theme";

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
  const { theme } = useTheme();
  const roomId = params.roomId as string;
  const name = searchParams.get("name") || "anon";
  const color = searchParams.get("color") || "#B8D4F8";
  const userId = searchParams.get("userId") || undefined;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const playersRef = useRef<Map<string, Player>>(new Map());
  const myPosRef = useRef({ x: 400, y: 300 });
  const keysRef = useRef<Set<string>>(new Set());
  const draggingRef = useRef(false);
  const lastEmitRef = useRef(0);
  const animFrameRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodesRef = useRef<Map<string, GainNode>>(new Map());
  const streamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const themeRef = useRef(theme);
  const [muted, setMuted] = useState(false);
  const [connected, setConnected] = useState(false);
  const [playerCount, setPlayerCount] = useState(0);
  const [memberList, setMemberList] = useState<
    { displayName: string; color: string; isOnline: boolean; userId: string }[]
  >([]);

  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  useEffect(() => {
    let cancelled = false;
    const loadMembers = async () => {
      try {
        const res = await fetch(`/api/rooms/${roomId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.room?.members) {
          setMemberList(
            data.room.members.map(
              (m: { displayName: string; color: string; isOnline: boolean; userId: string }) => ({
                displayName: m.displayName,
                color: m.color,
                isOnline: m.isOnline,
                userId: m.userId,
              })
            )
          );
        }
      } catch {
        /* ignore */
      }
    };
    loadMembers();
    const id = setInterval(loadMembers, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [roomId]);

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
      socket.emit("join-room", { roomId, name, color, userId });
    });

    socket.on("join-error", ({ error }: { error: string }) => {
      alert(error);
      window.location.href = "/dashboard";
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
  }, [roomId, name, color, userId]);

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

  const emitMove = useCallback(
    (force = false) => {
      const now = Date.now();
      if (!force && now - lastEmitRef.current < 50) return;
      const pos = myPosRef.current;
      socketRef.current?.emit("move", { x: pos.x, y: pos.y, roomId });
      lastEmitRef.current = now;
    },
    [roomId]
  );

  const canvasPoint = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_WIDTH / rect.width;
    const scaleY = CANVAS_HEIGHT / rect.height;
    return {
      x: Math.max(AVATAR_RADIUS, Math.min(CANVAS_WIDTH - AVATAR_RADIUS, (clientX - rect.left) * scaleX)),
      y: Math.max(AVATAR_RADIUS, Math.min(CANVAS_HEIGHT - AVATAR_RADIUS, (clientY - rect.top) * scaleY)),
    };
  }, []);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      const point = canvasPoint(e.clientX, e.clientY);
      if (!point) return;
      draggingRef.current = true;
      myPosRef.current = point;
      emitMove(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [canvasPoint, emitMove]
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!draggingRef.current) return;
      const point = canvasPoint(e.clientX, e.clientY);
      if (!point) return;
      myPosRef.current = point;
      emitMove();
    },
    [canvasPoint, emitMove]
  );

  const onPointerUp = useCallback((e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    emitMove(true);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  }, [emitMove]);

  // Game loop
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      keysRef.current.add(e.key.toLowerCase());
    };
    const handleKeyUp = (e: KeyboardEvent) => keysRef.current.delete(e.key.toLowerCase());
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    const gameLoop = () => {
      const keys = keysRef.current;
      const pos = myPosRef.current;
      let moved = false;

      // Keyboard only when not dragging
      if (!draggingRef.current) {
        if (keys.has("w") || keys.has("arrowup")) {
          pos.y = Math.max(AVATAR_RADIUS, pos.y - MOVE_SPEED);
          moved = true;
        }
        if (keys.has("s") || keys.has("arrowdown")) {
          pos.y = Math.min(CANVAS_HEIGHT - AVATAR_RADIUS, pos.y + MOVE_SPEED);
          moved = true;
        }
        if (keys.has("a") || keys.has("arrowleft")) {
          pos.x = Math.max(AVATAR_RADIUS, pos.x - MOVE_SPEED);
          moved = true;
        }
        if (keys.has("d") || keys.has("arrowright")) {
          pos.x = Math.min(CANVAS_WIDTH - AVATAR_RADIUS, pos.x + MOVE_SPEED);
          moved = true;
        }
      }

      if (moved) emitMove();

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
  }, [emitMove, updateSpatialAudio]);

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const isDark = themeRef.current === "dark";
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Soft pastel wash
    const wash = ctx.createLinearGradient(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    if (isDark) {
      wash.addColorStop(0, "rgba(90, 58, 85, 0.35)");
      wash.addColorStop(0.5, "rgba(47, 69, 96, 0.3)");
      wash.addColorStop(1, "rgba(47, 74, 66, 0.35)");
    } else {
      wash.addColorStop(0, "rgba(255, 214, 231, 0.45)");
      wash.addColorStop(0.5, "rgba(201, 231, 255, 0.4)");
      wash.addColorStop(1, "rgba(212, 245, 229, 0.45)");
    }
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Grid
    ctx.strokeStyle = isDark ? "rgba(243, 238, 248, 0.06)" : "rgba(61, 53, 80, 0.08)";
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
    ctx.strokeStyle = isDark ? "rgba(184, 212, 248, 0.2)" : "rgba(245, 163, 192, 0.35)";
    ctx.setLineDash([8, 8]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw other players
    for (const player of playersRef.current.values()) {
      drawPlayer(ctx, player, isDark);
    }

    // Draw self
    drawPlayer(ctx, { id: "self", name, x: myPos.x, y: myPos.y, color, auraIntensity: 0 }, isDark);
  }

  function drawPlayer(ctx: CanvasRenderingContext2D, player: Player, isDark: boolean) {
    const { x, y, color: pColor, name: pName, auraIntensity } = player;

    // Aura glow
    const glowRadius = AVATAR_RADIUS + 10 + auraIntensity * 30;
    const gradient = ctx.createRadialGradient(x, y, AVATAR_RADIUS, x, y, glowRadius);
    gradient.addColorStop(0, pColor + "66");
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
    ctx.strokeStyle = isDark ? "rgba(243, 238, 248, 0.45)" : "rgba(255, 255, 255, 0.85)";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Name
    ctx.fillStyle = isDark ? "#f3eef8" : "#3d3550";
    ctx.font = "600 12px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(pName, x, y + AVATAR_RADIUS + 16);
  }

  return (
    <div className="room-shell">
      <div className="page-blob" aria-hidden />
      <div className="room-toolbar">
        <div className={`w-3 h-3 rounded-full ${connected ? "bg-emerald-400" : "bg-rose-400"}`} />
        <span>
          room <strong>{roomId}</strong> · {playerCount} in world
        </span>
        <button
          type="button"
          onClick={() => setMuted(!muted)}
          className={`chip ${muted ? "chip-danger" : ""}`}
        >
          {muted ? "unmute" : "mute"}
        </button>
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(window.location.href)}
          className="chip"
        >
          copy link
        </button>
        <a href="/dashboard" className="chip">
          dashboard
        </a>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 items-center lg:items-start z-[1] w-full max-w-[1400px] justify-center">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="room-canvas"
          style={{ touchAction: "none", cursor: "grab" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />

        <aside
          className="glass-card"
          style={{ maxWidth: "16rem", width: "100%", padding: "1rem" }}
        >
          <p className="label" style={{ marginBottom: "0.75rem" }}>
            room members
          </p>
          <div className="space-y-2">
            {memberList.length === 0 && (
              <p className="brand-subtitle" style={{ margin: 0, fontSize: "0.85rem" }}>
                no members yet
              </p>
            )}
            {memberList.map((m) => (
              <div key={m.userId} className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ background: m.color, opacity: m.isOnline ? 1 : 0.35 }}
                />
                <span style={{ color: "var(--text)", fontSize: "0.9rem" }}>
                  {m.displayName}
                </span>
                <span style={{ color: "var(--text-soft)", fontSize: "0.75rem", marginLeft: "auto" }}>
                  {m.isOnline ? "online" : "away"}
                </span>
              </div>
            ))}
          </div>
        </aside>
      </div>

      <p className="room-hint">drag on the world or use WASD · get closer to hear others</p>
    </div>
  );
}
