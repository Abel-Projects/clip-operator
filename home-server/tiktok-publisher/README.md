# Home-server TikTok publisher

Free TikTok posting for **SupoClip autopilot** — no paid upload API. Runs on your Windows home server next to SupoClip.

## How it fits

```
Vercel clip-operator          Home server
─────────────────────         ─────────────────────────────
YouTube discovery      →      (not needed here)
SupoClip clip tasks    →      SupoClip Docker :8000
Queue scheduled posts  →      tiktok-publisher polls every few min
                              ↓ download MP4 from localhost
                              ↓ tiktok-uploader + cookies.txt
                              → TikTok
```

1. Set `clip_provider` to `supoclip` in Supabase `autopilot_settings`.
2. Vercel cron still discovers videos and creates SupoClip clip jobs.
3. Due posts stay `queued` until this agent claims them and uploads.

## One-time setup (home server)

### 1. Copy this folder

```powershell
cd C:\Users\hunte
git clone https://github.com/YOUR_USER/clip-operator.git
cd clip-operator\home-server\tiktok-publisher
```

Or copy `home-server\tiktok-publisher` from your dev machine.

### 2. Python + dependencies

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
playwright install chromium
```

### 3. TikTok cookies

1. Log into TikTok in Chrome on the home server (or export from your main browser).
2. Use a [cookies.txt exporter extension](https://chrome.google.com/webstore) (Netscape format).
3. Save as `cookies.txt` in this folder (add to `.gitignore` — never commit).

Refresh cookies when uploads fail with login/session errors.

### 4. Environment

```powershell
copy .env.example .env
notepad .env
```

| Variable | Example |
|----------|---------|
| `CLIP_OPERATOR_URL` | `https://clip-operator.vercel.app` |
| `PUBLISH_AGENT_SECRET` | Same as Vercel `CRON_SECRET` (or set dedicated `PUBLISH_AGENT_SECRET`) |
| `SUPOCLIP_BASE_URL` | `http://localhost:8000` |
| `SUPOCLIP_USER_ID` | Your SupoClip user id |
| `SUPOCLIP_AUTH_SECRET` | Same as Vercel `SUPOCLIP_AUTH_SECRET` |
| `TIKTOK_COOKIES_PATH` | `cookies.txt` |

### 5. Test manually

```powershell
.\.venv\Scripts\Activate.ps1
python agent.py
```

With a due queued SupoClip post, you should see: claim → download → upload → complete.

### 6. Scheduled task (every 5 minutes)

```powershell
powershell -ExecutionPolicy Bypass -File install-scheduled-task.ps1
```

Or run `run-loop.ps1` in a persistent terminal for debugging.

## Vercel env

Add optional dedicated secret (falls back to `CRON_SECRET` if unset):

```
PUBLISH_AGENT_SECRET=your-long-random-secret
```

## Switch autopilot to SupoClip

In Supabase SQL editor:

```sql
update autopilot_settings
set clip_provider = 'supoclip'
where id = 1;
```

WayinVideo API key is no longer required for clipping/posting once you switch.

## Caveats

- **Unofficial** — browser automation + cookies; TikTok may change UI or rate-limit.
- **Cookies expire** — re-export when posts fail with auth errors.
- **Headed browser** — Playwright may need a logged-in Windows session; run under the user that owns the desktop if uploads fail headless.
- **One post per agent run** — schedule every 5 min; spacing is enforced by clip-operator (`min_hours_between_posts`).
