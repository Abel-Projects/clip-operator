import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      message:
        "Direct uploads are not configured on this host. Paste a YouTube link instead."
    },
    { status: 501 }
  );
}
