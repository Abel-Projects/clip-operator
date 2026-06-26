import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    if (!env.CLIPS) {
      return NextResponse.json(
        { message: "R2 binding CLIPS is unavailable." },
        { status: 500 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { message: "No file was uploaded." },
        { status: 400 }
      );
    }

    const uploadId = crypto.randomUUID();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const objectKey = `uploads/${uploadId}-${safeName}`;
    const body = await file.arrayBuffer();

    await env.CLIPS.put(objectKey, body, {
      httpMetadata: file.type ? { contentType: file.type } : undefined,
      customMetadata: {
        originalName: file.name
      }
    });

    return NextResponse.json({
      ok: true,
      key: objectKey,
      name: file.name,
      size: file.size,
      url: new URL(`/api/media/${encodeURIComponent(objectKey)}`, req.url).toString()
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Upload failed unexpectedly."
      },
      { status: 500 }
    );
  }
}
