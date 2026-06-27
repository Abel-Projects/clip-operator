# Clip Operator

Wrapper repo for clip workflows: **OpenShorts** (self-hosted) and **OpusClip** (hosted API).

## Main app (OpenShorts — day-to-day)

| What | URL |
|------|-----|
| **OpenShorts dashboard** | **http://localhost:5175/#app** |
| OpenShorts API | http://localhost:8000 |

Port 5175 alone shows OpenShorts' marketing landing page. Bookmark **`/#app`** to skip it.

### First time in OpenShorts

1. Open **http://localhost:5175/#app**
2. Go to **Settings** and add your **Gemini API key** (required for clipping)
3. Optional: Upload-Post, ElevenLabs, fal.ai keys for publish / dubbing / AI shorts
4. **Clip Generator** tab → paste a YouTube URL or upload a video

## Start OpenShorts

```bash
pnpm openshorts
```

Or after reboot / login, the scheduled task runs `pnpm bootstrap` (OpenShorts only).

Manual Docker:

```bash
cd H:\Projects\openshorts
docker compose up -d
```

## Clip Operator UI (optional)

The Next.js app in this repo is an optional control panel. It is **not** started by default.

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

| Page | URL | Purpose |
|------|-----|---------|
| OpenShorts chat wrapper | http://localhost:3000 | Queue jobs against your local OpenShorts stack |
| **OpusClip integration** | http://localhost:3000/opusclip | Create OpusClip projects, poll clips, queue posts |

## Environment

### OpenShorts wrapper

```bash
OPENSHORTS_BASE_URL=http://localhost:8000
GEMINI_API_KEY=your_gemini_key
UPLOAD_POST_API_KEY=
UPLOAD_POST_USER_ID=
```

When using OpenShorts directly, API keys are entered in the OpenShorts **Settings** UI in the browser.

### OpusClip integration (optional)

```bash
OPUSCLIP_API_KEY=your_opusclip_key
# OPUSCLIP_ORG_ID=              # required if you belong to multiple orgs
# OPUSCLIP_POST_ACCOUNT_ID=     # for social posting via OpusClip
# OPUSCLIP_SUB_ACCOUNT_ID=
```

Get your OpusClip API key from the OpusClip dashboard (Pro, Max, or Business plans).

## Notes

- OpenShorts runs in Docker (backend + frontend + renderer).
- First `docker compose up --build` can take 20–40 minutes.
- OpusClip and OpenShorts can run side by side — use OpenShorts locally and OpusClip when you want hosted clipping.
- Logs: `logs/bootstrap.log`
