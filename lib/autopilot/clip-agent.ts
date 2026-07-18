import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getAutopilotSettings } from "@/lib/autopilot/settings";
import type { CampaignRow } from "@/lib/supabase/types";

const STALE_CLAIM_MS = 12 * 60 * 1000;
const MAX_CLIP_POLLS = 48;

function parseClaimedAt(errorMessage: string | null): number | null {
  const marker = errorMessage ?? "";
  if (!marker.startsWith("claim:")) {
    return null;
  }
  const claimedAt = Date.parse(marker.slice(6));
  return Number.isFinite(claimedAt) ? claimedAt : null;
}

export function isClipAgentAuthorized(req: Request): boolean {
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

export type ClipJob =
  | {
      type: "start";
      campaignId: string;
      sourceUrl: string;
      niche: string;
    }
  | {
      type: "poll";
      campaignId: string;
      projectId: string;
      pollCount: number;
    };

export type ClipJobClip = {
  clipId: string;
  title?: string | null;
  score?: number | null;
  durationSec?: number | null;
  previewUrl?: string | null;
};

export type CompleteClipJobInput =
  | { action: "started"; projectId: string }
  | { action: "still_processing" }
  | { action: "clips_ready"; clips: ClipJobClip[] }
  | { action: "failed"; message: string };

async function recoverStaleClipClaims(): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data: rows } = await supabase
    .from("campaigns")
    .select("id, status, error_message")
    .eq("clip_provider", "supoclip")
    .eq("status", "pending")
    .like("error_message", "claim:%");

  const now = Date.now();
  for (const row of rows ?? []) {
    const claimedAt = parseClaimedAt(row.error_message);
    if (claimedAt === null || now - claimedAt < STALE_CLAIM_MS) {
      continue;
    }

    await supabase
      .from("campaigns")
      .update({ error_message: null })
      .eq("id", row.id)
      .eq("status", "pending");
  }
}

export async function claimNextClipJob(): Promise<ClipJob | null> {
  await recoverStaleClipClaims();

  const settings = await getAutopilotSettings();
  if (!settings.enabled) {
    return null;
  }

  const supabase = getSupabaseAdmin();

  const { data: clipping } = await supabase
    .from("campaigns")
    .select("*")
    .eq("clip_provider", "supoclip")
    .eq("status", "clipping")
    .order("created_at", { ascending: true })
    .limit(1);

  const clippingCampaign = clipping?.[0] as CampaignRow | undefined;
  if (clippingCampaign?.provider_project_id) {
    return {
      type: "poll",
      campaignId: clippingCampaign.id,
      projectId: clippingCampaign.provider_project_id,
      pollCount: clippingCampaign.poll_count ?? 0
    };
  }

  const { data: pending } = await supabase
    .from("campaigns")
    .select("*")
    .eq("clip_provider", "supoclip")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(5);

  for (const row of pending ?? []) {
    const campaign = row as CampaignRow;
    const claimedAt = parseClaimedAt(campaign.error_message);
    if (claimedAt !== null && Date.now() - claimedAt < STALE_CLAIM_MS) {
      continue;
    }

    const claimMarker = `claim:${new Date().toISOString()}`;
    const { data: claimed, error } = await supabase
      .from("campaigns")
      .update({ error_message: claimMarker })
      .eq("id", campaign.id)
      .eq("status", "pending")
      .select("*")
      .maybeSingle();

    if (error || !claimed) {
      continue;
    }

    return {
      type: "start",
      campaignId: claimed.id,
      sourceUrl: claimed.source_url,
      niche: claimed.niche
    };
  }

  return null;
}

export async function completeClipJob(
  campaignId: string,
  input: CompleteClipJobInput
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const settings = await getAutopilotSettings();

  const { data: campaign, error } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .maybeSingle();

  if (error || !campaign) {
    throw new Error(error?.message ?? "Campaign not found.");
  }

  if (campaign.clip_provider !== "supoclip") {
    throw new Error("Only SupoClip campaigns are handled by the clip agent.");
  }

  if (input.action === "failed") {
    await supabase
      .from("campaigns")
      .update({ status: "failed", error_message: input.message })
      .eq("id", campaignId);
    return;
  }

  if (input.action === "started") {
    await supabase
      .from("campaigns")
      .update({
        status: "clipping",
        provider_project_id: input.projectId,
        poll_count: 0,
        error_message: null
      })
      .eq("id", campaignId);
    return;
  }

  if (input.action === "still_processing") {
    const nextPoll = (campaign.poll_count ?? 0) + 1;
    if (nextPoll >= MAX_CLIP_POLLS) {
      await supabase
        .from("campaigns")
        .update({
          status: "failed",
          error_message:
            "SupoClip did not return clips before the autopilot timeout."
        })
        .eq("id", campaignId);
      return;
    }

    await supabase
      .from("campaigns")
      .update({ poll_count: nextPoll, error_message: null })
      .eq("id", campaignId);
    return;
  }

  // clips_ready
  const ranked = [...input.clips].sort((a, b) => {
    const scoreA = a.score ?? -1;
    const scoreB = b.score ?? -1;
    if (scoreB !== scoreA) {
      return scoreB - scoreA;
    }
    return (b.durationSec ?? 0) - (a.durationSec ?? 0);
  });

  const selected = ranked
    .filter((clip) => (clip.score ?? 100) >= settings.min_clip_score)
    .slice(0, settings.max_clips_per_source);

  if (selected.length === 0) {
    await supabase
      .from("campaigns")
      .update({
        status: "failed",
        error_message: "No clips passed the minimum score threshold."
      })
      .eq("id", campaignId);
    return;
  }

  await supabase.from("campaign_clips").delete().eq("campaign_id", campaignId);

  const clipRows = selected.map((clip, index) => ({
    campaign_id: campaignId,
    provider_clip_id: clip.clipId,
    title: clip.title ?? null,
    score: clip.score ?? null,
    duration_sec: clip.durationSec ?? null,
    preview_url: clip.previewUrl ?? null,
    rank: index + 1,
    selected: true
  }));

  const { error: insertError } = await supabase
    .from("campaign_clips")
    .insert(clipRows);

  if (insertError) {
    throw new Error(insertError.message);
  }

  await supabase
    .from("campaigns")
    .update({ status: "scheduling", error_message: null })
    .eq("id", campaignId);
}
