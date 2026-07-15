"use client";

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useParams, useSearchParams } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { useTheme } from "@/lib/theme";

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3001";
const SPATIAL_RADIUS = 280;
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
  cameraOn?: boolean;
  targetX?: number;
  targetY?: number;
}

type SpatialChain = {
  gain: GainNode;
  pan: StereoPannerNode;
};

type VideoBubble = {
  id: string;
  name: string;
  color: string;
  stream: MediaStream;
  mirrored: boolean;
};

function distance(x1: number, y1: number, x2: number, y2: number) {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

/** 1 when overlapping, 0 at/ beyond hearing range. Squared falloff = much louder up close. */
function proximityVolume(dist: number) {
  if (dist >= SPATIAL_RADIUS) return 0;
  const t = 1 - dist / SPATIAL_RADIUS;
  return t * t;
}

function proximityPan(myX: number, theirX: number) {
  return Math.max(-1, Math.min(1, (theirX - myX) / SPATIAL_RADIUS));
}

function VideoBubbleEl({
  bubble,
  videoRef,
}: {
  bubble: VideoBubble;
  videoRef: (el: HTMLVideoElement | null) => void;
}) {
  const localRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = localRef.current;
    if (!el) return;
    el.srcObject = bubble.stream;
    void el.play().catch(() => undefined);
  }, [bubble.stream]);

  return (
    <div
      className="video-bubble"
      data-bubble-id={bubble.id}
      style={{ borderColor: bubble.color, opacity: 0, transform: "translate(-50%, -120%) scale(0.5)" }}
    >
      <video
        ref={(el) => {
          localRef.current = el;
          videoRef(el);
        }}
        className="video-bubble-media"
        autoPlay
        playsInline
        muted={bubble.mirrored}
        style={bubble.mirrored ? { transform: "scaleX(-1)" } : undefined}
      />
      <span className="video-bubble-name">{bubble.name}</span>
    </div>
  );
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
  const worldRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const playersRef = useRef<Map<string, Player>>(new Map());
  const myPosRef = useRef({ x: 400, y: 300 });
  const keysRef = useRef<Set<string>>(new Set());
  const draggingRef = useRef(false);
  const lastEmitRef = useRef(0);
  const animFrameRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const spatialRef = useRef<Map<string, SpatialChain>>(new Map());
  const streamRef = useRef<MediaStream | null>(null);
  const localVideoTrackRef = useRef<MediaStreamTrack | null>(null);
  const localPreviewStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteVideoStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const mutedRef = useRef(false);
  const cameraOnRef = useRef(false);
  const themeRef = useRef(theme);
  const makingOfferRef = useRef<Map<string, boolean>>(new Map());

  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [micReady, setMicReady] = useState(false);
  const [connected, setConnected] = useState(false);
  const [playerCount, setPlayerCount] = useState(0);
  const [videoBubbles, setVideoBubbles] = useState<VideoBubble[]>([]);
  const [memberList, setMemberList] = useState<
    { displayName: string; color: string; isOnline: boolean; userId: string }[]
  >([]);

  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  useEffect(() => {
    mutedRef.current = muted;
    streamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
  }, [muted]);

  useEffect(() => {
    cameraOnRef.current = cameraOn;
  }, [cameraOn]);

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

  const syncVideoBubbles = useCallback(() => {
    const next: VideoBubble[] = [];

    if (cameraOnRef.current && localPreviewStreamRef.current) {
      next.push({
        id: "self",
        name,
        color,
        stream: localPreviewStreamRef.current,
        mirrored: true,
      });
    }

    for (const [peerId, stream] of remoteVideoStreamsRef.current.entries()) {
      const player = playersRef.current.get(peerId);
      if (!player?.cameraOn) continue;
      if (!stream.getVideoTracks().some((t) => t.readyState === "live" && t.enabled)) continue;
      next.push({
        id: peerId,
        name: player.name,
        color: player.color,
        stream,
        mirrored: false,
      });
    }

    setVideoBubbles((prev) => {
      if (
        prev.length === next.length &&
        prev.every(
          (p, i) =>
            p.id === next[i].id &&
            p.stream.id === next[i].stream.id &&
            p.name === next[i].name
        )
      ) {
        return prev;
      }
      return next;
    });
  }, [name, color]);

  const updateSpatialAudio = useCallback(() => {
    const ctx = audioContextRef.current;
    if (!ctx) return;
    if (ctx.state === "suspended") {
      void ctx.resume();
    }

    const myPos = myPosRef.current;
    for (const [peerId, chain] of spatialRef.current.entries()) {
      const player = playersRef.current.get(peerId);
      if (!player) {
        chain.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
        continue;
      }
      const dist = distance(myPos.x, myPos.y, player.x, player.y);
      const volume = proximityVolume(dist);
      const pan = proximityPan(myPos.x, player.x);
      chain.gain.gain.setTargetAtTime(volume, ctx.currentTime, 0.08);
      chain.pan.pan.setTargetAtTime(pan, ctx.currentTime, 0.08);
      player.auraIntensity = volume;
    }
  }, []);

  const updateBubblePositions = useCallback(() => {
    const canvas = canvasRef.current;
    const world = worldRef.current;
    if (!canvas || !world) return;

    const canvasRect = canvas.getBoundingClientRect();
    const worldRect = world.getBoundingClientRect();
    const scaleX = canvasRect.width / CANVAS_WIDTH;
    const scaleY = canvasRect.height / CANVAS_HEIGHT;
    const offsetX = canvasRect.left - worldRect.left;
    const offsetY = canvasRect.top - worldRect.top;
    const myPos = myPosRef.current;

    const nodes = world.querySelectorAll<HTMLElement>("[data-bubble-id]");
    nodes.forEach((node) => {
      const id = node.dataset.bubbleId;
      if (!id) return;

      let x: number;
      let y: number;
      let volume: number;

      if (id === "self") {
        x = myPos.x;
        y = myPos.y;
        volume = 1;
      } else {
        const player = playersRef.current.get(id);
        if (!player) {
          node.style.opacity = "0";
          return;
        }
        x = player.x;
        y = player.y;
        volume = proximityVolume(distance(myPos.x, myPos.y, x, y));
      }

      const left = offsetX + x * scaleX;
      const top = offsetY + y * scaleY;
      const scale = 0.55 + volume * 0.55;
      const opacity = id === "self" ? 1 : volume < 0.02 ? 0 : 0.25 + volume * 0.75;

      node.style.left = `${left}px`;
      node.style.top = `${top}px`;
      node.style.opacity = String(opacity);
      node.style.transform = `translate(-50%, -120%) scale(${scale})`;
      node.style.pointerEvents = opacity < 0.05 ? "none" : "auto";
      node.style.zIndex = String(10 + Math.round(volume * 20));
    });
  }, []);

  async function ensureAudio() {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    if (audioContextRef.current.state === "suspended") {
      await audioContextRef.current.resume();
    }
    if (!streamRef.current) {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      stream.getAudioTracks().forEach((track) => {
        track.enabled = !mutedRef.current;
      });
      setMicReady(true);
    }
    return { ctx: audioContextRef.current, stream: streamRef.current };
  }

  function attachRemoteAudio(peerId: string, remoteStream: MediaStream) {
    const ctx = audioContextRef.current;
    if (!ctx) return;

    const audioTracks = remoteStream.getAudioTracks();
    if (audioTracks.length === 0) return;

    const existing = spatialRef.current.get(peerId);
    if (existing) {
      try {
        existing.gain.disconnect();
        existing.pan.disconnect();
      } catch {
        /* already disconnected */
      }
    }

    const audioOnly = new MediaStream(audioTracks);
    const source = ctx.createMediaStreamSource(audioOnly);
    const gain = ctx.createGain();
    const pan = ctx.createStereoPanner();
    gain.gain.value = 0;
    pan.pan.value = 0;
    source.connect(gain);
    gain.connect(pan);
    pan.connect(ctx.destination);
    spatialRef.current.set(peerId, { gain, pan });
  }

  function attachRemoteVideo(peerId: string, track: MediaStreamTrack, stream?: MediaStream) {
    const videoStream = stream?.getVideoTracks().length
      ? stream
      : new MediaStream([track]);

    remoteVideoStreamsRef.current.set(peerId, videoStream);
    const player = playersRef.current.get(peerId);
    if (player) player.cameraOn = true;

    track.onended = () => {
      remoteVideoStreamsRef.current.delete(peerId);
      const p = playersRef.current.get(peerId);
      if (p) p.cameraOn = false;
      syncVideoBubbles();
    };

    syncVideoBubbles();
  }

  async function renegotiatePeer(peerId: string) {
    const pc = peersRef.current.get(peerId);
    if (!pc) return;
    if (makingOfferRef.current.get(peerId)) return;

    try {
      makingOfferRef.current.set(peerId, true);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socketRef.current?.emit("rtc-offer", { to: peerId, offer });
    } catch (err) {
      console.warn("renegotiate failed", peerId, err);
    } finally {
      makingOfferRef.current.set(peerId, false);
    }
  }

  async function setupPeerConnection(peerId: string, initiator: boolean) {
    if (peersRef.current.has(peerId)) return;

    let stream: MediaStream;
    try {
      ({ stream } = await ensureAudio());
    } catch (err) {
      console.warn("Mic access denied:", err);
      setMicReady(false);
      return;
    }

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    peersRef.current.set(peerId, pc);

    stream.getTracks().forEach((track) => {
      pc.addTrack(track, stream);
    });

    if (localVideoTrackRef.current && localVideoTrackRef.current.readyState === "live") {
      pc.addTrack(localVideoTrackRef.current, stream);
    }

    pc.ontrack = (event) => {
      const remoteStream = event.streams[0] || new MediaStream([event.track]);
      if (event.track.kind === "audio") {
        attachRemoteAudio(peerId, remoteStream);
      } else if (event.track.kind === "video") {
        attachRemoteVideo(peerId, event.track, remoteStream);
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current?.emit("rtc-ice", { to: peerId, candidate: event.candidate });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        pc.close();
        peersRef.current.delete(peerId);
        spatialRef.current.delete(peerId);
        remoteVideoStreamsRef.current.delete(peerId);
        syncVideoBubbles();
      }
    };

    if (initiator) {
      await renegotiatePeer(peerId);
    }
  }

  async function handleOffer(from: string, offer: RTCSessionDescriptionInit) {
    let pc = peersRef.current.get(from);
    if (!pc) {
      await setupPeerConnection(from, false);
      pc = peersRef.current.get(from);
    }
    if (!pc) return;

    const polite = (socketRef.current?.id || "") > from;
    const offerCollision =
      makingOfferRef.current.get(from) || pc.signalingState !== "stable";

    if (offerCollision) {
      if (!polite) return;
      try {
        await pc.setLocalDescription({ type: "rollback" });
      } catch {
        /* ignore */
      }
    }

    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socketRef.current?.emit("rtc-answer", { to: from, answer });
  }

  async function enableCamera() {
    setCameraError("");
    try {
      await ensureAudio();
      const cam = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 320 },
          height: { ideal: 240 },
        },
        audio: false,
      });
      const videoTrack = cam.getVideoTracks()[0];
      if (!videoTrack) throw new Error("No video track");

      localVideoTrackRef.current = videoTrack;
      localPreviewStreamRef.current = new MediaStream([videoTrack]);
      streamRef.current?.addTrack(videoTrack);

      for (const [peerId, pc] of peersRef.current.entries()) {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender) {
          await sender.replaceTrack(videoTrack);
        } else if (streamRef.current) {
          pc.addTrack(videoTrack, streamRef.current);
        }
        await renegotiatePeer(peerId);
      }

      setCameraOn(true);
      cameraOnRef.current = true;
      socketRef.current?.emit("camera-state", { roomId, cameraOn: true });
      syncVideoBubbles();
    } catch (err) {
      console.warn("Camera access denied:", err);
      setCameraError("allow camera to show video");
      setCameraOn(false);
      cameraOnRef.current = false;
    }
  }

  async function disableCamera() {
    const track = localVideoTrackRef.current;
    if (track) {
      track.stop();
      streamRef.current?.getVideoTracks().forEach((t) => {
        streamRef.current?.removeTrack(t);
        t.stop();
      });
      localVideoTrackRef.current = null;
      localPreviewStreamRef.current = null;

      for (const [peerId, pc] of peersRef.current.entries()) {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender) {
          await sender.replaceTrack(null);
        }
        await renegotiatePeer(peerId);
      }
    }

    setCameraOn(false);
    cameraOnRef.current = false;
    socketRef.current?.emit("camera-state", { roomId, cameraOn: false });
    syncVideoBubbles();
  }

  const toggleCamera = useCallback(async () => {
    if (cameraOnRef.current) {
      await disableCamera();
    } else {
      await enableCamera();
    }
  }, [roomId]);

  useEffect(() => {
    const socket = io(SERVER_URL, {
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("join-room", { roomId, name, color, userId });
    });

    socket.on("disconnect", () => setConnected(false));

    socket.on("join-error", ({ error }: { error: string }) => {
      alert(error);
      window.location.href = "/dashboard";
    });

    socket.on("room-state", async (players: Player[]) => {
      for (const p of players) {
        if (p.id === socket.id) {
          myPosRef.current = { x: p.x, y: p.y };
        } else {
          playersRef.current.set(p.id, { ...p, cameraOn: !!p.cameraOn });
        }
      }
      setPlayerCount(players.length);
      syncVideoBubbles();

      for (const p of players) {
        if (p.id !== socket.id) {
          await setupPeerConnection(p.id, true);
        }
      }
    });

    socket.on("player-joined", (player: Player) => {
      playersRef.current.set(player.id, { ...player, cameraOn: !!player.cameraOn });
      setPlayerCount(playersRef.current.size + 1);
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

    socket.on("player-camera", ({ id, cameraOn: on }: { id: string; cameraOn: boolean }) => {
      const player = playersRef.current.get(id);
      if (player) player.cameraOn = on;
      if (!on) {
        remoteVideoStreamsRef.current.delete(id);
      }
      syncVideoBubbles();
    });

    socket.on("player-left", (id: string) => {
      playersRef.current.delete(id);
      const chain = spatialRef.current.get(id);
      if (chain) {
        try {
          chain.gain.disconnect();
          chain.pan.disconnect();
        } catch {
          /* ignore */
        }
        spatialRef.current.delete(id);
      }
      const pc = peersRef.current.get(id);
      if (pc) {
        pc.close();
        peersRef.current.delete(id);
      }
      remoteVideoStreamsRef.current.delete(id);
      syncVideoBubbles();
      setPlayerCount(playersRef.current.size + 1);
    });

    socket.on("rtc-offer", async ({ from, offer }: { from: string; offer: RTCSessionDescriptionInit }) => {
      await handleOffer(from, offer);
    });

    socket.on("rtc-answer", async ({ from, answer }: { from: string; answer: RTCSessionDescriptionInit }) => {
      const pc = peersRef.current.get(from);
      if (pc) {
        try {
          await pc.setRemoteDescription(answer);
        } catch {
          /* ignore glare */
        }
      }
    });

    socket.on("rtc-ice", async ({ from, candidate }: { from: string; candidate: RTCIceCandidateInit }) => {
      const pc = peersRef.current.get(from);
      if (pc && candidate) {
        try {
          await pc.addIceCandidate(candidate);
        } catch {
          /* ignore late candidates */
        }
      }
    });

    void ensureAudio().catch((err) => console.warn("Mic access denied:", err));

    return () => {
      socket.disconnect();
      for (const pc of peersRef.current.values()) pc.close();
      peersRef.current.clear();
      spatialRef.current.clear();
      remoteVideoStreamsRef.current.clear();
      localVideoTrackRef.current?.stop();
      localVideoTrackRef.current = null;
      localPreviewStreamRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (audioContextRef.current) {
        void audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, name, color, userId]);

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
      void ensureAudio().catch(() => undefined);
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

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      emitMove(true);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
    },
    [emitMove]
  );

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

      for (const player of playersRef.current.values()) {
        if (player.targetX !== undefined) {
          player.x += (player.targetX - player.x) * 0.15;
          player.y += (player.targetY! - player.y) * 0.15;
        }
      }

      updateSpatialAudio();
      draw();
      updateBubblePositions();
      animFrameRef.current = requestAnimationFrame(gameLoop);
    };

    animFrameRef.current = requestAnimationFrame(gameLoop);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [emitMove, updateSpatialAudio, updateBubblePositions]);

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const isDark = themeRef.current === "dark";
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

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

    ctx.strokeStyle = isDark ? "rgba(243, 238, 248, 0.06)" : "rgba(61, 53, 80, 0.08)";
    for (let x = 0; x < CANVAS_WIDTH; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
      ctx.stroke();
    }
    for (let y = 0; y < CANVAS_HEIGHT; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y);
      ctx.stroke();
    }

    const myPos = myPosRef.current;
    const hearFill = ctx.createRadialGradient(
      myPos.x,
      myPos.y,
      AVATAR_RADIUS,
      myPos.x,
      myPos.y,
      SPATIAL_RADIUS
    );
    if (isDark) {
      hearFill.addColorStop(0, "rgba(184, 212, 248, 0.22)");
      hearFill.addColorStop(0.55, "rgba(184, 212, 248, 0.08)");
      hearFill.addColorStop(1, "rgba(184, 212, 248, 0)");
    } else {
      hearFill.addColorStop(0, "rgba(245, 163, 192, 0.28)");
      hearFill.addColorStop(0.55, "rgba(245, 163, 192, 0.1)");
      hearFill.addColorStop(1, "rgba(245, 163, 192, 0)");
    }
    ctx.beginPath();
    ctx.arc(myPos.x, myPos.y, SPATIAL_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = hearFill;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(myPos.x, myPos.y, SPATIAL_RADIUS, 0, Math.PI * 2);
    ctx.strokeStyle = isDark ? "rgba(184, 212, 248, 0.28)" : "rgba(245, 163, 192, 0.4)";
    ctx.setLineDash([8, 8]);
    ctx.stroke();
    ctx.setLineDash([]);

    for (const player of playersRef.current.values()) {
      const dist = distance(myPos.x, myPos.y, player.x, player.y);
      drawPlayer(ctx, player, isDark, proximityVolume(dist));
    }

    drawPlayer(
      ctx,
      {
        id: "self",
        name,
        x: myPos.x,
        y: myPos.y,
        color,
        auraIntensity: 0,
        cameraOn: cameraOnRef.current,
      },
      isDark,
      1
    );
  }

  function drawPlayer(
    ctx: CanvasRenderingContext2D,
    player: Player,
    isDark: boolean,
    hearVolume: number
  ) {
    const { x, y, color: pColor, name: pName } = player;
    const inRange = player.id === "self" || hearVolume > 0.01;

    const glowRadius = AVATAR_RADIUS + 10 + hearVolume * 40;
    const gradient = ctx.createRadialGradient(x, y, AVATAR_RADIUS, x, y, glowRadius);
    gradient.addColorStop(0, pColor + (inRange ? "88" : "44"));
    gradient.addColorStop(1, pColor + "00");
    ctx.beginPath();
    ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, AVATAR_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = pColor;
    ctx.globalAlpha = inRange ? 1 : 0.45;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = isDark ? "rgba(243, 238, 248, 0.45)" : "rgba(255, 255, 255, 0.85)";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    if (player.cameraOn) {
      ctx.beginPath();
      ctx.arc(x + AVATAR_RADIUS * 0.55, y - AVATAR_RADIUS * 0.55, 5, 0, Math.PI * 2);
      ctx.fillStyle = "#7dcea0";
      ctx.fill();
      ctx.strokeStyle = isDark ? "#1a1525" : "#fff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    ctx.fillStyle = isDark ? "#f3eef8" : "#3d3550";
    ctx.font = "600 12px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(pName, x, y + AVATAR_RADIUS + 16);

    if (player.id !== "self" && hearVolume > 0.02) {
      const pct = Math.round(hearVolume * 100);
      ctx.fillStyle = isDark ? "rgba(184, 212, 248, 0.85)" : "rgba(90, 110, 150, 0.85)";
      ctx.font = "500 10px system-ui, sans-serif";
      ctx.fillText(`${pct}%`, x, y + AVATAR_RADIUS + 28);
    }
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
          onClick={() => {
            void ensureAudio().catch(() => undefined);
            setMuted(!muted);
          }}
          className={`chip ${muted ? "chip-danger" : ""}`}
        >
          {muted ? "unmute mic" : "mute mic"}
        </button>
        <button
          type="button"
          onClick={() => void toggleCamera()}
          className={`chip ${cameraOn ? "chip-camera-on" : ""}`}
        >
          {cameraOn ? "stop camera" : "camera"}
        </button>
        {!micReady && (
          <span className="chip" style={{ opacity: 0.7 }}>
            allow mic to hear
          </span>
        )}
        {cameraError && (
          <span className="chip chip-danger" style={{ opacity: 0.9 }}>
            {cameraError}
          </span>
        )}
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
        <div className="room-world" ref={worldRef}>
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
          {videoBubbles.map((bubble) => (
            <VideoBubbleEl key={bubble.id} bubble={bubble} videoRef={() => undefined} />
          ))}
        </div>

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
                <span style={{ color: "var(--text)", fontSize: "0.9rem" }}>{m.displayName}</span>
                <span style={{ color: "var(--text-soft)", fontSize: "0.75rem", marginLeft: "auto" }}>
                  {m.isOnline ? "online" : "away"}
                </span>
              </div>
            ))}
          </div>
        </aside>
      </div>

      <p className="room-hint">
        drag or WASD · camera pops up on your dot · closer = louder video &amp; audio
      </p>
    </div>
  );
}
