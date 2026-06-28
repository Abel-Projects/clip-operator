# Clip Operator

Compare **OpusClip**, **WayinVideo**, and self-hosted **[SupoClip](https://github.com/FujiwaraChoki/supoclip)**: clip a video, review results, auto-post every clip to TikTok (hosted APIs only).

Hosted on **Vercel** as its own app (password-protected). Default URL: `https://clip-operator.vercel.app` — add a custom domain in the Vercel project if you want one.

## Local dev

```bash
pnpm install
cp .env.example .env.local   # add API keys + APP_PASSWORD
pnpm dev
```

Open **http://localhost:3000**

## SupoClip (local)

Self-hosted open-source clipper. Runs in Docker on separate ports so it does not conflict with Clip Operator.

```bash
pnpm supoclip
```

- **SupoClip UI:** http://localhost:3107
- **SupoClip API:** http://localhost:8000

1. Add API keys to `H:\Projects\supoclip\.env` (`ASSEMBLY_AI_API_KEY`, `GOOGLE_API_KEY`, etc.).
2. Create an account in the SupoClip UI.
3. Copy your user ID into clip-operator `.env.local`:

```env
SUPOCLIP_USER_ID=your_user_id
SUPOCLIP_AUTH_SECRET=supoclip_dev_backend_secret_change_me
```

To find your user ID after sign-up:

```bash
docker exec -it supoclip-postgres psql -U supoclip -d supoclip -c "select id, email from \"user\" limit 5;"
```

Restart `pnpm dev` after updating `.env.local`, then pick **SupoClip** in the workbench.

## Deploy (Vercel)

This app uses standard **Next.js** on Vercel (not Cloudflare).

1. [vercel.com/new](https://vercel.com/new) → import **Abel-Projects/clip-operator** (Vercel team: **abelprojects**)
2. Framework: **Next.js** (auto-detected)
3. Environment variables:

   | Variable | Required |
   |----------|----------|
   | `OPUSCLIP_API_KEY` | Yes (for OpusClip) |
   | `WAYINVIDEO_API_KEY` | Yes (for WayinVideo) |
   | `APP_PASSWORD` | **Yes when public** — gates the whole app |

4. Deploy → open `https://clip-operator.vercel.app` (or your custom domain)

Optional: connect a dedicated domain (e.g. `clip.example.com`) under **Project → Settings → Domains** in Vercel. This app is no longer proxied through abelmesfin.com.

## Environment

See `.env.example`. Never commit `.env.local`.

## Notes

- File upload to this app is disabled on Vercel; use YouTube links (providers accept uploads via their own APIs if needed later).
- Clipping polls from the browser (Vercel serverless timeout ~60s).
- WayinVideo website URLs use `hmtask…` ids — this app needs the API id (`prj06…`) from runs through Clip Operator.
- Legacy `/clip` URLs redirect to `/` for bookmarks from the old abelmesfin.com setup.
