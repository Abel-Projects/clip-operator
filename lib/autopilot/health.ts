import { getSupoClipIntegrationStatus } from "@/lib/supoclip";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getAutopilotSettings } from "@/lib/autopilot/settings";

/** A component counts as "online" if we've heard from it within this window. */
export const HEARTBEAT_ONLINE_MS = 10 * 60 * 1000;

export async function recordHeartbeat(name: string, detail?: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  await supabase
    .from("system_heartbeats")
    .upsert(
      { name, last_seen_at: now, detail: detail ?? null, updated_at: now },
      { onConflict: "name" }
    );
}

async function getHeartbeat(name: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("system_heartbeats")
    .select("last_seen_at")
    .eq("name", name)
    .maybeSingle();

  return data?.last_seen_at ?? null;
}

export type HomeServerHealth = {
  clipProvider: string;
  /** Only meaningful for the SupoClip pipeline. */
  supoclipReachable: boolean;
  publisherLastSeenAt: string | null;
  publisherOnline: boolean;
};

export async function getHomeServerHealth(): Promise<HomeServerHealth> {
  const settings = await getAutopilotSettings();
  const [supoclip, publisherLastSeenAt] = await Promise.all([
    getSupoClipIntegrationStatus().catch(() => ({ backendReachable: false })),
    getHeartbeat("publisher")
  ]);

  const publisherOnline = publisherLastSeenAt
    ? Date.now() - new Date(publisherLastSeenAt).getTime() < HEARTBEAT_ONLINE_MS
    : false;

  return {
    clipProvider: settings.clip_provider,
    supoclipReachable: Boolean(supoclip.backendReachable),
    publisherLastSeenAt,
    publisherOnline
  };
}
