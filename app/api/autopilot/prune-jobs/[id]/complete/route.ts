import { NextResponse } from "next/server";
import { markPostDeleted } from "@/lib/autopilot/prune-profile";
import { isPublishAgentAuthorized } from "@/lib/autopilot/publish-agent";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(req: Request, context: RouteContext) {
  if (!isPublishAgentAuthorized(req)) {
    return NextResponse.json({ ok: false, message: "Unauthorized." }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, message: "Supabase is not configured." },
      { status: 503 }
    );
  }

  const { id } = await context.params;

  let body: { ok?: boolean; message?: string } = {};
  try {
    body = (await req.json()) as { ok?: boolean; message?: string };
  } catch {
    return NextResponse.json(
      { ok: false, message: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (typeof body.ok !== "boolean") {
    return NextResponse.json(
      { ok: false, message: 'Body must include boolean "ok".' },
      { status: 400 }
    );
  }

  try {
    const result = await markPostDeleted(id, {
      ok: body.ok,
      message: body.message
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
