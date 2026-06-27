import { NextResponse } from "next/server";
import { autoPostAllClipsToTikTok, getOpusClipProjectClips } from "@/lib/opusclip";

export const runtime = "nodejs";

type AutoPublishPayload = {
  projectId?: string;
};

export async function POST(req: Request) {
  const body = (await req.json()) as AutoPublishPayload;
  const projectId = body.projectId?.trim();

  if (!projectId) {
    return NextResponse.json(
      { ok: false, message: "projectId is required." },
      { status: 400 }
    );
  }

  const clipsResult = await getOpusClipProjectClips(projectId);
  if (!clipsResult.ok) {
    return NextResponse.json(clipsResult, {
      status: clipsResult.mode === "mock" ? 503 : 502
    });
  }

  const result = await autoPostAllClipsToTikTok({
    projectId,
    clips: clipsResult.clips
  });

  return NextResponse.json(result, {
    status: result.ok ? 200 : 502
  });
}
