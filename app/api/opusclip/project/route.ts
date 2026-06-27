import { NextResponse } from "next/server";
import {
  createOpusClipProject,
  createOpusClipProjectFromUpload
} from "@/lib/opusclip";

export const runtime = "nodejs";

type ProjectPayload = {
  videoUrl?: string;
  topicKeywords?: string[];
  brandTemplateId?: string;
  sourceLang?: string;
  clipDurationSec?: number;
};

const DEFAULT_BRAND_TEMPLATE = "preset-fancy-Karaoke";

function parseTopicKeywords(value: FormDataEntryValue | null): string[] | undefined {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }

  const keywords = value
    .split(",")
    .map((keyword) => keyword.trim())
    .filter(Boolean);

  return keywords.length > 0 ? keywords : undefined;
}

function parseClipDuration(value: FormDataEntryValue | null): number | undefined {
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

    const result = await createOpusClipProjectFromUpload({
      file: await file.arrayBuffer(),
      fileName: file.name,
      topicKeywords: parseTopicKeywords(formData.get("topicKeywords")),
      brandTemplateId:
        typeof formData.get("brandTemplateId") === "string"
          ? (formData.get("brandTemplateId") as string)
          : DEFAULT_BRAND_TEMPLATE,
      sourceLang:
        typeof formData.get("sourceLang") === "string"
          ? (formData.get("sourceLang") as string)
          : "auto",
      clipDurationSec: parseClipDuration(formData.get("clipDurationSec"))
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

  const result = await createOpusClipProject({
    videoUrl: body.videoUrl.trim(),
    topicKeywords: body.topicKeywords,
    brandTemplateId: body.brandTemplateId ?? DEFAULT_BRAND_TEMPLATE,
    sourceLang: body.sourceLang,
    clipDurationSec: body.clipDurationSec
  });

  return NextResponse.json(result, {
    status: result.ok ? 200 : result.mode === "mock" ? 503 : 502
  });
}
