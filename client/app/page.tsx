"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";

const COLORS = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD", "#98D8C8", "#F7DC6F"];

export default function Home() {
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const router = useRouter();

  useEffect(() => {
    setColor(COLORS[Math.floor(Math.random() * COLORS.length)]);
  }, []);

  const createRoom = () => {
    if (!name.trim()) return;
    const roomId = uuidv4().slice(0, 6);
    router.push(`/room/${roomId}?name=${encodeURIComponent(name)}&color=${encodeURIComponent(color)}`);
  };

  const joinRoom = () => {
    if (!name.trim() || !roomCode.trim()) return;
    router.push(`/room/${roomCode}?name=${encodeURIComponent(name)}&color=${encodeURIComponent(color)}`);
  };

  return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 w-full max-w-md shadow-2xl">
        <h1 className="text-4xl font-bold text-white mb-2 text-center">Boops!</h1>
        <p className="text-gray-400 text-center mb-8">boop when you&apos;re close. oops when you&apos;re not.</p>

        <div className="space-y-4">
          <input
            type="text"
            placeholder="your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition"
          />

          <div>
            <p className="text-gray-400 text-sm mb-2">pick your color</p>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full transition-transform ${color === c ? "scale-125 ring-2 ring-white" : "hover:scale-110"}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <button
            onClick={createRoom}
            className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-lg transition"
          >
            create room
          </button>

          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-gray-700" />
            <span className="text-gray-500 text-sm">or join</span>
            <div className="flex-1 h-px bg-gray-700" />
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              placeholder="room code"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
              className="flex-1 px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition"
            />
            <button
              onClick={joinRoom}
              className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg transition"
            >
              join
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
