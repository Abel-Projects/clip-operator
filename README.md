# Clip Operator

**Autopilot** (default): discovers entrepreneur / Shark Tank–adjacent YouTube interviews → **WayinVideo** clips → best moments scheduled to **TikTok** (1 post/hour by default).

**Manual mode** (`/workbench`): compare **WayinVideo** and **SupoClip** side by side.

Hosted on **Vercel**: `https://clip-operator.vercel.app` (password-protected via `APP_PASSWORD`).

## Autopilot flow

1. Cron discovers up to **4** new YouTube sources per day (≤20 min, interview-style; blocks full episodes/compilations)
2. **WayinVideo** clips each source (up to **4** clips per video by score)
3. Posts are **queued to TikTok** via WayinVideo (~**1/hour** spacing)
4. Vercel cron (or [cron-job.org](scripts/cron-job.org.txt)) hits `/api/cron/autopilot` every few minutes

Switch clipper + TikTok posting:

- **WayinVideo** (default) — cloud API clips + TikTok via WayinVideo
- **SupoClip** — self-hosted clips on your home server + **free TikTok** via [home-server/tiktok-publisher](home-server/tiktok-publisher) (Playwright + cookies, no paid API)

```sql
update autopilot_settings set clip_provider = 'supoclip' where id = 1;
```


## Setup

### 1. Supabase

Run migrations in order in **SQL Editor**:

1. `supabase/migrations/20250628000000_autopilot.sql`
2. `supabase/migrations/20250629000000_post_metrics.sql`
3. `supabase/migrations/20250630000000_wayinvideo_autopilot.sql`

### 2. Environment variables (Vercel + `.env.local`)

| Variable | Required |
|----------|----------|
| `WAYINVIDEO_API_KEY` | Yes (autopilot clipping + TikTok post) |
| `YOUTUBE_API_KEY` | Yes (autopilot discovery) |
| `SUPABASE_URL` | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes |
| `CRON_SECRET` | Yes on Vercel |
| `APP_PASSWORD` | Recommended |
| `SUPOCLIP_*` | SupoClip provider + home-server publisher |
| `PUBLISH_AGENT_SECRET` | Optional; home-server TikTok agent auth (defaults to `CRON_SECRET`) |

TikTok must be connected in **WayinVideo** (or set `WAYINVIDEO_TIKTOK_ACCOUNT_ID`).

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

Set env vars on Vercel and deploy. Use [cron-job.org](scripts/cron-job.org.txt) if Hobby plan limits Vercel cron.

## Default niche

**Shark Tank entrepreneurs** — interviews with investors (Mark Cuban, Barbara Corcoran, etc.) and related founder content. Not full Shark Tank episodes.

Tune keywords/channels in `autopilot_settings.discovery_keywords` / `discovery_channels`.

## Manual providers

- **WayinVideo** — cloud API + TikTok
- **SupoClip** — self-hosted (`SUPOCLIP_*` env); manual workbench + autopilot with [home-server TikTok publisher](home-server/tiktok-publisher/README.md)
