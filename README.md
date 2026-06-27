# Clip Operator

Compare **OpusClip** vs **WayinVideo**: clip a video, review results, auto-post every clip to TikTok.

Hosted at **abelmesfin.com/clip** (password-protected).

## Local dev

```bash
pnpm install
cp .env.example .env.local   # add API keys + APP_PASSWORD
pnpm dev
```

Open **http://localhost:3000/clip**

## Deploy (Vercel)

This app uses standard **Next.js** on Vercel (not Cloudflare). All routes live under `/clip` (`basePath`).

### 1. Deploy clip-operator

1. [vercel.com/new](https://vercel.com/new) → import **MyBrandingKit/clip-operator**
2. Framework: **Next.js** (auto-detected)
3. Environment variables:

   | Variable | Required |
   |----------|----------|
   | `OPUSCLIP_API_KEY` | Yes (for OpusClip) |
   | `WAYINVIDEO_API_KEY` | Yes (for WayinVideo) |
   | `APP_PASSWORD` | **Yes when public** — gates the whole `/clip` app |

4. Deploy → note the URL (e.g. `https://clip-operator.vercel.app/clip`)

### 2. Wire abelmesfin.com/clip

The **abel-website** repo includes `vercel.json` rewrites that proxy:

- `abelmesfin.com/clip` → `clip-operator.vercel.app/clip`

Redeploy **abel-website** after clip-operator is live. Update the destination URL in `abel-website/vercel.json` if your Vercel project name differs.

**Alternative:** In the Vercel dashboard, add the clip-operator project to **abelmesfin.com** with path prefix `/clip` (no rewrite file needed).

## Environment

See `.env.example`. Never commit `.env.local`.

## Notes

- File upload to this app is disabled on Vercel; use YouTube links (providers accept uploads via their own APIs if needed later).
- Clipping polls from the browser (Vercel serverless timeout ~60s).
- WayinVideo website URLs use `hmtask…` ids — this app needs the API id (`prj06…`) from runs through `/clip`.
