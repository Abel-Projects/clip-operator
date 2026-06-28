import { NextResponse } from "next/server";
import {
  createSupoClipProject,
  createSupoClipProjectFromUpload
} from "@/lib/supoclip";

export const runtime = "nodejs";

type ProjectPayload = {
  videoUrl?: string;
  projectName?: string;
  processingMode?: "fast" | "balanced" | "quality";
};

function parseProcessingMode(
  value: FormDataEntryValue | string | null | undefined
): "fast" | "balanced" | "quality" | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  if (value === "fast" || value === "balanced" || value === "quality") {
    return value;
  }

  return undefined;
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

    const result = await createSupoClipProjectFromUpload({
      file: await file.arrayBuffer(),
      fileName: file.name,
      projectName:
        typeof formData.get("projectName") === "string"
          ? (formData.get("projectName") as string)
          : undefined,
      processingMode: parseProcessingMode(formData.get("processingMode"))
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

  const result = await createSupoClipProject({
    videoUrl: body.videoUrl.trim(),
    projectName: body.projectName,
    processingMode: body.processingMode
  });

  return NextResponse.json(result, {
    status: result.ok ? 200 : result.mode === "mock" ? 503 : 502
  });
}
