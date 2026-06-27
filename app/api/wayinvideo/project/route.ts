import { NextResponse } from "next/server";
import {
  createWayinVideoProject,
  createWayinVideoProjectFromUpload
} from "@/lib/wayinvideo";

export const runtime = "nodejs";

type ProjectPayload = {
  videoUrl?: string;
  projectName?: string;
  targetDuration?: string;
  limit?: number;
};

function parseLimit(value: FormDataEntryValue | null): number | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export async function POST(req: Request) {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, message: "A video file is required." },
        { status: 400 }
      );
    }

    const result = await createWayinVideoProjectFromUpload({
      file: await file.arrayBuffer(),
      fileName: file.name,
      projectName:
        typeof formData.get("projectName") === "string"
          ? (formData.get("projectName") as string)
          : undefined,
      targetDuration:
        typeof formData.get("targetDuration") === "string"
          ? (formData.get("targetDuration") as string)
          : undefined,
      limit: parseLimit(formData.get("limit"))
    });

    return NextResponse.json(result, {
      status: result.ok ? 200 : result.mode === "mock" ? 503 : 502
    });
  }

  const body = (await req.json()) as ProjectPayload;

  if (!body.videoUrl?.trim()) {
    return NextResponse.json(
      { ok: false, message: "videoUrl is required." },
      { status: 400 }
    );
  }

  const result = await createWayinVideoProject({
    videoUrl: body.videoUrl.trim(),
    projectName: body.projectName,
    targetDuration: body.targetDuration,
    limit: body.limit
  });

  return NextResponse.json(result, {
    status: result.ok ? 200 : result.mode === "mock" ? 503 : 502
  });
}
