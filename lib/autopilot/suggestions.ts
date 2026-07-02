import { createCampaign } from "@/lib/autopilot/processor";
import { getAutopilotSettings } from "@/lib/autopilot/settings";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { ContentSuggestionRow } from "@/lib/supabase/types";

export type SuggestionVote = "up" | "down";

export async function listPendingSuggestions(limit = 12): Promise<ContentSuggestionRow[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("content_suggestions")
    .select("*")
    .eq("status", "pending")
    .order("score", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

/**
 * Upvote → approve the suggestion and queue it for clipping.
 * Downvote → reject it so discovery never proposes it again.
 */
export async function voteSuggestion(
  id: string,
  vote: SuggestionVote
): Promise<{ ok: boolean; message: string }> {
  const supabase = getSupabaseAdmin();

  const { data: suggestion, error } = await supabase
    .from("content_suggestions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!suggestion) {
    return { ok: false, message: "Suggestion not found." };
  }

  if (vote === "down") {
    await supabase
      .from("content_suggestions")
      .update({ status: "rejected", score: suggestion.score - 1, updated_at: new Date().toISOString() })
      .eq("id", id);
    return { ok: true, message: "Skipped — won't suggest this again." };
  }

  const settings = await getAutopilotSettings();
  await createCampaign({
    sourceUrl: suggestion.url,
    clipProvider: settings.clip_provider,
    niche: settings.niche
  });

  await supabase
    .from("content_suggestions")
    .update({ status: "approved", score: suggestion.score + 1, updated_at: new Date().toISOString() })
    .eq("id", id);

  return { ok: true, message: "Approved — clipping and scheduling to TikTok." };
}
