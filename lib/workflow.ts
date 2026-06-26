import { createOpusClipProject, publishOpusClipPost } from "@/lib/opusclip";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type WorkflowState = {
  source: string;
  autoPublish: boolean;
};

export async function runWorkflow(
  state: WorkflowState,
  prompt: string
) {
  const lower = prompt.toLowerCase();

  if (lower.includes("upload") || lower.includes("link") || lower.includes("source")) {
    const project = await createOpusClipProject({
      sourceUrl: state.source || undefined,
      caption: "Draft clip created from source"
    });

    return [
      `I queued the source for clip generation.`,
      `OpusClip result: ${project.mode}${"status" in project ? ` (${project.status})` : ""}.`
    ].join("\n");
  }

  if (state.autoPublish || lower.includes("post") || lower.includes("publish")) {
    const result = await publishOpusClipPost({
      clipUrl: "mock://clip",
      caption: "Auto-generated caption",
      targetAccountId: "connected-account"
    });

    return [
      `I prepared the post payload for the connected account.`,
      `Publish result: ${result.mode}${"status" in result ? ` (${result.status})` : ""}.`
    ].join("\n");
  }

  return "I can take the next step once you give me a source link, upload, or a publish request.";
}
