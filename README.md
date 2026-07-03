# Clip Operator

A single-purpose **TikTok growth machine** for one niche. It runs one loop on autopilot:

**Discover YouTube interviews → clip with SupoClip → auto-caption → post to TikTok (~1/hour).**

One dashboard shows whether the machine is running, what's in the pipeline, and every recent post. Manual upload is folded in as an "Add a video now" quick action.

## Autopilot flow

1. Cron discovers up to **4** new YouTube sources per day (≤20 min, interview-style; blocks full episodes/compilations)
2. **SupoClip** (default, self-hosted on your home server) clips each source (up to **4** clips per video by score)
3. Posts are auto-captioned and **queued to TikTok**, spaced **~1/hour** (24/day)
4. A cron trigger (systemd timer, local `cron`, or [cron-job.org](scripts/cron-job.org.txt)) hits `/api/cron/autopilot` every few minutes
5. The [home-server TikTok publisher](home-server/tiktok-publisher) claims queued posts and uploads them (Playwright + cookies, no paid API)

### Clip engines (providers)

- **SupoClip** (default) — free, self-hosted clips + **free TikTok** via the home-server publisher
- **WayinVideo** (optional fallback) — cloud API clips + TikTok via WayinVideo (paid)

```sql
-- fall back to the paid cloud engine if needed
update autopilot_settings set clip_provider = 'wayinvideo' where id = 1;
```


## Setup

### 1. Supabase

Run migrations in order in **SQL Editor**:

1. `supabase/migrations/20250628000000_autopilot.sql`
2. `supabase/migrations/20250629000000_post_metrics.sql`
3. `supabase/migrations/20250630000000_wayinvideo_autopilot.sql`
4. `supabase/migrations/20250702000000_supoclip_default.sql`
5. `supabase/migrations/20250702010000_home_server_status.sql`

### 2. Environment variables (`.env.local` + host)

| Variable | Required |
|----------|----------|
| `YOUTUBE_API_KEY` | Yes (autopilot discovery) |
| `SUPABASE_URL` | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes |
| `CRON_SECRET` | Yes (protects the cron trigger) |
| `SUPOCLIP_*` | Yes (default clip engine + home-server publisher) |
| `APP_PASSWORD` | Recommended (site + API password) |
| `PUBLISH_AGENT_SECRET` | Optional; home-server TikTok agent auth (defaults to `CRON_SECRET`) |
| `WAYINVIDEO_API_KEY` | Optional (only if you switch to the WayinVideo fallback) |

For the default SupoClip pipeline, TikTok is handled by the [home-server publisher](home-server/tiktok-publisher). If you switch to WayinVideo, connect TikTok in WayinVideo (or set `WAYINVIDEO_TIKTOK_ACCOUNT_ID`).

### 3. Local dev

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Trigger the worker locally:

```bash
curl -X POST http://localhost:3000/api/cron/autopilot -H "Authorization: Bearer $CRON_SECRET"
```

### 4. Deploy

**Production (recommended):** app on **Vercel**, SupoClip + TikTok publisher on a **24/7 home
server**. Vercel reaches SupoClip via **Tailscale Funnel** (not Cloudflare quick tunnels).
See [`deploy/README.md`](deploy/README.md).

```powershell
# On the home server:
powershell -ExecutionPolicy Bypass -File deploy/install-windows-home-server.ps1
tailscale funnel --bg 8000
tailscale funnel --bg 3107
# → copy https://*.ts.net URLs into Vercel SUPOCLIP_* env vars
```

Use [cron-job.org](scripts/cron-job.org.txt) to hit `/api/cron/autopilot` on Vercel.

**Optional self-host:** run the full stack on one box with Docker — see `deploy/docker-compose.yml`.

## Default niche

**Shark Tank entrepreneurs** — interviews with investors (Mark Cuban, Barbara Corcoran, etc.) and related founder content. Not full Shark Tank episodes.

Tune keywords/channels in `autopilot_settings.discovery_keywords` / `discovery_channels`.

## Manual providers

- **WayinVideo** — cloud API + TikTok
- **SupoClip** — self-hosted (`SUPOCLIP_*` env); manual workbench + autopilot with [home-server TikTok publisher](home-server/tiktok-publisher/README.md)
