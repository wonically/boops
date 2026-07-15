"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { PASTEL_COLORS } from "@/lib/colors";

type RoomRow = {
  id: string;
  code: string;
  name: string;
  isPublic: boolean;
  hostId: string;
  host: { id: string; name: string | null };
  members: { id: string; displayName: string; color: string; isOnline: boolean }[];
  _count: { members: number };
};

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [roomName, setRoomName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [color, setColor] = useState(PASTEL_COLORS[0]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const loadRooms = useCallback(async () => {
    const res = await fetch("/api/rooms");
    if (res.status === 401) {
      router.push("/login");
      return;
    }
    const data = await res.json();
    setRooms(data.rooms || []);
  }, [router]);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      setColor(PASTEL_COLORS[Math.floor(Math.random() * PASTEL_COLORS.length)]);
      loadRooms();
    }
  }, [status, loadRooms]);

  const createRoom = async (e: FormEvent) => {
    e.preventDefault();
    if (!roomName.trim()) return;
    setLoading(true);
    setError("");
    const res = await fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: roomName, color }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Could not create room");
      return;
    }
    router.push(
      `/room/${data.room.code}?name=${encodeURIComponent(session?.user?.name || "host")}&color=${encodeURIComponent(color)}&userId=${encodeURIComponent(session!.user!.id)}`
    );
  };

  const joinRoom = async (e: FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setLoading(true);
    setError("");
    const code = joinCode.trim().toLowerCase();
    const res = await fetch(`/api/rooms/${code}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        color,
        displayName: session?.user?.name || "booper",
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Could not join room");
      return;
    }
    router.push(
      `/room/${data.room.code}?name=${encodeURIComponent(data.member.displayName)}&color=${encodeURIComponent(data.member.color)}&userId=${encodeURIComponent(session!.user!.id)}`
    );
  };

  const enterRoom = (room: RoomRow) => {
    router.push(
      `/room/${room.code}?name=${encodeURIComponent(session?.user?.name || "booper")}&color=${encodeURIComponent(color)}&userId=${encodeURIComponent(session!.user!.id)}`
    );
  };

  const deleteRoom = async (code: string) => {
    if (!confirm("Delete this room?")) return;
    await fetch(`/api/rooms/${code}`, { method: "DELETE" });
    loadRooms();
  };

  if (status === "loading") {
    return (
      <main className="page-shell">
        <p className="brand-subtitle">loading…</p>
      </main>
    );
  }

  return (
    <main className="page-shell" style={{ alignItems: "flex-start", paddingTop: "4.5rem" }}>
      <div className="page-blob" aria-hidden />
      <div className="glass-card" style={{ maxWidth: "42rem" }}>
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="brand-title" style={{ textAlign: "left", fontSize: "2rem" }}>
              Boops!
            </h1>
            <p className="brand-subtitle" style={{ textAlign: "left", marginBottom: 0 }}>
              hey {session?.user?.name || "booper"} · manage rooms &amp; who&apos;s online
            </p>
          </div>
          <button type="button" className="chip" onClick={() => signOut({ callbackUrl: "/" })}>
            log out
          </button>
        </div>

        <div className="mb-6">
          <p className="label">your pastel</p>
          <div className="flex gap-2 flex-wrap">
            {PASTEL_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className="w-8 h-8 rounded-full transition-transform"
                style={{
                  backgroundColor: c,
                  transform: color === c ? "scale(1.2)" : undefined,
                  boxShadow: color === c ? "0 0 0 2px var(--ring)" : undefined,
                }}
              />
            ))}
          </div>
        </div>

        <form onSubmit={createRoom} className="space-y-3 mb-6">
          <p className="label">create a room</p>
          <input
            className="field"
            placeholder="room name (e.g. late night boops)"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
          />
          <button type="submit" className="btn-primary" disabled={loading}>
            create &amp; enter
          </button>
        </form>

        <form onSubmit={joinRoom} className="space-y-3 mb-8">
          <p className="label">join with code</p>
          <div className="flex gap-2">
            <input
              className="field flex-1"
              placeholder="room code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
            />
            <button type="submit" className="btn-secondary" disabled={loading}>
              join
            </button>
          </div>
        </form>

        {error && <p className="text-sm text-rose-500 mb-4">{error}</p>}

        <div className="divider" style={{ marginBottom: "1rem" }}>
          rooms
        </div>

        <div className="space-y-3">
          {rooms.length === 0 && (
            <p className="brand-subtitle" style={{ margin: 0 }}>
              no rooms yet — create one!
            </p>
          )}
          {rooms.map((room) => {
            const online = room.members.filter((m) => m.isOnline);
            return (
              <div
                key={room.id}
                className="rounded-2xl p-4"
                style={{
                  background: "var(--input-bg)",
                  border: "1px solid var(--border)",
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p style={{ margin: 0, fontWeight: 700, color: "var(--text)" }}>{room.name}</p>
                    <p className="label" style={{ marginBottom: 0 }}>
                      code <strong style={{ color: "var(--text)" }}>{room.code}</strong>
                      {" · "}host {room.host.name || "unknown"}
                      {" · "}
                      {online.length} online / {room._count.members} members
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="chip" onClick={() => enterRoom(room)}>
                      enter
                    </button>
                    {room.hostId === session?.user?.id && (
                      <button type="button" className="chip chip-danger" onClick={() => deleteRoom(room.code)}>
                        delete
                      </button>
                    )}
                  </div>
                </div>
                {online.length > 0 && (
                  <div className="flex gap-2 flex-wrap mt-3">
                    {online.map((m) => (
                      <span
                        key={m.id}
                        className="chip"
                        style={{ background: m.color, border: "none", color: "#3d3550" }}
                      >
                        {m.displayName}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
