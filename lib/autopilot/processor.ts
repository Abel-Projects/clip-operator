import { buildAutopilotCaption } from "@/lib/autopilot/captions";
import { getAutopilotSettings } from "@/lib/autopilot/settings";
import {
  canPostNow,
  computeNextPostSlots,
  getDueScheduledPosts
} from "@/lib/autopilot/scheduler";
import {
  createOpusClipProject,
  getOpusClipProjectClips,
  publishOpusClipToTikTok,
  type OpusClipClip
} from "@/lib/opusclip";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { CampaignRow } from "@/lib/supabase/types";

const MAX_CLIP_POLLS = 48;

export type AutopilotTickResult = {
  ok: boolean;
  actions: string[];
  error?: string;
};

function rankClips(clips: OpusClipClip[]): OpusClipClip[] {
  return [...clips].sort((a, b) => {
    const scoreA = a.score ?? -1;
    const scoreB = b.score ?? -1;
    if (scoreB !== scoreA) {
      return scoreB - scoreA;
    }

    return (b.durationSec ?? 0) - (a.durationSec ?? 0);
  });
}

async function failCampaign(campaignId: string, message: string) {
  const supabase = getSupabaseAdmin();
  await supabase
    .from("campaigns")
    .update({ status: "failed", error_message: message })
    .eq("id", campaignId);
}

async function processPendingCampaign(
  campaign: CampaignRow,
  actions: string[]
): Promise<void> {
  const project = await createOpusClipProject({
    videoUrl: campaign.source_url,
    sourceLang: "auto",
    clipDurationSec: 90
  });

  if (!project.ok) {
    await failCampaign(campaign.id, project.message);
    actions.push(`Campaign ${campaign.id}: failed to start OpusClip — ${project.message}`);
    return;
  }

  const supabase = getSupabaseAdmin();
  await supabase
    .from("campaigns")
    .update({
      status: "clipping",
      opus_project_id: project.projectId,
      poll_count: 0,
      error_message: null
    })
    .eq("id", campaign.id);

  actions.push(`Campaign ${campaign.id}: started OpusClip project ${project.projectId}`);
}

async function processClippingCampaign(
  campaign: CampaignRow,
  actions: string[]
): Promise<void> {
  if (!campaign.opus_project_id) {
    await failCampaign(campaign.id, "Missing OpusClip project ID.");
    return;
  }

  const supabase = getSupabaseAdmin();
  const clipsResult = await getOpusClipProjectClips(campaign.opus_project_id);

  if (!clipsResult.ok) {
    await failCampaign(campaign.id, clipsResult.message);
    actions.push(`Campaign ${campaign.id}: clip fetch failed`);
    return;
  }

  if (clipsResult.clips.length === 0) {
    const nextPoll = campaign.poll_count + 1;
    if (nextPoll >= MAX_CLIP_POLLS) {
      await failCampaign(
        campaign.id,
        "OpusClip did not return clips before the autopilot timeout."
      );
      actions.push(`Campaign ${campaign.id}: timed out waiting for clips`);
      return;
    }

    await supabase
      .from("campaigns")
      .update({ poll_count: nextPoll })
      .eq("id", campaign.id);

    actions.push(
      `Campaign ${campaign.id}: waiting for clips (poll ${nextPoll}/${MAX_CLIP_POLLS})`
    );
    return;
  }

  const settings = await getAutopilotSettings();
  const ranked = rankClips(clipsResult.clips).filter(
    (clip) => (clip.score ?? 100) >= settings.min_clip_score
  );
  const selected = ranked.slice(0, settings.max_clips_per_source);

  if (selected.length === 0) {
    await failCampaign(campaign.id, "No clips passed the minimum score threshold.");
    actions.push(`Campaign ${campaign.id}: no clips met score threshold`);
    return;
  }

  await supabase.from("campaign_clips").delete().eq("campaign_id", campaign.id);

  const clipRows = selected.map((clip, index) => ({
    campaign_id: campaign.id,
    opus_clip_id: clip.clipId,
    title: clip.title ?? null,
    score: clip.score ?? null,
    duration_sec: clip.durationSec ?? null,
    preview_url: clip.previewUrl ?? null,
    rank: index + 1,
    selected: true
  }));

  const { error: clipInsertError } = await supabase
    .from("campaign_clips")
    .insert(clipRows);

  if (clipInsertError) {
    await failCampaign(campaign.id, clipInsertError.message);
    return;
  }

  await supabase
    .from("campaigns")
    .update({ status: "scheduling" })
    .eq("id", campaign.id);

  actions.push(
    `Campaign ${campaign.id}: selected ${selected.length} clip(s), scheduling posts`
  );
}

async function processSchedulingCampaign(
  campaign: CampaignRow,
  actions: string[]
): Promise<void> {
  if (!campaign.opus_project_id) {
    await failCampaign(campaign.id, "Missing OpusClip project ID.");
    return;
  }

  const supabase = getSupabaseAdmin();
  const settings = await getAutopilotSettings();

  const { data: clips, error: clipsError } = await supabase
    .from("campaign_clips")
    .select("*")
    .eq("campaign_id", campaign.id)
    .eq("selected", true)
    .order("rank", { ascending: true });

  if (clipsError || !clips?.length) {
    await failCampaign(campaign.id, clipsError?.message ?? "No clips to schedule.");
    return;
  }

  const slots = await computeNextPostSlots({
    count: clips.length,
    settings
  });

  const posts = clips.map((clip, index) => {
    const caption = buildAutopilotCaption({
      title: clip.title,
      description: clip.title
    });

    return {
      campaign_id: campaign.id,
      campaign_clip_id: clip.id,
      opus_project_id: campaign.opus_project_id!,
      opus_clip_id: clip.opus_clip_id,
      scheduled_at: slots[index]!.toISOString(),
      status: "queued" as const,
      caption_title: caption.title,
      caption_description: caption.description
    };
  });

  const { error: postError } = await supabase.from("scheduled_posts").insert(posts);

  if (postError) {
    await failCampaign(campaign.id, postError.message);
    return;
  }

  await supabase
    .from("campaigns")
    .update({ status: "active" })
    .eq("id", campaign.id);

  actions.push(
    `Campaign ${campaign.id}: queued ${posts.length} TikTok post(s) with ${settings.min_hours_between_posts}h spacing`
  );
}

async function processDuePosts(actions: string[]): Promise<void> {
  const settings = await getAutopilotSettings();
  if (!settings.enabled) {
    return;
  }

  if (!(await canPostNow(settings))) {
    return;
  }

  const due = await getDueScheduledPosts(1);
  if (due.length === 0) {
    return;
  }

  const post = due[0]!;
  const supabase = getSupabaseAdmin();

  await supabase
    .from("scheduled_posts")
    .update({ status: "posting", error_message: null })
    .eq("id", post.id);

  const { data: clipRow } = await supabase
    .from("campaign_clips")
    .select("*")
    .eq("id", post.campaign_clip_id)
    .maybeSingle();

  const caption = buildAutopilotCaption({
    title: post.caption_title ?? clipRow?.title,
    description: post.caption_description ?? clipRow?.title
  });

  const result = await publishOpusClipToTikTok({
    projectId: post.opus_project_id,
    clip: {
      id: `${post.opus_project_id}.${post.opus_clip_id}`,
      clipId: post.opus_clip_id,
      title: caption.title,
      description: caption.description
    }
  });

  if (result.ok) {
    await supabase
      .from("scheduled_posts")
      .update({
        status: "posted",
        posted_at: new Date().toISOString(),
        caption_title: caption.title,
        caption_description: caption.description,
        error_message: null
      })
      .eq("id", post.id);

    actions.push(`Posted clip ${post.opus_clip_id} to TikTok`);
  } else {
    await supabase
      .from("scheduled_posts")
      .update({
        status: "failed",
        error_message: result.message
      })
      .eq("id", post.id);

    actions.push(`Failed to post clip ${post.opus_clip_id}: ${result.message}`);
  }
}

async function finalizeActiveCampaigns(actions: string[]): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data: activeCampaigns } = await supabase
    .from("campaigns")
    .select("id")
    .eq("status", "active");

  for (const campaign of activeCampaigns ?? []) {
    const { count: pendingCount } = await supabase
      .from("scheduled_posts")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", campaign.id)
      .in("status", ["queued", "posting"]);

    if (pendingCount === 0) {
      await supabase
        .from("campaigns")
        .update({ status: "done" })
        .eq("id", campaign.id);

      actions.push(`Campaign ${campaign.id}: all posts complete`);
    }
  }
}

export async function runAutopilotTick(): Promise<AutopilotTickResult> {
  const actions: string[] = [];

  try {
    const settings = await getAutopilotSettings();
    if (!settings.enabled) {
      return { ok: true, actions: ["Autopilot is paused"] };
    }

    const supabase = getSupabaseAdmin();

    const { data: pending } = await supabase
      .from("campaigns")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(1);

    if (pending?.[0]) {
      await processPendingCampaign(pending[0], actions);
      return { ok: true, actions };
    }

    const { data: clipping } = await supabase
      .from("campaigns")
      .select("*")
      .eq("status", "clipping")
      .order("created_at", { ascending: true })
      .limit(1);

    if (clipping?.[0]) {
      await processClippingCampaign(clipping[0], actions);
      return { ok: true, actions };
    }

    const { data: scheduling } = await supabase
      .from("campaigns")
      .select("*")
      .eq("status", "scheduling")
      .order("created_at", { ascending: true })
      .limit(1);

    if (scheduling?.[0]) {
      await processSchedulingCampaign(scheduling[0], actions);
      return { ok: true, actions };
    }

    await processDuePosts(actions);
    await finalizeActiveCampaigns(actions);

    if (actions.length === 0) {
      actions.push("No work due");
    }

    return { ok: true, actions };
  } catch (error) {
    return {
      ok: false,
      actions,
      error: error instanceof Error ? error.message : "Autopilot tick failed."
    };
  }
}

export async function createCampaign(input: {
  sourceUrl: string;
}): Promise<CampaignRow> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("campaigns")
    .insert({
      source_url: input.sourceUrl.trim(),
      status: "pending"
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Could not create campaign.");
  }

  return data;
}

export async function listCampaigns(limit = 20) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("campaigns")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function getCampaignWithDetails(campaignId: string) {
  const supabase = getSupabaseAdmin();

  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .maybeSingle();

  if (campaignError) {
    throw new Error(campaignError.message);
  }

  if (!campaign) {
    return null;
  }

  const [{ data: clips }, { data: posts }] = await Promise.all([
    supabase
      .from("campaign_clips")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("rank", { ascending: true }),
    supabase
      .from("scheduled_posts")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("scheduled_at", { ascending: true })
  ]);

  return { campaign, clips: clips ?? [], posts: posts ?? [] };
}

export async function getAutopilotQueueSummary() {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  const [
    { count: pendingCampaigns },
    { count: queuedPosts },
    { count: postedToday }
  ] = await Promise.all([
    supabase
      .from("campaigns")
      .select("*", { count: "exact", head: true })
      .in("status", ["pending", "clipping", "scheduling", "active"]),
    supabase
      .from("scheduled_posts")
      .select("*", { count: "exact", head: true })
      .eq("status", "queued"),
    supabase
      .from("scheduled_posts")
      .select("*", { count: "exact", head: true })
      .eq("status", "posted")
      .gte("posted_at", startOfTodayIso())
  ]);

  const { data: nextPost } = await supabase
    .from("scheduled_posts")
    .select("scheduled_at")
    .eq("status", "queued")
    .gte("scheduled_at", now)
    .order("scheduled_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return {
    pendingCampaigns: pendingCampaigns ?? 0,
    queuedPosts: queuedPosts ?? 0,
    postedToday: postedToday ?? 0,
    nextPostAt: nextPost?.scheduled_at ?? null
  };
}

function startOfTodayIso(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}
