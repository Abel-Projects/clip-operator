# Home server + Vercel

> **Permanent SSH / Cloud deploy setup:** [`HOME-SERVER.md`](HOME-SERVER.md)

The app lives on **Vercel** (`https://clip-operator.vercel.app`). The home server runs
only what must stay on 24/7 hardware: **SupoClip** (clip engine) and the **TikTok publisher**.
```
                    Vercel (clip-operator.vercel.app)
                    ─────────────────────────────────
YouTube discovery ─▶ autopilot cron ─▶ queue in Supabase
                           │
                           │  SUPOCLIP_BASE_URL (Tailscale Funnel)
                           ▼
Home server (24/7)         SupoClip :8000 / :3107
                           │
                           │  publisher polls Vercel
                           ▼
                           TikTok
```

## Why not Cloudflare?

`trycloudflare.com` quick tunnels expire when the process stops. Use **Tailscale Funnel**
instead — stable `https://*.ts.net` URLs tied to your home server.

## One-shot install (Windows home server)

```powershell
powershell -ExecutionPolicy Bypass -File deploy/install-windows-home-server.ps1
```

This starts SupoClip, sets up [TikTokAutoUploader](https://github.com/makiisthenes/TiktokAutoUploader),
and registers a scheduled task that polls Vercel every 5 minutes.

## Connect Vercel to SupoClip (Tailscale Funnel)

On the home server, after SupoClip is running:

```powershell
tailscale funnel --bg 8000    # backend API  → SUPOCLIP_BASE_URL
tailscale funnel --bg 3107    # frontend UI  → SUPOCLIP_FRONTEND_URL
```

Copy the printed `https://….ts.net` URLs into **Vercel → Project → Settings → Environment Variables**.

Redeploy Vercel after changing env vars.

## Vercel environment variables

| Variable | Value |
|----------|-------|
| `SUPOCLIP_BASE_URL` | Tailscale funnel URL for port **8000** |
| `SUPOCLIP_FRONTEND_URL` | Tailscale funnel URL for port **3107** |
| `SUPOCLIP_USER_ID` | Same as home server |
| `SUPOCLIP_AUTH_SECRET` | Same as home server |
| `CRON_SECRET` | Same as home server publisher |
| `SUPABASE_*`, `YOUTUBE_API_KEY`, `APP_PASSWORD` | As in `.env.example` |

## Autopilot cron on Vercel

Hobby plan: use [cron-job.org](scripts/cron-job.org.txt) to `POST` every 5 minutes:

```
https://clip-operator.vercel.app/api/cron/autopilot
Authorization: Bearer <CRON_SECRET>
```

## Local dev (this PC)

Use an **SSH tunnel** so home-server SupoClip feels like localhost:

```powershell
powershell -ExecutionPolicy Bypass -File deploy/start-dev.ps1
```

Or run the tunnel and dev server separately:

```powershell
# Terminal 1 - leave open
powershell -ExecutionPolicy Bypass -File deploy/dev-tunnel.ps1

# Terminal 2
pnpm dev
```

Then open:

| URL | What |
|-----|------|
| http://localhost:3000 | Clip Operator dashboard |
| http://localhost:3107 | SupoClip editor |
| http://localhost:8000 | SupoClip API (via tunnel) |

`.env.local` should use `http://localhost:8000` and `http://localhost:3107` — the tunnel forwards those to the home server.

Production dashboard remains **https://clip-operator.vercel.app**.

## Optional: fully self-hosted stack

If you ever want the app off Vercel, `deploy/docker-compose.yml` runs app + cron + publisher
on the home server. Tailscale Serve can expose the dashboard:

```bash
tailscale serve --bg --https=443 http://127.0.0.1:3000
```

## Optional: publisher in Docker (app still on Vercel)

```bash
docker compose --env-file home-server/tiktok-publisher/.env \
  -f deploy/docker-compose.publisher.yml up -d --build
```
