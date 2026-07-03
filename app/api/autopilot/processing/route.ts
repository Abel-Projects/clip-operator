import { NextResponse } from "next/server";
import { getSupoClipProjectClips } from "@/lib/supoclip";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";

export type ProcessingSnapshot = {
  clipJob: {
    id: string;
    source_url: string;
    status: string;
    clip_provider: string;
    provider_project_id: string | null;
    error_message: string | null;
  } | null;
  supoclip: {
    status: string;
    processing: boolean;
    clipCount: number;
    progressMessage: string | null;
  } | null;
  publishing: {
    activeCampaigns: number;
    queuedPosts: number;
  };
};

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, message: "Supabase is not configured." },
      { status: 503 }
    );
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data: clipJob } = await supabase
      .from("campaigns")
      .select("id, source_url, status, clip_provider, provider_project_id, error_message")
      .in("status", ["pending", "clipping", "scheduling"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let supoclip: ProcessingSnapshot["supoclip"] = null;
    if (
      clipJob?.provider_project_id &&
      clipJob.clip_provider === "supoclip" &&
      clipJob.status === "clipping"
    ) {
      const live = await getSupoClipProjectClips(clipJob.provider_project_id);
      if (live.ok) {
        supoclip = {
          status: live.status,
          processing: live.processing,
          clipCount: live.clips.length,
          progressMessage: live.progressMessage ?? null
        };
      }
    }

    const { count: activeCampaigns } = await supabase
      .from("campaigns")
      .select("*", { count: "exact", head: true })
      .eq("status", "active");

    const { count: queuedPosts } = await supabase
      .from("scheduled_posts")
      .select("*", { count: "exact", head: true })
      .in("status", ["queued", "posting"]);

    const snapshot: ProcessingSnapshot = {
      clipJob: clipJob ?? null,
      supoclip,
      publishing: {
        activeCampaigns: activeCampaigns ?? 0,
        queuedPosts: queuedPosts ?? 0
      }
    };

    return NextResponse.json({ ok: true, processing: snapshot });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Could not load processing status."
      },
      { status: 500 }
    );
  }
}
