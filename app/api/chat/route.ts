import { NextResponse } from "next/server";
import { runSourceWorkflow } from "@/lib/workflow";

export const runtime = "nodejs";

type ChatPayload = {
  messages?: Array<{ role: "user" | "assistant"; content: string }>;
  source?: string;
  autoPublish?: boolean;
};

function extractSourceUrl(text: string): string | null {
  const urlMatch = text.match(
    /(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=[^\s]+|youtu\.be\/[^\s]+|drive\.google\.com\/[^\s]+|dropbox\.com\/[^\s]+|[^\s]+))/i
  );

  return urlMatch?.[1] ?? null;
}

export async function POST(req: Request) {
  const body = (await req.json()) as ChatPayload;
  const messages = body.messages ?? [];
  const latestUser = [...messages]
    .reverse()
    .find((message) => message.role === "user");
  const userText = latestUser?.content ?? "";
  const inferredSource = body.source || extractSourceUrl(userText) || "";

  const workflowText = inferredSource
    ? await runSourceWorkflow({
        sourceUrl: inferredSource,
        autoPublish: Boolean(body.autoPublish)
      })
    : "No source was detected yet. Paste a YouTube link or upload an MP4.";

  return NextResponse.json({
    text: workflowText,
    mode: "workflow"
  });
}
