# Deploy Boops! for free

**Stack (all free tiers):**

| Piece | Host | Notes |
|-------|------|-------|
| Postgres | [Neon](https://neon.tech) | Free forever tier |
| Frontend + Auth APIs | [Vercel](https://vercel.com) | Next.js |
| Socket.io server | [Render](https://render.com) | Free web service (sleeps after idle) |

SQLite does **not** work on Vercel/Render — we use Postgres.

---

## 1. Create a free Postgres database (Neon)

1. Sign up at [neon.tech](https://console.neon.tech)
2. Create a project (e.g. `boops`)
3. Copy the **connection string** (looks like `postgresql://...@ep-xxx.neon.tech/neondb?sslmode=require`)
4. Keep it handy as `DATABASE_URL`

### Point local + prod at Neon

Update these files (or paste into host dashboards later):

- Root `.env`
- `client/.env.local`
- `server/.env`

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST/neondb?sslmode=require"
```

Then from repo root:

```bash
npm run db:generate
npm run db:push
```

---

## 2. Deploy the Socket.io server (Render)

1. Go to [render.com](https://dashboard.render.com) → **New → Blueprint**
   - Or **New → Web Service** → connect `wonically/boops`
2. If manual Web Service:
   - **Runtime:** Docker
   - **Dockerfile path:** `./Dockerfile`
   - **Docker context:** `.` (repo root)
3. Set environment variables:

| Key | Value |
|-----|--------|
| `DATABASE_URL` | Neon connection string |
| `CLIENT_URL` | `https://YOUR-APP.vercel.app` (update after step 3) |
| `AUTH_SECRET` | same secret as Vercel |
| `BOOPS_INTERNAL_SECRET` | same as `AUTH_SECRET` |
| `PORT` | `3001` |

4. Deploy → copy the URL, e.g. `https://boops-server.onrender.com`
5. Open `/health` — should return `{"status":"ok",...}`

**Cold start:** Free Render sleeps after ~15 min. First request can take 30–60s — wake it before demos.

---

## 3. Deploy the Next.js client (Vercel)

1. [vercel.com](https://vercel.com) → **Add New Project** → import `wonically/boops`
2. **Root Directory:** `client`
3. Framework preset: Next.js (auto)
4. Environment variables:

| Key | Value |
|-----|--------|
| `DATABASE_URL` | Neon connection string |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_URL` | `https://YOUR-APP.vercel.app` |
| `BOOPS_INTERNAL_SECRET` | same as `AUTH_SECRET` |
| `NEXT_PUBLIC_SERVER_URL` | `https://boops-server.onrender.com` |
| `CLIENT_URL` | `https://YOUR-APP.vercel.app` |
| `AUTH_GOOGLE_CLIENT_ID` | (optional) |
| `AUTH_GOOGLE_CLIENT_SECRET` | (optional) |
| `AUTH_GITHUB_ID` | (optional) |
| `AUTH_GITHUB_SECRET` | (optional) |

5. Deploy
6. Go back to Render and set `CLIENT_URL` to your real Vercel URL → **Manual Deploy** once

---

## 4. Update OAuth redirect URIs

### Google
[Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)

Add:
- Origin: `https://YOUR-APP.vercel.app`
- Redirect: `https://YOUR-APP.vercel.app/api/auth/callback/google`

### GitHub
[OAuth Apps](https://github.com/settings/developers)

- Homepage: `https://YOUR-APP.vercel.app`
- Callback: `https://YOUR-APP.vercel.app/api/auth/callback/github`

---

## 5. Smoke test

1. Open Vercel URL → **Sign up** / **Continue with Google**
2. Create a room on the dashboard
3. Open the room in two browsers (or phone + laptop)
4. Move with WASD — confirm presence list updates
5. If audio fails across networks, add a TURN server later (Metered free tier)

---

## Order of operations (checklist)

- [ ] Neon project + `DATABASE_URL`
- [ ] `npm run db:push` against Neon
- [ ] Deploy Render server → get server URL
- [ ] Deploy Vercel client with `NEXT_PUBLIC_SERVER_URL`
- [ ] Set Render `CLIENT_URL` to Vercel URL
- [ ] Update Google/GitHub OAuth callbacks
- [ ] Test login + room + two clients

---

## Cost

| Service | Price |
|---------|-------|
| Neon | $0 |
| Vercel Hobby | $0 |
| Render Free | $0 (spins down when idle) |

**Total: $0** for a portfolio demo.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Vercel build fails on Prisma | Confirm Root Directory is `client` and `prisma/` is in the repo |
| `Room not found` from socket | Create rooms from dashboard after login (DB-backed) |
| CORS / socket won't connect | `CLIENT_URL` on Render must match Vercel URL exactly (https, no trailing slash) |
| OAuth redirect_uri_mismatch | Add production callback URLs in Google/GitHub |
| Server timeout on first load | Hit `https://YOUR-SERVER.onrender.com/health` once to wake it |
