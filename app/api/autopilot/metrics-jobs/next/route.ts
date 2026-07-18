import { NextResponse } from "next/server";
import { recordHeartbeat } from "@/lib/autopilot/health";
import { listPostsNeedingMetrics } from "@/lib/autopilot/metrics";
import { isPublishAgentAuthorized } from "@/lib/autopilot/publish-agent";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!isPublishAgentAuthorized(req)) {
    return NextResponse.json({ ok: false, message: "Unauthorized." }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, message: "Supabase is not configured." },
      { status: 503 }
    );
  }

  try {
    await recordHeartbeat("metrics", "poll").catch(() => undefined);
    const posts = await listPostsNeedingMetrics(40);
    return NextResponse.json({
      ok: true,
      needed: posts.length > 0,
      posts
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
