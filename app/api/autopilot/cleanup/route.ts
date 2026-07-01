import { NextResponse } from "next/server";
import {
  cleanupFailedRecords,
  cleanupStaleFailedRecords
} from "@/lib/autopilot/cleanup";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";

type CleanupPayload = {
  /** When true, delete every failed row. Otherwise only rows older than retention. */
  all?: boolean;
};

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, message: "Supabase is not configured." },
      { status: 503 }
    );
  }

  let body: CleanupPayload = {};
  try {
    const text = await req.text();
    if (text.trim()) {
      body = JSON.parse(text) as CleanupPayload;
    }
  } catch {
    return NextResponse.json(
      { ok: false, message: "Invalid JSON body." },
      { status: 400 }
    );
  }

  try {
    const result = body.all
      ? await cleanupFailedRecords()
      : await cleanupStaleFailedRecords();

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Cleanup failed."
      },
      { status: 500 }
    );
  }
}
