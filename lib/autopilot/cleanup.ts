import { getSupabaseAdmin } from "@/lib/supabase/server";

export const DEFAULT_FAILED_RETENTION_DAYS = 7;

export type CleanupFailedResult = {
  postsDeleted: number;
  campaignsDeleted: number;
};

function cutoffIso(days: number): string {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  return cutoff.toISOString();
}

/** Delete failed posts and failed campaigns. Omit `olderThanDays` to remove all failed rows. */
export async function cleanupFailedRecords(input?: {
  olderThanDays?: number;
}): Promise<CleanupFailedResult> {
  const supabase = getSupabaseAdmin();
  const olderThanDays = input?.olderThanDays;

  let postsQuery = supabase.from("scheduled_posts").delete().eq("status", "failed");
  let campaignsQuery = supabase.from("campaigns").delete().eq("status", "failed");

  if (olderThanDays != null && olderThanDays > 0) {
    const cutoff = cutoffIso(olderThanDays);
    postsQuery = postsQuery.lt("created_at", cutoff);
    campaignsQuery = campaignsQuery.lt("created_at", cutoff);
  }

  const { data: deletedPosts, error: postsError } = await postsQuery.select("id");
  if (postsError) {
    throw new Error(postsError.message);
  }

  const { data: deletedCampaigns, error: campaignsError } =
    await campaignsQuery.select("id");
  if (campaignsError) {
    throw new Error(campaignsError.message);
  }

  return {
    postsDeleted: deletedPosts?.length ?? 0,
    campaignsDeleted: deletedCampaigns?.length ?? 0
  };
}

export async function cleanupStaleFailedRecords(): Promise<CleanupFailedResult> {
  return cleanupFailedRecords({ olderThanDays: DEFAULT_FAILED_RETENTION_DAYS });
}
