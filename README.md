# Clip Operator

**Autopilot** (default): paste a YouTube URL → OpusClip clips → best moments scheduled to TikTok with safe spacing.

**Manual mode** (`/workbench`): compare OpusClip, WayinVideo, and SupoClip side by side.

Hosted on **Vercel**: `https://clip-operator.vercel.app` (password-protected via `APP_PASSWORD`).

## Autopilot flow

1. You paste a YouTube URL (+ niche preset: Sharks, Founders, etc.)
2. Background worker starts an **OpusClip** project with niche keywords
3. When clips are ready, autopilot keeps the **top 4** (configurable) by score
4. Posts are **queued to TikTok** with spacing (default **4/day max**, **3 hours** between posts)
5. Vercel cron runs every **5 minutes** to advance clipping and publish due posts

## Setup

### 1. Supabase (new project recommended)

Create a free project at [supabase.com](https://supabase.com) (dedicated to Clip Operator — do not reuse production app DB).

1. **SQL Editor** → run `supabase/migrations/20250628000000_autopilot.sql`
2. **Project Settings → API** → copy:
   - Project URL → `SUPABASE_URL`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (server only, never expose to browser)

### 2. Environment variables

```bash
pnpm install
cp .env.example .env.local
```

| Variable | Required |
|----------|----------|
| `OPUSCLIP_API_KEY` | Yes |
| `SUPABASE_URL` | Yes (autopilot) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes (autopilot) |
| `CRON_SECRET` | Yes on Vercel (random string) |
| `APP_PASSWORD` | Recommended |

TikTok must be connected in **OpusClip** (or set `OPUSCLIP_POST_ACCOUNT_ID` / `OPUSCLIP_SUB_ACCOUNT_ID`).

### 3. Local dev

```bash
pnpm dev
```

Open **http://localhost:3000** (autopilot). Manual compare UI: **http://localhost:3000/workbench**

Trigger the background worker locally:

```bash
curl -X POST http://localhost:3000/api/cron/autopilot
```

### 4. Deploy (Vercel)

1. Import **Abel-Projects/clip-operator**
2. Set all env vars above (including `CRON_SECRET`)
3. Deploy — cron is configured in `vercel.json` (`*/5 * * * *`)

> **Note:** Vercel Hobby may limit cron frequency. If cron does not run every 5 minutes, upgrade to Pro or call `/api/cron/autopilot` from an external scheduler (e.g. cron-job.org) with `Authorization: Bearer <CRON_SECRET>`.

## Posting limits (safe defaults)

| Setting | Default | Max in UI |
|---------|---------|-----------|
| Clips per YouTube video | 4 | 8 |
| Posts per day | 4 | 6 |
| Min hours between posts | 3 | 12 (min 2) |

These reduce TikTok spam/shadowban risk while staying aggressive. Tune via `/api/autopilot/settings` or extend the dashboard later.

## Manual providers

### SupoClip (local)

```bash
pnpm supoclip
```

See previous README section for SupoClip Docker setup. SupoClip has no TikTok autopost in Clip Operator.

## Notes

- Autopilot uses **OpusClip only** (WayinVideo remains in manual workbench).
- File upload is disabled on Vercel; autopilot expects **YouTube URLs**.
- Phase 2 (metrics sync, auto-delete losers) is not implemented yet — campaigns and scheduled posts are tracked in Supabase for when we add it.
