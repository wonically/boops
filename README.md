# Boops!

Spatial audio chat where you **boop** into someone's bubble to hear them — **oops** if you're too far away.

Move your avatar in a 2D space. The closer you get, the louder they are. Each person glows with a pulsing aura.

## Architecture

```
┌─────────────────┐        WebSocket         ┌──────────────────┐
│   Next.js App   │ ◄─────────────────────►  │  Socket.io Server │
│  (Canvas + UI)  │    position, signaling    │  (Room mgmt)      │
└────────┬────────┘                           └──────────────────┘
         │
         │  WebRTC (peer-to-peer audio)
         │
         ▼
┌─────────────────┐
│  Web Audio API  │  GainNode per peer
│  Spatial volume │  gain = max(0, 1 - dist/radius)
└─────────────────┘
```

## Quick start

```bash
# First time only — install root + server + client deps
npm install
npm run install:all

# Run both server (:3001) and client (:3000)
npm run dev
```

Open `http://localhost:3000`, create a room, open another tab and join with the room code.

## Stack

- **Frontend:** Next.js, TypeScript, Tailwind CSS, HTML5 Canvas
- **Real-time:** Socket.io (position sync + WebRTC signaling)
- **Audio:** WebRTC peer connections + Web Audio API spatial gain
- **Deploy:** Vercel (client) + Render/Fly (server)

## Features

- [x] 2D canvas with WASD movement
- [x] Real-time position sync via WebSocket
- [x] WebRTC peer-to-peer audio
- [x] Distance-based volume (spatial audio)
- [x] Visual aura glow per player
- [ ] Mic volume → aura intensity
- [ ] Heat trail of conversation zones
- [ ] Room analytics dashboard
