import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ key: string[] }> }
) {
  if (!env.CLIPS) {
    return NextResponse.json(
      { message: "R2 binding CLIPS is unavailable." },
      { status: 500 }
    );
  }

  const { key } = await params;
  const objectKey = key.map(decodeURIComponent).join("/");
  const object = await env.CLIPS.get(objectKey);

  if (!object) {
    return NextResponse.json({ message: "File not found." }, { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("content-disposition", `inline; filename="${objectKey.split("/").pop() ?? "clip"}"`);

  return new Response(object.body, { headers });
}
