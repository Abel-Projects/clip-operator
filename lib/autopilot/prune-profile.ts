import { getAutopilotSettings } from "@/lib/autopilot/settings";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export type PruneJob = {
  id: string;
  tiktokUrl: string;
  videoId: string;
  views: number;
  postedAt: string;
  captionTitle: string | null;
};

export function videoIdFromTikTokUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/\/video\/(\d+)/);
  return match?.[1] ?? null;
}

/**
 * Posted clips that underperformed after enough time — delete from TikTok
 * so the public profile stays stacked with stronger posts.
 */
export async function listPostsToPrune(limitOverride?: number): Promise<PruneJob[]> {
  const settings = await getAutopilotSettings();
  if (settings.profile_prune_enabled === false) {
    return [];
  }

  const maxViews = Math.max(0, settings.profile_prune_max_views ?? 40);
  const minAgeHours = Math.max(1, settings.profile_prune_min_age_hours ?? 48);
  const limit = Math.min(
    20,
    Math.max(1, limitOverride ?? settings.profile_prune_max_per_run ?? 5)
  );
  const oldest = new Date(Date.now() - minAgeHours * 60 * 60 * 1000).toISOString();

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("scheduled_posts")
    .select("id, tiktok_url, views, posted_at, caption_title, metrics_synced_at")
    .eq("status", "posted")
    .not("tiktok_url", "is", null)
    .not("views", "is", null)
    .not("metrics_synced_at", "is", null)
    .lte("views", maxViews)
    .lte("posted_at", oldest)
    .order("views", { ascending: true })
    .order("posted_at", { ascending: true })
    .limit(limit * 3);

  if (error) {
    throw new Error(error.message);
  }

  const jobs: PruneJob[] = [];
  for (const row of data ?? []) {
    const videoId = videoIdFromTikTokUrl(row.tiktok_url);
    if (!videoId || !row.tiktok_url || row.views == null || !row.posted_at) continue;
    jobs.push({
      id: row.id,
      tiktokUrl: row.tiktok_url,
      videoId,
      views: row.views,
      postedAt: row.posted_at,
      captionTitle: row.caption_title
    });
    if (jobs.length >= limit) break;
  }

  return jobs;
}

export async function markPostDeleted(
  postId: string,
  result: { ok: boolean; message?: string }
): Promise<{ ok: boolean; message: string }> {
  const supabase = getSupabaseAdmin();

  const { data: post, error: fetchError } = await supabase
    .from("scheduled_posts")
    .select("id, status")
    .eq("id", postId)
    .maybeSingle();

  if (fetchError) {
    throw new Error(fetchError.message);
  }
  if (!post) {
    return { ok: false, message: "Post not found." };
  }
  if (post.status !== "posted") {
    return { ok: false, message: `Post is ${post.status}, not posted.` };
  }

  if (!result.ok) {
    return {
      ok: false,
      message: result.message ?? "TikTok delete failed; left as posted."
    };
  }

  const { error } = await supabase
    .from("scheduled_posts")
    .update({
      status: "deleted",
      error_message: result.message ?? "Pruned from profile: low views"
    })
    .eq("id", postId)
    .eq("status", "posted");

  if (error) {
    throw new Error(error.message);
  }

  return { ok: true, message: result.message ?? "Deleted from TikTok profile." };
}
