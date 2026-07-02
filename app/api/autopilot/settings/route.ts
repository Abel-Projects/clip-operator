import { NextResponse } from "next/server";
import {
  getAutopilotSettings,
  updateAutopilotSettings
} from "@/lib/autopilot/settings";
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
    const settings = await getAutopilotSettings();
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Could not load settings."
      },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, message: "Supabase is not configured." },
      { status: 503 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, message: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const patch: Record<string, unknown> = {};

  if (typeof body.max_clips_per_source === "number") {
    patch.max_clips_per_source = Math.min(8, Math.max(1, body.max_clips_per_source));
  }
  if (typeof body.posts_per_day === "number") {
    patch.posts_per_day = Math.min(72, Math.max(1, body.posts_per_day));
  }
  if (typeof body.min_hours_between_posts === "number") {
    patch.min_hours_between_posts = Math.min(
      12,
      Math.max(1 / 3, body.min_hours_between_posts)
    );
  }
  if (typeof body.sources_per_day === "number") {
    patch.sources_per_day = Math.min(8, Math.max(1, body.sources_per_day));
  }
  if (typeof body.max_source_duration_min === "number") {
    patch.max_source_duration_min = Math.min(60, Math.max(5, body.max_source_duration_min));
  }
  if (typeof body.min_clip_score === "number") {
    patch.min_clip_score = Math.max(0, body.min_clip_score);
  }
  if (typeof body.niche === "string") patch.niche = body.niche.trim();
  if (body.clip_provider === "wayinvideo" || body.clip_provider === "supoclip") {
    patch.clip_provider = body.clip_provider;
  }
  if (typeof body.timezone === "string") patch.timezone = body.timezone;
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  if (typeof body.auto_approve_sources === "boolean") {
    patch.auto_approve_sources = body.auto_approve_sources;
  }
  if (Array.isArray(body.discovery_keywords)) {
    patch.discovery_keywords = body.discovery_keywords.filter(
      (entry): entry is string => typeof entry === "string"
    );
  }
  if (Array.isArray(body.discovery_channels)) {
    patch.discovery_channels = body.discovery_channels.filter(
      (entry): entry is string => typeof entry === "string"
    );
  }

  try {
    const settings = await updateAutopilotSettings(patch);
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Could not update settings."
      },
      { status: 500 }
    );
  }
}
