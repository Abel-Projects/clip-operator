# Clip Operator — Working Handoff

> Purpose: a cloud-saved snapshot of where things stand so this work can be picked up
> from any device (desktop, phone via GitHub, or a fresh Cursor chat / Cloud Agent).
> Last updated: 2026-07-02.

## What Clip Operator is now

A self-running short-form clip pipeline: **discover → clip → auto-post to TikTok**, with
two operating modes:

- **Autopilot (default):** a cron loop discovers entrepreneur / Shark Tank–adjacent
  YouTube interviews, clips the best moments, and schedules them to TikTok (~1/hour).
- **Manual (`/workbench`):** paste a link or upload, run a clip engine on demand.

**Hosting:** Next.js app on **Vercel** (`clip-operator.vercel.app`), password-gated via
`APP_PASSWORD`. **Supabase** backs the job queue / state. Cron via Vercel or cron-job.org
hits `/api/cron/autopilot`.

### Clip / post engines (providers)
All are kept; they are pluggable adapters in `lib/autopilot/providers/`:
- **SupoClip** — free, self-hosted; TikTok posting via the home-server agent
  (`home-server/tiktok-publisher/`, Playwright + cookies, no paid API). Preferred because free.
- **WayinVideo** — cloud API; clips and posts to TikTok itself (current autopilot default).
- **OpusClip** — cloud adapter.
- **OpenShorts** — self-hosted adapter (`lib/openshorts.ts`).

### Key code locations
- `app/autopilot/autopilot-dashboard.tsx` — home dashboard
- `app/clip/clip-workbench.tsx` — manual workbench (~900 lines)
- `app/components/{site-shell,mode-switch,monitor-section,password-gate}.tsx`
- `lib/autopilot/{processor,discovery,scheduler,captions,monitor,cleanup}.ts`
- `home-server/tiktok-publisher/agent.py` — free TikTok publisher
- `supabase/migrations/*` — autopilot, post_metrics, wayinvideo_autopilot

## Recent history / decisions
- This desktop was 22 commits behind; synced local `main` to `origin/main` (@ `063d311`).
- Abandoned experiments removed: an OpenAI-removal branch and a local OpenShorts Docker
  build (colima) — both deleted/cleaned; providers in the app are untouched.
- Decided to keep the free path (SupoClip) as the one you like, but **keep all providers**.

## Approved next task: condense/clean up the UI (KEEP all providers)

Guiding idea: stop treating providers as navigation. Two axes:
- **Mode** (Autopilot vs Manual) = top nav.
- **Provider** (which engine) = a selector inside each mode, not a nav tab.

Planned changes (not yet built):
1. **Nav: 3 mixed tabs → 2 mode tabs.** `Autopilot · Manual` + a `⚙︎ Settings` and a
   small provider indicator. Remove `SupoClip` as a top tab; reach its full editor via an
   "Open editor" button in Manual when SupoClip is selected.
2. **One shared `ProviderSelector`** (new component) listing all 4 engines with tags
   (free/self-hosted vs cloud). Used in both Autopilot settings and Manual.
3. **Autopilot dashboard declutter:** replace 4 stat tiles + jargon with one plain-English
   status line + ON/OFF toggle + 2 counters; promote the hidden "manual override" into a
   visible "Add a video now" input; drop the duplicate "Recent sources" list; merge the
   `/monitor` route into the dashboard.
4. **Monitor: 8-column table → responsive cards** (mobile-first; move Views/Likes/Length
   into an expandable detail). Keep the All/Queued/Posted/Failed filter.
5. **Manual workbench slimming:** provider big-tabs → the shared dropdown; collapse
   "Already have clips? / paste project ID" into an Advanced expander; add SupoClip
   "Open full editor" button.
6. **Single password gate** hoisted to the layout (unlock once).
7. **De-jargon copy** + mobile-first CSS pass.

### Files the redesign would touch
`app/components/mode-switch.tsx`, `app/components/site-shell.tsx`,
**new** `app/components/provider-selector.tsx`, `app/autopilot/autopilot-dashboard.tsx`,
`app/components/monitor-section.tsx`, `app/clip/clip-workbench.tsx`, `app/layout.tsx`,
`app/globals.css`, **new** `app/settings` drawer. `lib/*` providers and `/supoclip` embed
stay untouched.

## To resume on another device
1. Open the repo (GitHub on phone, or clone/open in Cursor on desktop) and read this file.
2. Start a chat and say: "Continue the Clip Operator UI-condense task from HANDOFF.md."
3. To carry the *live chat* itself across devices, use Cursor's **Move to Cloud**
   (accessible at cursor.com/agents and the iOS app) — note it starts from a clean git
   state, so commit first.
