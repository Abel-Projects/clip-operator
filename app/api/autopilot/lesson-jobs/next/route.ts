import { NextResponse } from "next/server";
import { claimNextLessonRenderJob } from "@/lib/autopilot/lessons";
import { isPublishAgentAuthorized } from "@/lib/autopilot/publish-agent";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    const job = await claimNextLessonRenderJob();
    if (!job) {
      return NextResponse.json({ ok: true, job: null });
    }
    return NextResponse.json({ ok: true, job });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Could not claim lesson job."
      },
      { status: 500 }
    );
  }
}
