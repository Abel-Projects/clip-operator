# Clip Academy lessons → Clip Operator

Distilled from Discord exports in `research/clip-academy/` (raw JSON is gitignored).
Applied in code/settings where noted.

Sources mined: `editing-help.json`, `websites-and-tools.json`, `main-chat.json` (~303k messages).

## Consensus rules

1. **First second = swipe rate** — make the open count before worrying about long retention.
2. **Hook / bait caption** — tease the ending (Freytag exposition); don't spoil; don't quote weak transcript openers.
3. **Best clip length ~15–25s** — `lib/autopilot/clip-quality.ts`.
4. **Exactly ~3 niche hashtags** — restate punchy post text; no #fyp/#viral spam.
5. **Same format every post** — same size, same on-screen text style/placement (page brand).
6. **Quality over flood** — academy TikTok advice clusters at **1–3 posts/day** while building; ramp only when views stay stable.
7. **One niche identity** — US Shark Tank only (`niche-filter.ts`). Crossing niches kills the algo.
8. **Prune weak profile posts** — low-view deletes after ~48h (`prune-profile.ts`).
9. **Study top pages in niche** — copy what works for on-screen wording/fonts (adapt to our clips).
10. **Slightly transformative edits** — raw 1:1 reposts get treated as reused; filters/chops/SFX help uniqueness.

## Settings applied

| Setting | Value | Why |
|---------|-------|-----|
| `posts_per_day` | 7 | Academy build cadence (~6–8); ramp only if views hold |
| `min_hours_between_posts` | 2 | Avoid bot-like clustering |
| `max_clips_per_source` | 3 | Prefer stronger cuts over volume |
| `min_clip_score` | 55 | Ship fewer weak cuts |
| Preferred clip duration | 15–25s | Academy retention band |
| On-screen captions | `clear_bold` only | Consistent placement (A/B off unless `SUPOCLIP_CAPTION_AB=1`) |
| Post hashtags | 3 tags | `#sharktank #entrepreneur #business` |

## Cadence note (main-chat)

Repeated advice (esp. weezy / similar): find a pattern at **2–3/day**, drop to **1–2** if needed, and only increase when the account is consistently hitting. Live settings now sit at **7/day / 2h gap** as a middle ground vs the old 18/day flood.

## On-niche narrated lessons

Same Shark Tank page, different format (not a second niche):
- `lesson_posts_enabled` (default on) + `lesson_posts_per_day` (default **1**)
- Autopilot queues `content_type=lesson` posts → home-server `lesson-agent.py` (edge-tts + ffmpeg) → same TikTok publisher
- Scripts stay Shark Tank / shark rules / founder money lessons only

## Still manual / later

- First-frame / entrance animation (CapCut-style) — needs editor pipeline
- Peak-hour learning from analytics
- Richer lesson B-roll (Pexels) instead of solid-color cards
- Optional light “uniqueness” transforms (mirror/speed/SFX) for hot late clips
