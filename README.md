# Boops!

Spatial audio chat where you **boop** into someone's bubble to hear them — **oops** if you're too far away.

Move your avatar in a 2D space. The closer you get, the louder they are. Each person glows with a pulsing aura.

## Features

- Email/password auth + Google / GitHub OAuth
- Postgres database (Prisma + Neon) for users, rooms, and member lists
- Dashboard to create/join rooms and see who's online
- Real-time spatial audio via WebRTC + Socket.io
- Pastel gradient UI with dark / light mode
- Free deploy: Vercel + Render + Neon

## Architecture

```
Next.js (auth + APIs + UI)  ←→  SQLite (Prisma)
         ↑
Socket.io server (spatial audio + presence sync)
```

## Quick start

```bash
# From repo root
npm install
npm run install:all
npm run db:push

# Run both server (:3001) and client (:3000)
npm run dev
```

Open `http://localhost:3000` → **create account** → **dashboard** → create a room.

## Deploy (free)

See **[DEPLOY.md](./DEPLOY.md)** — Neon (Postgres) + Vercel (client) + Render (server).

```bash
# After you have a Neon DATABASE_URL in .env files:
npm run db:generate
npm run db:push
```

## Env files

- Root `.env` / `client/.env.local` / `server/.env` — see `.env.example` files
- Production checklist is in `DEPLOY.md`

## Stack

- **Frontend:** Next.js, TypeScript, Tailwind, Auth.js
- **Database:** Prisma + Postgres (Neon free tier)
- **Realtime:** Socket.io + WebRTC
- **Deploy:** Vercel (client) + Render (server) — see `DEPLOY.md`
