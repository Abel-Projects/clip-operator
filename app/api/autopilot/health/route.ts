import { NextResponse } from "next/server";
import { getHomeServerHealth } from "@/lib/autopilot/health";
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
    const health = await getHomeServerHealth();
    return NextResponse.json({ ok: true, health });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Could not load health."
      },
      { status: 500 }
    );
  }
}
