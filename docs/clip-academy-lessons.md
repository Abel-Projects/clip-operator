# Clip Academy lessons → Clip Operator

Distilled from Discord exports in `research/clip-academy/` (raw JSON is gitignored).
Applied in code/settings where noted.

## Consensus rules

1. **Hook in the first 3 seconds** — intrigue or scroll. Captions must tease, not quote transcript openers.
2. **Best clip length ~15–25s** — implemented in `lib/autopilot/clip-quality.ts`.
3. **Catchy caption + clear niche** — Gemini/fallback captions use Freytag-style tease (exposition → stakes).
4. **Quality over flood** — fewer posts/day and fewer clips per source beat blasting 48/day.
5. **One niche identity** — US Shark Tank only (`niche-filter.ts`).
6. **Prune weak profile posts** — low-view deletes after ~48h (`prune-profile.ts`).

## Settings applied

| Setting | Value | Why |
|---------|-------|-----|
| `posts_per_day` | 18 | Cadence without drowning avg views |
| `min_hours_between_posts` | 1 | Breathing room between posts |
| `max_clips_per_source` | 5 | Prefer stronger cuts over volume |
| Preferred clip duration | 15–25s | Academy retention band |

## Still manual / later

- First-frame / entrance animation (CapCut-style) — needs editor pipeline
- Peak-hour learning from analytics
- Main-chat export may add more strategy when available
