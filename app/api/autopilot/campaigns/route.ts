import { NextResponse } from "next/server";
import {
  createCampaign,
  getAutopilotQueueSummary,
  listCampaigns,
  runAutopilotTick
} from "@/lib/autopilot/processor";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const maxDuration = 60;

function supabaseRequired() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "Autopilot requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. See README."
      },
      { status: 503 }
    );
  }

  return null;
}

function triggerBackgroundTick(origin: string) {
  const secret = process.env.CRON_SECRET?.trim();
  const headers: Record<string, string> = {};
  if (secret) {
    headers.authorization = `Bearer ${secret}`;
  }

  void fetch(`${origin}/api/cron/autopilot`, {
    method: "POST",
    headers
  }).catch(() => {
    // Cron will pick up pending work if this fire-and-forget fails.
  });
}

export async function GET() {
  const blocked = supabaseRequired();
  if (blocked) {
    return blocked;
  }

  try {
    const [campaigns, summary] = await Promise.all([
      listCampaigns(),
      getAutopilotQueueSummary()
    ]);

    return NextResponse.json({ ok: true, campaigns, summary });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Could not load campaigns."
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const blocked = supabaseRequired();
  if (blocked) {
    return blocked;
  }

  let body: { sourceUrl?: string };
  try {
    body = (await req.json()) as { sourceUrl?: string };
  } catch {
    return NextResponse.json(
      { ok: false, message: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const sourceUrl = body.sourceUrl?.trim();
  if (!sourceUrl) {
    return NextResponse.json(
      { ok: false, message: "sourceUrl is required." },
      { status: 400 }
    );
  }

  try {
    const campaign = await createCampaign({
      sourceUrl
    });

    const origin = new URL(req.url).origin;
    triggerBackgroundTick(origin);

    return NextResponse.json({ ok: true, campaign });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Could not create campaign."
      },
      { status: 500 }
    );
  }
}

export async function PATCH() {
  const blocked = supabaseRequired();
  if (blocked) {
    return blocked;
  }

  try {
    const result = await runAutopilotTick();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Autopilot tick failed."
      },
      { status: 500 }
    );
  }
}
