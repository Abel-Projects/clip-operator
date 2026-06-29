import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { AutopilotSettingsRow } from "@/lib/supabase/types";

export const DEFAULT_SETTINGS: Omit<AutopilotSettingsRow, "updated_at"> = {
  id: 1,
  max_clips_per_source: 4,
  posts_per_day: 4,
  min_hours_between_posts: 3,
  min_clip_score: 0,
  timezone: "America/New_York",
  enabled: true
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

  return data;
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
