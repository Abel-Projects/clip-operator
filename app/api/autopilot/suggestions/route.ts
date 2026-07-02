import { NextResponse } from "next/server";
import { listPendingSuggestions, voteSuggestion } from "@/lib/autopilot/suggestions";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";

function guard() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, message: "Supabase is not configured." },
      { status: 503 }
    );
  }
  return null;
}

export async function GET() {
  const blocked = guard();
  if (blocked) return blocked;

  try {
    const suggestions = await listPendingSuggestions();
    return NextResponse.json({ ok: true, suggestions });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Could not load suggestions." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const blocked = guard();
  if (blocked) return blocked;

  let body: { id?: string; vote?: string };
  try {
    body = (await req.json()) as { id?: string; vote?: string };
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }

  const id = body.id?.trim();
  const vote = body.vote === "up" || body.vote === "down" ? body.vote : null;

  if (!id || !vote) {
    return NextResponse.json(
      { ok: false, message: "id and vote ('up'|'down') are required." },
      { status: 400 }
    );
  }

  try {
    const result = await voteSuggestion(id, vote);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Vote failed." },
      { status: 500 }
    );
  }
}
