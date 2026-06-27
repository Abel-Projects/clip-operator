import { NextResponse } from "next/server";
import {
  getOpusClipProjectClips,
  waitForOpusClipClips
} from "@/lib/opusclip";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId")?.trim();
  const wait = searchParams.get("wait") === "1";

  if (!projectId) {
    return NextResponse.json(
      { ok: false, message: "projectId is required." },
      { status: 400 }
    );
  }

  const result = wait
    ? await waitForOpusClipClips(projectId)
    : await getOpusClipProjectClips(projectId);

  return NextResponse.json(result, {
    status: result.ok ? 200 : result.mode === "mock" ? 503 : 502
  });
}
