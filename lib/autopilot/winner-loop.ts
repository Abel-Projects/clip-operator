import { countCampaignsCreatedToday } from "@/lib/autopilot/discovery";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { AutopilotSettingsRow } from "@/lib/supabase/types";

const YOUTUBE_API = "https://www.googleapis.com/youtube/v3";
const MIN_POSTS_FOR_VIEWS = 1;
const WINNER_AVG_VIEWS = 1500;
const MAX_WINNERS = 5;
const SIMILARS_PER_WINNER = 4;
const AUTO_QUEUE_FROM_WINNERS = 2;

export type WinnerSource = {
  sourceUrl: string;
  title: string;
  channelTitle: string;
  avgViews: number | null;
  avgClipScore: number | null;
  reason: "views" | "clip_score";
};

function videoIdFromUrl(url: string): string | null {
  return url.match(/[?&]v=([^&]+)/)?.[1] ?? null;
}

function toVideoUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

function parseIso8601Duration(value: string): number {
  const match = value.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return (
    Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0)
  );
}

/** Turn a winning episode title into a YouTube search that finds more like it. */
export function similarSearchQueries(title: string, channelTitle: string): string[] {
  const cleaned = title
    .replace(/#\w+/g, " ")
    .replace(/\[[^\]]*]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const queries: string[] = [];
  if (channelTitle.trim()) {
    queries.push(`${channelTitle} full episode`);
    queries.push(`${channelTitle} shark tank`);
  }

  // Keep the most distinctive words (skip filler).
  const stop = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "of",
    "to",
    "in",
    "on",
    "for",
    "with",
    "full",
    "episode",
    "interview",
    "podcast",
    "official",
    "video",
    "hd"
  ]);
  const keywords = cleaned
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zA-Z0-9']/g, ""))
    .filter((w) => w.length > 2 && !stop.has(w.toLowerCase()))
    .slice(0, 6)
    .join(" ");

  if (keywords) {
    queries.push(`${keywords} full episode`);
    queries.push(`${keywords} shark tank long`);
  }

  return [...new Set(queries)].slice(0, 3);
}

async function youtubeGet<T>(
  apiKey: string,
  path: string,
  params: Record<string, string>
): Promise<T | null> {
  const url = new URL(`${YOUTUBE_API}${path}`);
  url.searchParams.set("key", apiKey);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const response = await fetch(url.toString());
  if (!response.ok) return null;
  return (await response.json()) as T;
}

async function searchSimilarIds(apiKey: string, query: string): Promise<string[]> {
  const payload = await youtubeGet<{
    items?: Array<{ id?: { videoId?: string } }>;
  }>(apiKey, "/search", {
    part: "snippet",
    type: "video",
    q: query,
    maxResults: "8",
    order: "relevance",
    videoDuration: "long",
    relevanceLanguage: "en",
    safeSearch: "moderate"
  });

  return (payload?.items ?? [])
    .map((item) => item.id?.videoId)
    .filter((id): id is string => Boolean(id));
}

async function fetchDetails(
  apiKey: string,
  videoIds: string[]
): Promise<Map<string, { title: string; channelTitle: string; durationSec: number }>> {
  if (videoIds.length === 0) return new Map();
  const payload = await youtubeGet<{
    items?: Array<{
      id?: string;
      snippet?: { title?: string; channelTitle?: string };
      contentDetails?: { duration?: string };
    }>;
  }>(apiKey, "/videos", {
    part: "snippet,contentDetails",
    id: videoIds.join(",")
  });

  const map = new Map<string, { title: string; channelTitle: string; durationSec: number }>();
  for (const item of payload?.items ?? []) {
    if (!item.id) continue;
    map.set(item.id, {
      title: item.snippet?.title ?? item.id,
      channelTitle: item.snippet?.channelTitle ?? "",
      durationSec: parseIso8601Duration(item.contentDetails?.duration ?? "")
    });
  }
  return map;
}

/**
 * Rank sources that are working — prefer real TikTok views when present,
 * otherwise fall back to high SupoClip clip scores from finished campaigns.
 */
export async function findWinnerSources(limit = MAX_WINNERS): Promise<WinnerSource[]> {
  const supabase = getSupabaseAdmin();

  const { data: posts } = await supabase
    .from("scheduled_posts")
    .select(
      "views, likes, campaign_id, campaigns!inner(source_url, status), campaign_clips(title, score)"
    )
    .eq("status", "posted")
    .order("posted_at", { ascending: false })
    .limit(300);

  type Agg = {
    sourceUrl: string;
    title: string;
    channelTitle: string;
    views: number[];
    scores: number[];
  };

  const bySource = new Map<string, Agg>();

  for (const row of posts ?? []) {
    const campaign = row.campaigns as unknown as { source_url?: string } | null;
    const url = campaign?.source_url;
    if (!url) continue;

    const clip = row.campaign_clips as unknown as { title?: string; score?: number } | null;
    const existing = bySource.get(url) ?? {
      sourceUrl: url,
      title: clip?.title ?? url,
      channelTitle: "",
      views: [],
      scores: []
    };

    if (typeof row.views === "number") {
      existing.views.push(row.views);
    }
    if (typeof clip?.score === "number") {
      existing.scores.push(clip.score);
    }
    if (clip?.title && existing.title === url) {
      existing.title = clip.title;
    }
    bySource.set(url, existing);
  }

  const withViews: WinnerSource[] = [];
  const withScores: WinnerSource[] = [];

  for (const agg of bySource.values()) {
    if (agg.views.length >= MIN_POSTS_FOR_VIEWS) {
      const avgViews = agg.views.reduce((a, b) => a + b, 0) / agg.views.length;
      if (avgViews >= WINNER_AVG_VIEWS) {
        withViews.push({
          sourceUrl: agg.sourceUrl,
          title: agg.title,
          channelTitle: agg.channelTitle,
          avgViews,
          avgClipScore:
            agg.scores.length > 0
              ? agg.scores.reduce((a, b) => a + b, 0) / agg.scores.length
              : null,
          reason: "views"
        });
      }
    }

    if (agg.scores.length >= 2) {
      const avgClipScore = agg.scores.reduce((a, b) => a + b, 0) / agg.scores.length;
      if (avgClipScore >= 70) {
        withScores.push({
          sourceUrl: agg.sourceUrl,
          title: agg.title,
          channelTitle: agg.channelTitle,
          avgViews: null,
          avgClipScore,
          reason: "clip_score"
        });
      }
    }
  }

  withViews.sort((a, b) => (b.avgViews ?? 0) - (a.avgViews ?? 0));
  withScores.sort((a, b) => (b.avgClipScore ?? 0) - (a.avgClipScore ?? 0));

  // Prefer real view winners; fill with clip-score winners until metrics exist.
  const merged = [...withViews];
  for (const candidate of withScores) {
    if (merged.some((w) => w.sourceUrl === candidate.sourceUrl)) continue;
    merged.push(candidate);
    if (merged.length >= limit) break;
  }

  return merged.slice(0, limit);
}

export type ReinforceResult = {
  winners: number;
  suggestionsAdded: number;
  campaignsQueued: number;
  usedProxyScores: boolean;
};

/**
 * Double down on what's working: find similar long-form YouTube sources and
 * queue the best ones into the clip pipeline.
 */
export async function reinforceWinners(
  settings: AutopilotSettingsRow
): Promise<ReinforceResult> {
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  if (!apiKey) {
    return { winners: 0, suggestionsAdded: 0, campaignsQueued: 0, usedProxyScores: false };
  }

  const winners = await findWinnerSources();
  if (winners.length === 0) {
    return { winners: 0, suggestionsAdded: 0, campaignsQueued: 0, usedProxyScores: false };
  }

  const usedProxyScores = winners.every((w) => w.reason === "clip_score");
  const minSec = Math.max(1, settings.min_source_duration_min ?? 30) * 60;
  const maxSec = Math.max(minSec, settings.max_source_duration_min ?? 120) * 60;

  const supabase = getSupabaseAdmin();
  const { data: knownCampaigns } = await supabase.from("campaigns").select("source_url");
  const known = new Set((knownCampaigns ?? []).map((row) => row.source_url));

  const candidateIds: string[] = [];
  for (const winner of winners) {
    for (const query of similarSearchQueries(winner.title, winner.channelTitle)) {
      candidateIds.push(...(await searchSimilarIds(apiKey, query)));
    }
  }

  const uniqueIds = [...new Set(candidateIds)];
  const details = await fetchDetails(apiKey, uniqueIds);
  const picks: Array<{
    videoId: string;
    url: string;
    title: string;
    channelTitle: string;
    durationSec: number;
    score: number;
  }> = [];

  for (const videoId of uniqueIds) {
    const meta = details.get(videoId);
    if (!meta) continue;
    if (meta.durationSec < minSec || meta.durationSec > maxSec) continue;
    const url = toVideoUrl(videoId);
    if (known.has(url)) continue;
    // Prefer mid-length episodes in the band (closer to 45–90m often = more pitches).
    const lengthScore = 1 - Math.abs(meta.durationSec - 60 * 60) / (90 * 60);
    picks.push({
      videoId,
      url,
      title: meta.title,
      channelTitle: meta.channelTitle,
      durationSec: meta.durationSec,
      score: Math.round(80 + lengthScore * 20)
    });
  }

  picks.sort((a, b) => b.score - a.score);
  const top = picks.slice(0, winners.length * SIMILARS_PER_WINNER);

  let suggestionsAdded = 0;
  if (top.length > 0) {
    const rows = top.map((video) => ({
      video_id: video.videoId,
      url: video.url,
      title: `[Winner-similar] ${video.title}`,
      channel_title: video.channelTitle,
      duration_sec: video.durationSec,
      thumbnail_url: `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`,
      status: "pending" as const,
      score: video.score
    }));

    const { error } = await supabase
      .from("content_suggestions")
      .upsert(rows, { onConflict: "url", ignoreDuplicates: true });
    if (!error) {
      suggestionsAdded = rows.length;
    }
  }

  let campaignsQueued = 0;
  const createdToday = await countCampaignsCreatedToday();
  const dailyCap = Math.max(1, settings.sources_per_day ?? 6);
  const room = Math.max(0, dailyCap - createdToday);
  const toQueue = top.slice(0, Math.min(AUTO_QUEUE_FROM_WINNERS, room));

  for (const video of toQueue) {
    try {
      const { error: insertError } = await supabase.from("campaigns").insert({
        source_url: video.url,
        clip_provider: settings.clip_provider ?? "supoclip",
        niche: settings.niche ?? "shark_tank_entrepreneurs",
        status: "pending"
      });
      if (!insertError) {
        campaignsQueued += 1;
        known.add(video.url);
        await supabase
          .from("content_suggestions")
          .update({ status: "approved", updated_at: new Date().toISOString() })
          .eq("url", video.url)
          .in("status", ["pending"]);
      }
    } catch {
      // Duplicate / race — skip
    }
  }

  return {
    winners: winners.length,
    suggestionsAdded,
    campaignsQueued,
    usedProxyScores
  };
}
