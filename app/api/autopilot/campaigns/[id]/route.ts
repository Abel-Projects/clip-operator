import { NextResponse } from "next/server";
import { getCampaignWithDetails } from "@/lib/autopilot/processor";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_req: Request, context: RouteContext) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, message: "Supabase is not configured." },
      { status: 503 }
    );
  }

  const { id } = await context.params;

  try {
    const details = await getCampaignWithDetails(id);
    if (!details) {
      return NextResponse.json(
        { ok: false, message: "Campaign not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, ...details });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Could not load campaign."
      },
      { status: 500 }
    );
  }
}
