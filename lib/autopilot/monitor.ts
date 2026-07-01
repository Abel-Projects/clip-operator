import { getSupabaseAdmin } from "@/lib/supabase/server";
import type {
  CampaignClipRow,
  CampaignRow,
  PostStatus,
  ScheduledPostRow
} from "@/lib/supabase/types";

export type MonitorPost = {
  id: string;
  status: PostStatus;
  scheduledAt: string;
  postedAt: string | null;
  captionTitle: string | null;
  errorMessage: string | null;
  providerClipId: string;
  providerProjectId: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  metricsSyncedAt: string | null;
  clip: {
    title: string | null;
    score: number | null;
    durationSec: number | null;
    previewUrl: string | null;
    rank: number;
  } | null;
  campaign: {
    id: string;
    sourceUrl: string;
    status: CampaignRow["status"];
    providerProjectId: string | null;
  } | null;
};

export type MonitorSummary = {
  totalPosts: number;
  posted: number;
  queued: number;
  failed: number;
  avgClipScore: number | null;
  metricsPending: number;
};

function averageScore(clips: (number | null | undefined)[]): number | null {
  const values = clips.filter((value): value is number => typeof value === "number");
  if (values.length === 0) {
    return null;
  }

  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

export async function getMonitorFeed(limit = 50): Promise<{
  posts: MonitorPost[];
  summary: MonitorSummary;
}> {
  const supabase = getSupabaseAdmin();

  const { data: posts, error: postsError } = await supabase
    .from("scheduled_posts")
    .select("*")
    .order("scheduled_at", { ascending: false })
    .limit(limit);

  if (postsError) {
    throw new Error(postsError.message);
  }

  const rows = (posts ?? []) as ScheduledPostRow[];
  const campaignIds = [...new Set(rows.map((row) => row.campaign_id))];
  const clipIds = [...new Set(rows.map((row) => row.campaign_clip_id))];

  const [{ data: campaigns }, { data: clips }] = await Promise.all([
    campaignIds.length
      ? supabase.from("campaigns").select("*").in("id", campaignIds)
      : Promise.resolve({ data: [] as CampaignRow[] }),
    clipIds.length
      ? supabase.from("campaign_clips").select("*").in("id", clipIds)
      : Promise.resolve({ data: [] as CampaignClipRow[] })
  ]);

  const campaignMap = new Map((campaigns ?? []).map((row) => [row.id, row as CampaignRow]));
  const clipMap = new Map((clips ?? []).map((row) => [row.id, row as CampaignClipRow]));

  const feed: MonitorPost[] = rows.map((row) => {
    const clip = clipMap.get(row.campaign_clip_id);
    const campaign = campaignMap.get(row.campaign_id);

    return {
      id: row.id,
      status: row.status,
      scheduledAt: row.scheduled_at,
      postedAt: row.posted_at,
      captionTitle: row.caption_title,
      errorMessage: row.error_message,
      providerClipId: row.provider_clip_id,
      providerProjectId: row.provider_project_id,
      views: row.views ?? null,
      likes: row.likes ?? null,
      comments: row.comments ?? null,
      shares: row.shares ?? null,
      metricsSyncedAt: row.metrics_synced_at ?? null,
      clip: clip
        ? {
            title: clip.title,
            score: clip.score,
            durationSec: clip.duration_sec,
            previewUrl: clip.preview_url,
            rank: clip.rank
          }
        : null,
      campaign: campaign
        ? {
            id: campaign.id,
            sourceUrl: campaign.source_url,
            status: campaign.status,
            providerProjectId: campaign.provider_project_id
          }
        : null
    };
  });

  const posted = rows.filter((row) => row.status === "posted").length;
  const queued = rows.filter((row) => row.status === "queued").length;
  const failed = rows.filter((row) => row.status === "failed").length;
  const metricsPending = rows.filter(
    (row) => row.status === "posted" && row.views == null
  ).length;

  return {
    posts: feed,
    summary: {
      totalPosts: rows.length,
      posted,
      queued,
      failed,
      avgClipScore: averageScore(feed.map((post) => post.clip?.score ?? null)),
      metricsPending
    }
  };
}
