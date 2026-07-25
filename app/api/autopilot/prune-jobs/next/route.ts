import { NextResponse } from "next/server";
import { recordHeartbeat } from "@/lib/autopilot/health";
import { listPostsToPrune } from "@/lib/autopilot/prune-profile";
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
    await recordHeartbeat("profile-prune", "poll").catch(() => undefined);
    const jobs = await listPostsToPrune();
    return NextResponse.json({
      ok: true,
      needed: jobs.length > 0,
      jobs
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
