import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { AutopilotSettingsRow } from "@/lib/supabase/types";

export const DEFAULT_SETTINGS: Omit<AutopilotSettingsRow, "updated_at"> = {
  id: 1,
  niche: "us_shark_tank",
  clip_provider: "supoclip",
  max_clips_per_source: 3,
  posts_per_day: 7,
  min_hours_between_posts: 2,
  min_clip_score: 55,
  winner_min_views: 100,
  profile_prune_enabled: true,
  profile_prune_max_views: 40,
  profile_prune_min_age_hours: 48,
  profile_prune_max_per_run: 5,
  lesson_posts_enabled: true,
  lesson_posts_per_day: 1,
  timezone: "America/New_York",
  enabled: true,
  sources_per_day: 6,
  min_source_duration_min: 30,
  max_source_duration_min: 150,
  auto_approve_sources: true,
  discovery_keywords: [
    "shark tank abc full episode",
    "shark tank us season full episode",
    "shark tank season full episode pitch",
    "shark tank mark cuban full episode",
    "shark tank barbara corcoran full episode",
    "shark tank kevin o'leary full episode",
    "shark tank daymond john full episode",
    "shark tank lori greiner full episode",
    "shark tank bidding war full episode",
    "shark tank young entrepreneur full episode"
  ],
  // Prefer keyword search over channels — official uploads are mostly short promos.
  // Empty list = keywords only (US title gate still applies).
  discovery_channels: [],
  wayinvideo_until_exhausted: false,
};

export async function getAutopilotSettings(): Promise<AutopilotSettingsRow> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("autopilot_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    const { data: inserted, error: insertError } = await supabase
      .from("autopilot_settings")
      .insert(DEFAULT_SETTINGS)
      .select("*")
      .single();

    if (insertError || !inserted) {
      throw new Error(insertError?.message ?? "Could not seed autopilot settings.");
    }

    return inserted;
  }

  return {
    ...DEFAULT_SETTINGS,
    ...data
  };
}

export async function updateAutopilotSettings(
  patch: Partial<Omit<AutopilotSettingsRow, "id" | "updated_at">>
): Promise<AutopilotSettingsRow> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("autopilot_settings")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", 1)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Could not update autopilot settings.");
  }

  return data;
}
