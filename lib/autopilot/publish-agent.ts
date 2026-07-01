import { buildAutopilotCaption } from "@/lib/autopilot/captions";
import { canPostNow } from "@/lib/autopilot/scheduler";
import { getAutopilotSettings } from "@/lib/autopilot/settings";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { ScheduledPostRow } from "@/lib/supabase/types";

const STALE_POSTING_MS = 30 * 60 * 1000;

export type PublishJob = {
  id: string;
  projectId: string;
  clipId: string;
  caption: string;
  scheduledAt: string;
};

export function isPublishAgentAuthorized(req: Request): boolean {
  const secret =
    process.env.PUBLISH_AGENT_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim();

  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }

  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) {
    return true;
  }

  return req.headers.get("x-publish-agent-secret") === secret;
}

function formatTikTokCaption(caption: { title: string; description: string }): string {
  const body =
    caption.title === caption.description
      ? caption.title
      : `${caption.title}\n\n${caption.description}`;

  return `${body}\n\n#sharktank #entrepreneur #business #startup`;
}

export async function recoverStalePostingJobs(): Promise<number> {
  const supabase = getSupabaseAdmin();

  const { data: posting, error } = await supabase
    .from("scheduled_posts")
    .select("id, error_message")
    .eq("status", "posting");

  if (error) {
    throw new Error(error.message);
  }

  let recovered = 0;
  const now = Date.now();

  for (const row of posting ?? []) {
    const marker = row.error_message ?? "";
    const claimedAt =
      marker.startsWith("claim:") ? Date.parse(marker.slice(6)) : Number.NaN;

    if (!Number.isFinite(claimedAt) || now - claimedAt < STALE_POSTING_MS) {
      continue;
    }

    const { error: updateError } = await supabase
      .from("scheduled_posts")
      .update({
        status: "queued",
        error_message: "Publish agent timed out; re-queued."
      })
      .eq("id", row.id)
      .eq("status", "posting");

    if (!updateError) {
      recovered += 1;
    }
  }

  return recovered;
}

export async function claimNextSupoclipPublishJob(): Promise<PublishJob | null> {
  await recoverStalePostingJobs();

  const settings = await getAutopilotSettings();
  if (!settings.enabled) {
    return null;
  }

  if (!(await canPostNow(settings))) {
    return null;
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  const { data: candidates, error } = await supabase
    .from("scheduled_posts")
    .select("*, campaigns!inner(clip_provider)")
    .eq("status", "queued")
    .eq("campaigns.clip_provider", "supoclip")
    .lte("scheduled_at", now)
    .order("scheduled_at", { ascending: true })
    .limit(5);

  if (error) {
    throw new Error(error.message);
  }

  for (const row of candidates ?? []) {
    const post = row as ScheduledPostRow & {
      campaigns?: { clip_provider?: string };
    };

    const { data: inFlight } = await supabase
      .from("scheduled_posts")
      .select("id")
      .eq("status", "posting")
      .limit(1)
      .maybeSingle();

    if (inFlight) {
      return null;
    }

    const claimMarker = `claim:${new Date().toISOString()}`;

    const { data: claimed, error: claimError } = await supabase
      .from("scheduled_posts")
      .update({ status: "posting", error_message: claimMarker })
      .eq("id", post.id)
      .eq("status", "queued")
      .select("*")
      .maybeSingle();

    if (claimError || !claimed) {
      continue;
    }

    const { data: clipRow } = await supabase
      .from("campaign_clips")
      .select("*")
      .eq("id", claimed.campaign_clip_id)
      .maybeSingle();

    const caption = buildAutopilotCaption({
      title: claimed.caption_title ?? clipRow?.title,
      description: claimed.caption_description ?? clipRow?.title
    });

    return {
      id: claimed.id,
      projectId: claimed.provider_project_id,
      clipId: claimed.provider_clip_id,
      caption: formatTikTokCaption(caption),
      scheduledAt: claimed.scheduled_at
    };
  }

  return null;
}

export async function completePublishJob(
  postId: string,
  result: { ok: boolean; message?: string }
): Promise<{ ok: boolean; message: string }> {
  const supabase = getSupabaseAdmin();

  const { data: post, error: fetchError } = await supabase
    .from("scheduled_posts")
    .select("*")
    .eq("id", postId)
    .maybeSingle();

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  if (!post) {
    return { ok: false, message: "Post not found." };
  }

  if (post.status !== "posting") {
    return { ok: false, message: `Post is ${post.status}, not posting.` };
  }

  if (result.ok) {
    const { error } = await supabase
      .from("scheduled_posts")
      .update({
        status: "posted",
        posted_at: new Date().toISOString(),
        error_message: null
      })
      .eq("id", postId);

    if (error) {
      throw new Error(error.message);
    }

    return { ok: true, message: result.message ?? "Posted to TikTok." };
  }

  const { error } = await supabase
    .from("scheduled_posts")
    .update({
      status: "failed",
      error_message: result.message ?? "TikTok upload failed."
    })
    .eq("id", postId);

  if (error) {
    throw new Error(error.message);
  }

  return { ok: true, message: result.message ?? "Marked as failed." };
}
