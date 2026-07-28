import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { AutopilotSettingsRow } from "@/lib/supabase/types";
import {
  isUsSharkTankSource,
  usSharkTankRejectReason
} from "@/lib/autopilot/niche-filter";

export type DiscoveredVideo = {
  videoId: string;
  url: string;
  title: string;
  channelTitle: string;
  durationSec: number;
};

const YOUTUBE_API = "https://www.googleapis.com/youtube/v3";

function parseIso8601Duration(value: string): number {
  const match = value.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) {
    return 0;
  }

  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  return hours * 3600 + minutes * 60 + seconds;
}

function toVideoUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

function parseKeywordList(settings: AutopilotSettingsRow): string[] {
  const raw = settings.discovery_keywords;
  if (Array.isArray(raw)) {
    return raw.filter((entry): entry is string => typeof entry === "string");
  }
  return [];
}

function parseChannelList(settings: AutopilotSettingsRow): string[] {
  const raw = settings.discovery_channels;
  if (Array.isArray(raw)) {
    return raw.filter((entry): entry is string => typeof entry === "string");
  }
  return [];
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
  if (!response.ok) {
    return null;
  }

  return (await response.json()) as T;
}

export function videoIdFromYoutubeUrl(url: string): string | null {
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = parsed.pathname.split("/").filter(Boolean)[0];
      return id || null;
    }
    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      const v = parsed.searchParams.get("v");
      if (v) return v;
      const parts = parsed.pathname.split("/").filter(Boolean);
      if (parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "live") {
        return parts[1] ?? null;
      }
    }
  } catch {
    // fall through
  }
  return trimmed.match(/[?&]v=([^&]+)/)?.[1] ?? null;
}

/** Reject non–US Shark Tank episode URLs before creating a campaign. */
export async function assertUsSharkTankSourceUrl(sourceUrl: string): Promise<{
  title: string;
  channelTitle: string;
}> {
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("YOUTUBE_API_KEY is required to validate Shark Tank sources.");
  }

  const videoId = videoIdFromYoutubeUrl(sourceUrl);
  if (!videoId) {
    throw new Error("Need a valid YouTube watch URL.");
  }

  const details = await fetchVideoDetails(apiKey, [videoId]);
  const meta = details.get(videoId);
  if (!meta?.title) {
    throw new Error("Could not load that YouTube video.");
  }

  const reason = usSharkTankRejectReason({
    title: meta.title,
    channelTitle: meta.channelTitle
  });
  if (reason) {
    throw new Error(
      `Only US Shark Tank full episodes are allowed (${reason}).`
    );
  }

  return { title: meta.title, channelTitle: meta.channelTitle };
}

async function fetchVideoDetails(
  apiKey: string,
  videoIds: string[]
): Promise<Map<string, { durationSec: number; title: string; channelTitle: string }>> {
  if (videoIds.length === 0) {
    return new Map();
  }

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

  const map = new Map<string, { durationSec: number; title: string; channelTitle: string }>();
  for (const item of payload?.items ?? []) {
    if (!item.id) continue;
    map.set(item.id, {
      durationSec: parseIso8601Duration(item.contentDetails?.duration ?? ""),
      title: item.snippet?.title ?? item.id,
      channelTitle: item.snippet?.channelTitle ?? ""
    });
  }

  return map;
}

function isUsableTitle(title: string, channelTitle = ""): boolean {
  return isUsSharkTankSource({ title, channelTitle });
}

function durationWindow(settings: AutopilotSettingsRow): {
  minDurationSec: number;
  maxDurationSec: number;
} {
  const minMinutes = Math.max(1, settings.min_source_duration_min ?? 15);
  const maxMinutes = Math.max(minMinutes, settings.max_source_duration_min ?? 30);
  return {
    minDurationSec: minMinutes * 60,
    maxDurationSec: maxMinutes * 60
  };
}

function passesDurationFilter(
  durationSec: number,
  minDurationSec: number,
  maxDurationSec: number
): boolean {
  return durationSec >= minDurationSec && durationSec <= maxDurationSec;
}

async function searchByKeyword(
  apiKey: string,
  query: string,
  maxResults: number,
  videoDuration: "medium" | "long" = "medium"
): Promise<string[]> {
  const payload = await youtubeGet<{
    items?: Array<{ id?: { videoId?: string } }>;
  }>(apiKey, "/search", {
    part: "snippet",
    type: "video",
    q: query,
    maxResults: String(maxResults),
    order: "date",
    videoDuration,
    relevanceLanguage: "en",
    regionCode: "US",
    safeSearch: "moderate"
  });

  return (payload?.items ?? [])
    .map((item) => item.id?.videoId)
    .filter((id): id is string => Boolean(id));
}

async function latestFromChannel(
  apiKey: string,
  channelId: string,
  maxResults: number
): Promise<string[]> {
  const channelPayload = await youtubeGet<{
    items?: Array<{ contentDetails?: { relatedPlaylists?: { uploads?: string } } }>;
  }>(apiKey, "/channels", {
    part: "contentDetails",
    id: channelId
  });

  const uploadsPlaylist =
    channelPayload?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylist) {
    return [];
  }

  const playlistPayload = await youtubeGet<{
    items?: Array<{ snippet?: { resourceId?: { videoId?: string } } }>;
  }>(apiKey, "/playlistItems", {
    part: "snippet",
    playlistId: uploadsPlaylist,
    maxResults: String(maxResults)
  });

  return (playlistPayload?.items ?? [])
    .map((item) => item.snippet?.resourceId?.videoId)
    .filter((id): id is string => Boolean(id));
}

async function getKnownSourceUrls(): Promise<Set<string>> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from("campaigns").select("source_url");
  return new Set((data ?? []).map((row) => row.source_url));
}

/** URLs the user downvoted (or already suggested) so we don't re-propose them. */
async function getSuggestedOrRejectedUrls(): Promise<Set<string>> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("content_suggestions")
    .select("url, status");
  return new Set((data ?? []).map((row) => row.url));
}

function thumbnailFor(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

/** Remove pending suggestions that no longer match the duration window. */
async function pruneShortSuggestions(minDurationSec: number): Promise<void> {
  const supabase = getSupabaseAdmin();
  await supabase
    .from("content_suggestions")
    .delete()
    .eq("status", "pending")
    .lt("duration_sec", minDurationSec);
}

/** Discover multiple candidate videos that pass the niche filters. */
export async function discoverCandidates(
  settings: AutopilotSettingsRow,
  limit = 8
): Promise<DiscoveredVideo[]> {
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  if (!apiKey) {
    return [];
  }

  const { minDurationSec, maxDurationSec } = durationWindow(settings);
  await pruneShortSuggestions(minDurationSec);

  const known = await getKnownSourceUrls();
  const candidateIds: string[] = [];

  for (const channelId of parseChannelList(settings)) {
    candidateIds.push(...(await latestFromChannel(apiKey, channelId, 30)));
  }

  // YouTube search buckets: medium = 4–20 min, long = 20+ min.
  // When we want long-form episodes, skip "medium" entirely.
  const preferLongOnly = minDurationSec >= 20 * 60;
  for (const keyword of parseKeywordList(settings)) {
    if (!preferLongOnly) {
      candidateIds.push(...(await searchByKeyword(apiKey, keyword, 10, "medium")));
    }
    candidateIds.push(...(await searchByKeyword(apiKey, keyword, 15, "long")));
  }

  const uniqueIds = [...new Set(candidateIds)];
  if (uniqueIds.length === 0) {
    return [];
  }

  const details = await fetchVideoDetails(apiKey, uniqueIds);
  const results: DiscoveredVideo[] = [];

  for (const videoId of uniqueIds) {
    const url = toVideoUrl(videoId);
    if (known.has(url)) continue;

    const meta = details.get(videoId);
    if (!meta) continue;
    if (!passesDurationFilter(meta.durationSec, minDurationSec, maxDurationSec)) continue;
    if (!isUsableTitle(meta.title, meta.channelTitle)) continue;

    results.push({
      videoId,
      url,
      title: meta.title,
      channelTitle: meta.channelTitle,
      durationSec: meta.durationSec
    });

    if (results.length >= limit) break;
  }

  return results;
}

/** Save discovered candidates as pending suggestions (skips already seen/rejected). */
export async function recordSuggestions(
  videos: DiscoveredVideo[]
): Promise<number> {
  if (videos.length === 0) return 0;

  const seen = await getSuggestedOrRejectedUrls();
  const rows = videos
    .filter((video) => !seen.has(video.url))
    .map((video) => ({
      video_id: video.videoId,
      url: video.url,
      title: video.title,
      channel_title: video.channelTitle,
      duration_sec: video.durationSec,
      thumbnail_url: thumbnailFor(video.videoId),
      status: "pending" as const
    }));

  if (rows.length === 0) return 0;

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("content_suggestions")
    .upsert(rows, { onConflict: "url", ignoreDuplicates: true });

  return error ? 0 : rows.length;
}

/** Reject pending suggestions that are not US Shark Tank (podcasts, foreign franchises, etc.). */
export async function pruneOffNichePendingSuggestions(): Promise<number> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("content_suggestions")
    .select("id, title, channel_title")
    .eq("status", "pending")
    .limit(500);

  if (error || !data?.length) {
    return 0;
  }

  const rejectIds = data
    .filter(
      (row) =>
        !isUsSharkTankSource({
          title: row.title,
          channelTitle: row.channel_title
        })
    )
    .map((row) => row.id);

  if (rejectIds.length === 0) {
    return 0;
  }

  const { error: updateError } = await supabase
    .from("content_suggestions")
    .update({ status: "rejected", updated_at: new Date().toISOString() })
    .in("id", rejectIds);

  return updateError ? 0 : rejectIds.length;
}

export async function countCampaignsCreatedToday(): Promise<number> {
  const supabase = getSupabaseAdmin();
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);

  const { count } = await supabase
    .from("campaigns")
    .select("*", { count: "exact", head: true })
    .gte("created_at", start.toISOString());

  return count ?? 0;
}

export async function discoverSourceVideo(
  settings: AutopilotSettingsRow
): Promise<DiscoveredVideo | null> {
  const supabase = getSupabaseAdmin();
  const { data: rejected } = await supabase
    .from("content_suggestions")
    .select("url")
    .eq("status", "rejected");
  const rejectedUrls = new Set((rejected ?? []).map((row) => row.url));

  const candidates = await discoverCandidates(settings, 8);
  return candidates.find((video) => !rejectedUrls.has(video.url)) ?? null;
}
