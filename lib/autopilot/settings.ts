import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { AutopilotSettingsRow } from "@/lib/supabase/types";

export const DEFAULT_SETTINGS: Omit<AutopilotSettingsRow, "updated_at"> = {
  id: 1,
  niche: "shark_tank_entrepreneurs",
  clip_provider: "supoclip",
  max_clips_per_source: 8,
  posts_per_day: 48,
  min_hours_between_posts: 0.5,
  min_clip_score: 50,
  timezone: "America/New_York",
  enabled: true,
  sources_per_day: 6,
  min_source_duration_min: 30,
  max_source_duration_min: 120,
  auto_approve_sources: true,
  discovery_keywords: [
    "mark cuban full podcast episode interview",
    "barbara corcoran full podcast episode",
    "kevin o'leary full length interview podcast",
    "daymond john full podcast interview",
    "lori greiner full interview podcast episode",
    "shark tank behind the scenes full interview",
    "how i built this entrepreneur full episode",
    "all in podcast full episode business"
  ],
  discovery_channels: [
    "UCnnQ2f4XSGDzLkgBGbecBaA",
    "UCnYMOamNKLGVlJgLtbb2JLA",
    "UC6sS9qHuFKBRKW-bpdgLl_w"
  ]
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
