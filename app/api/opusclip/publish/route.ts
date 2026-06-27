import { NextResponse } from "next/server";
import { publishOpusClipPost } from "@/lib/opusclip";

export const runtime = "nodejs";

type PublishPayload = {
  projectId?: string;
  clipId?: string;
  title?: string;
  description?: string;
  postAccountId?: string;
  subAccountId?: string;
};

export async function POST(req: Request) {
  const body = (await req.json()) as PublishPayload;

  if (!body.projectId?.trim() || !body.clipId?.trim()) {
    return NextResponse.json(
      { ok: false, message: "projectId and clipId are required." },
      { status: 400 }
    );
  }

  const result = await publishOpusClipPost({
    projectId: body.projectId.trim(),
    clipId: body.clipId.trim(),
    title: body.title,
    description: body.description,
    postAccountId: body.postAccountId,
    subAccountId: body.subAccountId
  });

  return NextResponse.json(result, {
    status: result.ok ? 200 : result.mode === "mock" ? 503 : 502
  });
}
