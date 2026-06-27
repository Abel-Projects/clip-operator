import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  _context: { params: Promise<{ key: string[] }> }
) {
  return NextResponse.json(
    { message: "Media storage is not configured on this host." },
    { status: 501 }
  );
}
