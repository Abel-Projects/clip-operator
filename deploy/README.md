# Self-hosting Clip Operator on a home server (Linux)

Everything runs on one box. Three pieces cooperate:

| Piece | What it is | How it runs |
|-------|-----------|-------------|
| **App** | The Next.js dashboard + autopilot brain + APIs | `deploy/docker-compose.yml` (`app` service) |
| **Cron** | Ticks `/api/cron/autopilot` so the pipeline advances | `cron` service (or a systemd timer — see below) |
| **SupoClip** | Self-hosted clip engine | its own docker project, reachable at `SUPOCLIP_BASE_URL` |
| **Publisher** | Uploads queued clips to TikTok (Playwright + cookies) | `home-server/tiktok-publisher` |

```
YouTube ─▶ App (discover) ─▶ SupoClip (clip) ─▶ App (caption + queue) ─▶ Publisher ─▶ TikTok
                 ▲                                       │
                 └──────────────── cron tick ───────────┘
```

The dashboard shows a health dot for **SupoClip** (reachable?) and the **Publisher**
(checked in recently?). If either goes down, posting stops and the dashboard says so.

## 1. Configure

Copy `.env.example` to `.env.local` at the repo root and fill it in. At minimum:
`YOUTUBE_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`,
`APP_PASSWORD`, and the `SUPOCLIP_*` values.

## 2. Run the app + cron

```bash
cd deploy
docker compose --env-file ../.env.local up -d --build
```

App is now on `http://<home-server>:3000`. Put it behind a reverse proxy / Tailscale
as you prefer.

### Prefer a systemd timer instead of the cron container?

```bash
sudo cp -r . /opt/clip-operator
sudo cp deploy/systemd/clip-operator-autopilot.* /etc/systemd/system/
# set CLIP_OPERATOR_URL + CRON_SECRET in the .service (or an EnvironmentFile)
sudo systemctl daemon-reload
sudo systemctl enable --now clip-operator-autopilot.timer
```

Either way you can trigger a tick by hand:

```bash
CRON_SECRET=xxx ./deploy/trigger-autopilot.sh
```

## 3. SupoClip + the TikTok publisher

- Start SupoClip so it's reachable at `SUPOCLIP_BASE_URL` (default `http://localhost:8000`).
- Run the publisher next to it — it needs Playwright and your exported TikTok cookies.
  See [`home-server/tiktok-publisher/README.md`](../home-server/tiktok-publisher/README.md).
  Point it at the app with `CLIP_OPERATOR_URL` and `PUBLISH_AGENT_SECRET` (or `CRON_SECRET`).

Once the publisher is polling, the **Post** dot on the dashboard turns green.
