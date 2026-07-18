import { NextResponse } from "next/server";
import {
  applyMetricsUpdates,
  listPostsNeedingMetrics,
  matchVideosToPosts,
  type ScrapedTikTokVideo
} from "@/lib/autopilot/metrics";
import { isPublishAgentAuthorized } from "@/lib/autopilot/publish-agent";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";

function isVideo(value: unknown): value is ScrapedTikTokVideo {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.videoId === "string" &&
    typeof v.url === "string" &&
    typeof v.caption === "string" &&
    typeof v.createTime === "number" &&
    typeof v.views === "number" &&
    typeof v.likes === "number" &&
    typeof v.comments === "number" &&
    typeof v.shares === "number"
  );
}

export async function POST(req: Request) {
  if (!isPublishAgentAuthorized(req)) {
    return NextResponse.json({ ok: false, message: "Unauthorized." }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, message: "Supabase is not configured." },
      { status: 503 }
    );
  }

  let body: { videos?: unknown } = {};
  try {
    body = (await req.json()) as { videos?: unknown };
  } catch {
    return NextResponse.json(
      { ok: false, message: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (!Array.isArray(body.videos)) {
    return NextResponse.json(
      { ok: false, message: 'Body must include "videos" array.' },
      { status: 400 }
    );
  }

  const videos = body.videos.filter(isVideo);
  if (videos.length === 0) {
    return NextResponse.json({
      ok: true,
      matched: 0,
      applied: 0,
      message: "No valid videos in payload."
    });
  }

  try {
    const posts = await listPostsNeedingMetrics(80);
    const matches = matchVideosToPosts(posts, videos);
    const applied = await applyMetricsUpdates(
      matches.map(({ postId, video }) => ({
        postId,
        views: video.views,
        likes: video.likes,
        comments: video.comments,
        shares: video.shares,
        tiktokUrl: video.url
      }))
    );

    return NextResponse.json({
      ok: true,
      scraped: videos.length,
      matched: matches.length,
      applied,
      message: `Matched ${matches.length}/${videos.length} videos; updated ${applied} posts.`
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
