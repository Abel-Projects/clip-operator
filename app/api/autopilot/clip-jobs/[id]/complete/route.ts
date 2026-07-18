import { NextResponse } from "next/server";
import {
  completeClipJob,
  isClipAgentAuthorized,
  type CompleteClipJobInput
} from "@/lib/autopilot/clip-agent";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(req: Request, context: RouteContext) {
  if (!isClipAgentAuthorized(req)) {
    return NextResponse.json({ ok: false, message: "Unauthorized." }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, message: "Supabase is not configured." },
      { status: 503 }
    );
  }

  const { id } = await context.params;
  let body: CompleteClipJobInput;

  try {
    body = (await req.json()) as CompleteClipJobInput;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }

  if (!body || typeof body !== "object" || !("action" in body)) {
    return NextResponse.json({ ok: false, message: "Missing action." }, { status: 400 });
  }

  try {
    await completeClipJob(id, body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
