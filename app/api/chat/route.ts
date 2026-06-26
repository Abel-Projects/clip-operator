import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createOpusClipProject, publishOpusClipPost } from "@/lib/opusclip";

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
  const latestUser = [...messages].reverse().find((message) => message.role === "user");
  const userText = latestUser?.content ?? "";
  const inferredSource = body.source || extractSourceUrl(userText) || "";

  const workflowParts: string[] = [];

  if (inferredSource) {
    const project = await createOpusClipProject({
      sourceUrl: inferredSource,
      caption: "Auto-created from uploaded source"
    });
    workflowParts.push(
      project.mode === "live"
        ? `Queued source with OpusClip (${project.status}).`
      : project.message
    );
  } else {
    workflowParts.push("No source was detected yet. Paste a YouTube link or upload an MP4.");
  }

  if (body.autoPublish && inferredSource) {
    const publish = await publishOpusClipPost({
      clipUrl: inferredSource,
      caption: "Auto-generated caption",
      targetAccountId: "connected-account"
    });
    workflowParts.push(
      publish.mode === "live"
        ? `Publish request sent (${publish.status}).`
        : publish.message
    );
  }

  const workflowText = workflowParts.join("\n");

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({
      text:
        `${workflowText}\n\n` +
        "OpenAI is not configured yet, so I’m in local assistant mode. Add OPENAI_API_KEY and I can turn this into a fully conversational operator.",
      mode: "local"
    });
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const transcript = messages
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n");

  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
    input: [
      {
        role: "system",
        content:
          "You are a concise clip-ops assistant. Help the user turn source videos into short-form clips and publish to connected, authorized accounts. Refuse fake-account abuse, spam, or anything that violates platform rules. Be practical and action-oriented."
      },
      {
        role: "user",
        content: [
          `Workflow engine status:\n${workflowText || "No workflow actions yet."}`,
          `Current source: ${body.source ?? "none"}`,
          `Auto publish enabled: ${String(Boolean(body.autoPublish))}`,
          `Latest user request: ${userText || "(empty)"}`,
          `Conversation:\n${transcript || "(empty)"}`
        ].join("\n\n")
      }
    ]
  });

  return NextResponse.json({
    text: response.output_text || workflowText,
    mode: "openai"
  });
}
