import { NextResponse } from "next/server";
import { getWayinVideoIntegrationStatus } from "@/lib/wayinvideo";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await getWayinVideoIntegrationStatus());
}
