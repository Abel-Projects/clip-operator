# Home-server TikTok publisher

Posts queued SupoClip clips to TikTok. Runs on the **24/7 home server** and polls **Vercel**
for jobs — the app does not upload to TikTok itself for SupoClip campaigns.

A companion **clip worker** (`clip-agent.py`) also polls Vercel for pending/clipping campaigns
and talks to local SupoClip — so Vercel never needs inbound access to the home server.

## Architecture

```
Vercel (clip-operator.vercel.app)     Home server (24/7)
─────────────────────────────────     ─────────────────────────
Autopilot cron → queue campaigns  ←── clip worker polls every 5 min
Autopilot cron → queue posts      ←── publisher polls every 5 min
                                      SupoClip :8000 (local)
                                      TikTokAutoUploader → TikTok
```

No Cloudflare tunnels required for clipping or posting.

## Quick install

From the repo root on the home server:

```powershell
powershell -ExecutionPolicy Bypass -File deploy/install-windows-home-server.ps1
```

## Manual setup

### 1. Environment

```powershell
copy deploy\.env.home-server.example .env
notepad .env
```

| Variable | Example |
|----------|---------|
| `CLIP_OPERATOR_URL` | `https://clip-operator.vercel.app` |
| `PUBLISH_AGENT_SECRET` | Same as Vercel `CRON_SECRET` |
| `SUPOCLIP_BASE_URL` | `http://localhost:8000` |
| `SUPOCLIP_USER_ID` | Your SupoClip user id |
| `SUPOCLIP_AUTH_SECRET` | Same as Vercel |
| `TIKTOK_ACCOUNT_NAME` | Label from TikTokAutoUploader login |

### 2. TikTokAutoUploader (recommended)

Fast HTTP uploads (~3s). Replaces the old Playwright + cookies.txt path.

```powershell
.\setup-uploader.ps1
cd vendor\TiktokAutoUploader
.\.venv\Scripts\python.exe cli.py login -n main
cd ..\..
# Set TIKTOK_ACCOUNT_NAME=main in .env
```

### 3. Run

```powershell
.\setup.ps1
python agent.py              # once
.\install-scheduled-task.ps1 # every 5 min (production)
```

## Legacy upload path

If `TIKTOK_ACCOUNT_NAME` is unset, falls back to Playwright + `cookies.txt` (slow, needs headed browser).

## Vercel side

Set `SUPOCLIP_BASE_URL` and `SUPOCLIP_FRONTEND_URL` to Tailscale Funnel URLs from the home server.
See [`deploy/README.md`](../../deploy/README.md).
