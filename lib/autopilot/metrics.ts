import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { ScheduledPostRow } from "@/lib/supabase/types";

const STALE_AFTER_MS = 6 * 60 * 60 * 1000; // re-check every 6h
const MAX_AGE_DAYS = 14; // only sync posts from the last 2 weeks

export type MetricsJobPost = {
  id: string;
  captionTitle: string | null;
  captionDescription: string | null;
  postedAt: string | null;
  tiktokUrl: string | null;
  views: number | null;
  likes: number | null;
};

export type ScrapedTikTokVideo = {
  videoId: string;
  url: string;
  caption: string;
  createTime: number; // unix seconds
  views: number;
  likes: number;
  comments: number;
  shares: number;
};

function normalizeCaption(text: string | null | undefined): string {
  return (text ?? "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/#\w+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function captionsMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  const left = a.slice(0, 48);
  const right = b.slice(0, 48);
  if (left.length < 12 || right.length < 12) {
    return a.includes(b.slice(0, 20)) || b.includes(a.slice(0, 20));
  }
  return left === right || a.includes(left) || b.includes(left);
}

export async function listPostsNeedingMetrics(limit = 40): Promise<MetricsJobPost[]> {
  const supabase = getSupabaseAdmin();
  const oldest = new Date(Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const staleBefore = new Date(Date.now() - STALE_AFTER_MS).toISOString();

  const { data, error } = await supabase
    .from("scheduled_posts")
    .select(
      "id, caption_title, caption_description, posted_at, tiktok_url, views, likes, metrics_synced_at"
    )
    .eq("status", "posted")
    .gte("posted_at", oldest)
    .or(`metrics_synced_at.is.null,metrics_synced_at.lt.${staleBefore}`)
    .order("posted_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    captionTitle: row.caption_title,
    captionDescription: row.caption_description,
    postedAt: row.posted_at,
    tiktokUrl: row.tiktok_url ?? null,
    views: row.views,
    likes: row.likes
  }));
}

export function matchVideosToPosts(
  posts: MetricsJobPost[],
  videos: ScrapedTikTokVideo[]
): Array<{ postId: string; video: ScrapedTikTokVideo }> {
  const matches: Array<{ postId: string; video: ScrapedTikTokVideo }> = [];
  const usedVideos = new Set<string>();
  const usedPosts = new Set<string>();

  // Exact URL matches first
  for (const post of posts) {
    if (!post.tiktokUrl) continue;
    const video = videos.find(
      (v) => v.url === post.tiktokUrl || post.tiktokUrl?.includes(v.videoId)
    );
    if (video && !usedVideos.has(video.videoId)) {
      matches.push({ postId: post.id, video });
      usedVideos.add(video.videoId);
      usedPosts.add(post.id);
    }
  }

  // Caption + time window matching
  for (const post of posts) {
    if (usedPosts.has(post.id)) continue;
    const postCaption = normalizeCaption(
      `${post.captionTitle ?? ""}\n${post.captionDescription ?? ""}`
    );
    const postedMs = post.postedAt ? new Date(post.postedAt).getTime() : 0;

    let best: { video: ScrapedTikTokVideo; score: number } | null = null;
    for (const video of videos) {
      if (usedVideos.has(video.videoId)) continue;
      const videoCaption = normalizeCaption(video.caption);
      if (!captionsMatch(postCaption, videoCaption)) continue;

      const createMs = video.createTime * 1000;
      const deltaH = Math.abs(createMs - postedMs) / (60 * 60 * 1000);
      if (postedMs && deltaH > 72) continue;

      const score = 100 - deltaH;
      if (!best || score > best.score) {
        best = { video, score };
      }
    }

    if (best) {
      matches.push({ postId: post.id, video: best.video });
      usedVideos.add(best.video.videoId);
      usedPosts.add(post.id);
    }
  }

  return matches;
}

export async function applyMetricsUpdates(
  updates: Array<{
    postId: string;
    views: number;
    likes: number;
    comments: number;
    shares: number;
    tiktokUrl?: string;
  }>
): Promise<number> {
  const supabase = getSupabaseAdmin();
  let applied = 0;
  const now = new Date().toISOString();

  for (const update of updates) {
    const patch: Partial<ScheduledPostRow> & { tiktok_url?: string } = {
      views: update.views,
      likes: update.likes,
      comments: update.comments,
      shares: update.shares,
      metrics_synced_at: now
    };
    if (update.tiktokUrl) {
      patch.tiktok_url = update.tiktokUrl;
    }

    const { error } = await supabase
      .from("scheduled_posts")
      .update(patch)
      .eq("id", update.postId)
      .eq("status", "posted");

    if (!error) {
      applied += 1;
    }
  }

  return applied;
}
