import { NextResponse } from "next/server";
import { getMonitorFeed } from "@/lib/autopilot/monitor";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, message: "Supabase is not configured." },
      { status: 503 }
    );
  }

  try {
    const { posts, summary } = await getMonitorFeed();
    return NextResponse.json({ ok: true, posts, summary });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Could not load monitor feed."
      },
      { status: 500 }
    );
  }
}
