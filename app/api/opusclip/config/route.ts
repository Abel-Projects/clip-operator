import { NextResponse } from "next/server";
import { getOpusClipIntegrationStatus } from "@/lib/opusclip";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await getOpusClipIntegrationStatus());
}
