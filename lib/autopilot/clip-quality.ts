import type { AutopilotSettingsRow } from "@/lib/supabase/types";

/**
 * Clip Academy consensus: best-performing shorts land ~15–25s.
 * Prefer that band hard; fall back wider only if nothing qualifies.
 */
export const PREFERRED_CLIP_DURATION_SEC = { min: 15, max: 25 } as const;
/** Fallback if nothing lands in the sweet spot. */
export const FALLBACK_CLIP_DURATION_SEC = { min: 12, max: 40 } as const;

const IDEAL_DURATION_SEC = 20;

export type RankableClip = {
  clipId: string;
  title?: string | null;
  score?: number | null;
  durationSec?: number | null;
  previewUrl?: string | null;
};

export function rankClipsByScore<T extends RankableClip>(clips: T[]): T[] {
  return [...clips].sort((a, b) => {
    const scoreA = a.score ?? -1;
    const scoreB = b.score ?? -1;
    if (scoreB !== scoreA) {
      return scoreB - scoreA;
    }
    // Prefer lengths closer to ~20s when scores tie.
    const distA = Math.abs((a.durationSec ?? IDEAL_DURATION_SEC) - IDEAL_DURATION_SEC);
    const distB = Math.abs((b.durationSec ?? IDEAL_DURATION_SEC) - IDEAL_DURATION_SEC);
    if (distA !== distB) {
      return distA - distB;
    }
    return (b.durationSec ?? 0) - (a.durationSec ?? 0);
  });
}

function inDurationBand(
  durationSec: number | null | undefined,
  band: { min: number; max: number }
): boolean {
  if (typeof durationSec !== "number" || !Number.isFinite(durationSec)) {
    return false;
  }
  return durationSec >= band.min && durationSec <= band.max;
}

/**
 * Keep only strong clips: prefer 15–25s + score floor, then fall back so a
 * campaign rarely dies with zero usable clips.
 */
export function selectGrowthClips<T extends RankableClip>(
  clips: T[],
  settings: Pick<AutopilotSettingsRow, "min_clip_score" | "max_clips_per_source">
): T[] {
  const minScore = settings.min_clip_score ?? 0;
  const limit = Math.max(1, settings.max_clips_per_source ?? 5);

  const preferred = clips.filter((clip) =>
    inDurationBand(clip.durationSec, PREFERRED_CLIP_DURATION_SEC)
  );
  const fallback = clips.filter((clip) =>
    inDurationBand(clip.durationSec, FALLBACK_CLIP_DURATION_SEC)
  );
  const pool = preferred.length > 0 ? preferred : fallback.length > 0 ? fallback : clips;

  const scored = pool.filter((clip) => (clip.score ?? 0) >= minScore);
  const ranked = rankClipsByScore(scored.length > 0 ? scored : pool);
  return ranked.slice(0, limit);
}
