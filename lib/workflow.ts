import {
  createClipJob,
  publishClip,
  waitForClipJob
} from "@/lib/openshorts";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type WorkflowState = {
  source: string;
  autoPublish: boolean;
};

export async function runWorkflow(state: WorkflowState, prompt: string) {
  const lower = prompt.toLowerCase();

  if (lower.includes("upload") || lower.includes("link") || lower.includes("source")) {
    if (!state.source) {
      return "Share a source link or upload a file and I can queue clip generation.";
    }

    const job = await createClipJob({ sourceUrl: state.source });
    if (!job.ok) {
      return job.message;
    }

    return [
      "I queued the source for clip generation with OpenShorts.",
      `Job ID: ${job.jobId} (${job.status}).`
    ].join("\n");
  }

  if (state.autoPublish || lower.includes("post") || lower.includes("publish")) {
    return "Publishing needs a completed OpenShorts job ID. Queue a source first, then ask me to publish once clips are ready.";
  }

  return "I can take the next step once you give me a source link, upload, or a publish request.";
}

export async function runSourceWorkflow(input: {
  sourceUrl: string;
  autoPublish: boolean;
}) {
  const parts: string[] = [];

  const job = await createClipJob({ sourceUrl: input.sourceUrl });
  if (!job.ok) {
    parts.push(job.message);
    return parts.join("\n");
  }

  parts.push(`Queued source with OpenShorts (job ${job.jobId}, ${job.status}).`);

  if (!input.autoPublish) {
    return parts.join("\n");
  }

  const status = await waitForClipJob(job.jobId, {
    maxAttempts: 15,
    intervalMs: 2000
  });

  if (!status) {
    parts.push("Could not read job status from OpenShorts yet.");
    return parts.join("\n");
  }

  if (status.status !== "completed") {
    parts.push(
      `Clips are still processing (${status.status}). Ask again to publish once job ${job.jobId} completes.`
    );
    return parts.join("\n");
  }

  const firstClip = status.clips[0];
  const publish = await publishClip({
    jobId: job.jobId,
    clipIndex: 0,
    title: firstClip?.title,
    description: firstClip?.title
  });

  parts.push(
    publish.ok
      ? `Publish request sent (${publish.status}).`
      : publish.message
  );

  return parts.join("\n");
}
