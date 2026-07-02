# Clip Operator — Working Handoff

> Purpose: a cloud-saved snapshot of where things stand so this work can be picked up
> from any device (desktop, phone via GitHub, or a fresh Cursor chat / Cloud Agent).
> Last updated: 2026-07-02.

## The goal (why this exists)

**Grow one TikTok account fast in a single niche** (Shark Tank / entrepreneur interviews)
by running one loop on autopilot: **discover YouTube interviews → clip with SupoClip →
auto-caption → post to TikTok (~1/hour).** Manual upload is a convenience, not the point.
Everything else in the app serves this one goal.

## What Clip Operator is now

A single-purpose TikTok growth machine with **one dashboard** (Mission Control):
plain-English run status + on/off, a Discover→Clip→Caption→Post pipeline strip with
home-server health dots, an "Add a video now" quick action, and a card feed of recent
posts. Manual upload lives at `/workbench`; the full SupoClip editor at `/supoclip`
(both reachable via links, not top-level tabs).

**Hosting:** Next.js app, now **self-hosted on a home server** via `deploy/docker-compose.yml`
(app + internal cron loop). SupoClip and the TikTok publisher run on the same box.
**Supabase** backs the job queue / state. `proxy.ts` is the Next 16 middleware that enforces
`APP_PASSWORD` on `/api/*`. (Vercel remains a supported alternative.)

### Clip / post engines (providers)
All are kept; they are pluggable adapters in `lib/autopilot/providers/`:
- **SupoClip** — free, self-hosted; TikTok posting via the home-server agent
  (`home-server/tiktok-publisher/`, Playwright + cookies, no paid API). **Now the default.**
- **WayinVideo** — cloud API; clips and posts to TikTok itself (paid fallback).
- **OpusClip** — cloud adapter (present, not wired into autopilot).
- **OpenShorts** — self-hosted adapter (present, not wired into autopilot).

### Key code locations
- `app/autopilot/autopilot-dashboard.tsx` — the Mission Control dashboard (home page)
- `app/clip/clip-workbench.tsx` — manual workbench (~900 lines; reached via a link)
- `app/components/{site-shell,monitor-section,password-gate}.tsx`
- `lib/format.ts` — shared UI formatting helpers
- `lib/autopilot/{processor,discovery,scheduler,captions,monitor,cleanup,health}.ts`
- `home-server/tiktok-publisher/agent.py` — free TikTok publisher
- `deploy/` — Docker/systemd self-hosting stack
- `supabase/migrations/*` — autopilot, post_metrics, wayinvideo_autopilot,
  supoclip_default, home_server_status

## Recent history / decisions
- This desktop was 22 commits behind; synced local `main` to `origin/main` (@ `063d311`).
- Abandoned experiments removed: an OpenAI-removal branch and a local OpenShorts Docker
  build (colima) — both deleted/cleaned; providers in the app are untouched.
- Decided to keep the free path (SupoClip) as the one you like, but **keep all providers**.

## Phase 1 — refocus on the SupoClip growth loop (DONE)

Branch `cursor/refocus-tiktok-growth-dashboard-a5ae`. Shipped:
1. **SupoClip is the default engine** and the posting cadence is one honest value
   (24/day, 1h spacing). Migration `20250702000000_supoclip_default.sql`; code defaults
   + provider fallback updated; `.env.example`/README reframed.
2. **Single Mission Control dashboard.** Removed the 3-tab provider-as-nav; `SiteShell`
   shows the niche + a back link for secondary pages. Dashboard = status + on/off,
   Discover→Clip→Caption→Post strip, "Add a video now", card feed. Manual folded to a link.
3. **Monitor: 8-col table → mobile-first cards.** Shared `lib/format.ts` kills the
   triplicated `formatWhen`/`providerLabel` helpers.
4. **Home-server health surface.** `system_heartbeats` table + `lib/autopilot/health.ts`;
   the publisher's poll records a heartbeat; `GET /api/autopilot/health`; dashboard shows
   SupoClip-reachable + publisher-online dots and an "offline" banner when posting stalls.
5. **Linux self-hosting stack.** `Dockerfile`, `deploy/docker-compose.yml` (app + cron
   loop), systemd timer alternative, `deploy/trigger-autopilot.sh`, `deploy/README.md`.

Deferred from the original UI plan (nice-to-have, not blocking): a full `⚙︎ Settings`
drawer (niche keywords / cadence / caption style editing — currently DB-edited), a shared
`ProviderSelector` component, and hoisting the password gate into `app/layout.tsx` (today
each entry page unlocks; fine since the app is effectively single-page).

## Phase 2 — measure and optimize for follower growth (roadmap)

The machine now *posts*; Phase 2 makes it *grow measurably*. Right now we're flying blind:
metrics columns exist on `scheduled_posts` (`views/likes/comments/shares`) but nothing fills
them, and we never record account-level followers. Sequenced by leverage:

### 2a. Close the measurement loop (highest priority)
- **Per-post metrics sync.** Fill the existing `scheduled_posts` metric columns +
  `metrics_synced_at`. A scheduled job re-checks recent posts (e.g. at +1h/+24h/+7d).
- **Account snapshots.** New table `account_snapshots(captured_at, followers, following,
  likes, video_count)` to plot the follower trend — the single number that answers
  "is this working?".
- **Data source options (pick per trade-off):**
  - *TikTok scraping via the publisher's Playwright session* — no API approval, reuses the
    cookies we already have; brittle to UI changes. Fastest to ship.
  - *TikTok Display/Business API* — official + stable, but requires app review and only
    exposes your own account/videos. Best long-term.
  - *Manual entry* — a stopgap field on each post card.

### 2b. Growth view on the dashboard
- A **Growth** strip above the post feed: followers (with 7/30-day delta), views trend,
  and top 3 / bottom 3 clips by views. Turns the dashboard from "poster" into "coach".
- Sort/filter the post feed by performance, not just recency.

### 2c. Feedback loop (turn data into decisions)
- **Discovery tuning:** attribute post performance back to `discovery_keywords` /
  source channels; surface which keywords produce winners so you prune the losers.
- **Clip selection:** correlate clip `score` and `duration_sec` with views to set a smarter
  `min_clip_score` and preferred length band.
- **Timing:** learn best posting hours from `posted_at` vs views; feed into the scheduler.
- **Captions/hooks:** the caption pipeline (`lib/autopilot/captions.ts`) is the biggest
  lever on watch-time. Add lightweight A/B of hook styles and track which win.

### 2d. Scale once the niche is proven
- The schema already carries `niche`; generalize `autopilot_settings` from a single row to
  per-niche/per-account rows so one box can run several niches or accounts.
- Multi-account TikTok posting (multiple cookie profiles in the publisher).

### Guardrails to keep in mind
- **Don't over-post.** Honest 1/hour cadence is set; watch TikTok's spam/quality signals as
  follower count climbs.
- **Keep it measurable before automating.** Ship 2a/2b (see the data) before 2c (act on it).
- **One niche until the trend line proves out**, then clone — not before.

## To resume on another device
1. Open the repo (GitHub on phone, or clone/open in Cursor on desktop) and read this file.
2. Start a chat and say: "Continue the Clip Operator UI-condense task from HANDOFF.md."
3. To carry the *live chat* itself across devices, use Cursor's **Move to Cloud**
   (accessible at cursor.com/agents and the iOS app) — note it starts from a clean git
   state, so commit first.
