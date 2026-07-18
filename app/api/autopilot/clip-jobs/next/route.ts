import { NextResponse } from "next/server";
import {
  claimNextClipJob,
  isClipAgentAuthorized
} from "@/lib/autopilot/clip-agent";
import { recordHeartbeat } from "@/lib/autopilot/health";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!isClipAgentAuthorized(req)) {
    return NextResponse.json({ ok: false, message: "Unauthorized." }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, message: "Supabase is not configured." },
      { status: 503 }
    );
  }

  try {
    await recordHeartbeat("clip-worker", "poll").catch(() => undefined);
    const job = await claimNextClipJob();
    return NextResponse.json({ ok: true, job });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
