import { getSupabaseAdmin } from "@/lib/supabase/server";

const MIN_POSTS_TO_JUDGE = 2;
/** Sources averaging under this many views get blocked from rediscovery. */
const LOSER_AVG_VIEWS = 400;

/**
 * Mark chronically underperforming source URLs as rejected suggestions so
 * discovery stops proposing them.
 */
export async function pruneLoserSources(): Promise<number> {
  const supabase = getSupabaseAdmin();

  const { data: posts, error } = await supabase
    .from("scheduled_posts")
    .select("views, campaign_id, campaigns!inner(source_url, status)")
    .eq("status", "posted")
    .not("views", "is", null)
    .limit(500);

  if (error || !posts?.length) {
    return 0;
  }

  const bySource = new Map<string, number[]>();
  for (const row of posts) {
    const campaign = row.campaigns as unknown as { source_url?: string } | null;
    const url = campaign?.source_url;
    const views = row.views;
    if (!url || typeof views !== "number") continue;
    const list = bySource.get(url) ?? [];
    list.push(views);
    bySource.set(url, list);
  }

  const losers: string[] = [];
  for (const [url, views] of bySource) {
    if (views.length < MIN_POSTS_TO_JUDGE) continue;
    const avg = views.reduce((sum, value) => sum + value, 0) / views.length;
    if (avg < LOSER_AVG_VIEWS) {
      losers.push(url);
    }
  }

  if (losers.length === 0) {
    return 0;
  }

  let pruned = 0;
  for (const url of losers) {
    const videoId = url.match(/[?&]v=([^&]+)/)?.[1] ?? url.slice(-11);
    const { error: upsertError } = await supabase.from("content_suggestions").upsert(
      {
        video_id: videoId,
        url,
        status: "rejected",
        title: "Auto-rejected: low average views",
        score: 0
      },
      { onConflict: "url" }
    );
    if (!upsertError) {
      pruned += 1;
    }
  }

  return pruned;
}
