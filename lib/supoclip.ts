import { createHmac } from "node:crypto";

export type SupoClipClip = {
  id: string;
  clipId: string;
  idx: number;
  title?: string;
  previewUrl?: string;
  durationSec?: number;
  score?: number;
};

export type SupoClipProjectInput = {
  videoUrl: string;
  projectName?: string;
  processingMode?: "fast" | "balanced" | "quality";
};

export type SupoClipUploadInput = {
  file: ArrayBuffer;
  fileName: string;
  projectName?: string;
  processingMode?: "fast" | "balanced" | "quality";
};

export type SupoClipProjectResult =
  | {
      ok: true;
      mode: "live";
      projectId: string;
      status?: string;
    }
  | {
      ok: false;
      mode: "mock" | "live";
      message: string;
      status?: number;
    };

export type SupoClipClipsResult =
  | {
      ok: true;
      mode: "live";
      clips: SupoClipClip[];
      processing: boolean;
      status: string;
      progressMessage?: string;
    }
  | {
      ok: false;
      mode: "mock" | "live";
      message: string;
      status?: number;
    };

export type SupoClipIntegrationStatus = {
  configured: boolean;
  /** True when env is set enough to embed the SupoClip UI iframe. */
  canEmbed: boolean;
  backendReachable: boolean;
  baseUrl: string;
  frontendUrl: string;
  hasTikTokAccount: boolean;
  tikTokAccountName?: string;
};

export type ClipPostResult = {
  clipId: string;
  ok: boolean;
  message: string;
};

export type AutoPostAllResult =
  | {
      ok: true;
      mode: "live";
      results: ClipPostResult[];
      posted: number;
      failed: number;
      message?: string;
    }
  | {
      ok: false;
      mode: "mock" | "live";
      message: string;
      results?: ClipPostResult[];
      posted?: number;
      failed?: number;
    };

type SupoClipConfig = {
  baseUrl: string;
  frontendUrl: string;
  userId: string;
  authSecret?: string;
};

const DEFAULT_BASE_URL = "http://localhost:8000";
const DEFAULT_FRONTEND_URL = "http://localhost:3107";

function getConfig(): SupoClipConfig | null {
  const userId = process.env.SUPOCLIP_USER_ID?.trim();
  if (!userId) {
    return null;
  }

  return {
    baseUrl:
      process.env.SUPOCLIP_BASE_URL?.replace(/\/$/, "") ?? DEFAULT_BASE_URL,
    frontendUrl:
      process.env.SUPOCLIP_FRONTEND_URL?.replace(/\/$/, "") ??
      DEFAULT_FRONTEND_URL,
    userId,
    authSecret: process.env.SUPOCLIP_AUTH_SECRET?.trim() || undefined
  };
}

function authHeaders(
  config: SupoClipConfig,
  contentType?: string
): Record<string, string> {
  const headers: Record<string, string> = {
    "x-supoclip-user-id": config.userId
  };

  if (contentType) {
    headers["Content-Type"] = contentType;
  }

  if (config.authSecret) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const payload = `${config.userId}:${timestamp}`;
    const signature = createHmac("sha256", config.authSecret)
      .update(payload)
      .digest("hex");

    headers["x-supoclip-ts"] = timestamp;
    headers["x-supoclip-signature"] = signature;
  }

  return headers;
}

function mockMessage(missing: string): SupoClipProjectResult {
  return {
    ok: false,
    mode: "mock",
    message: `${missing} is not set. Start SupoClip with pnpm supoclip, create an account, then add your user ID to .env.local.`
  };
}

function resolvePreviewUrl(
  config: SupoClipConfig,
  taskId: string,
  clip: Record<string, unknown>
): string | undefined {
  const videoUrl = clip.video_url;
  if (typeof videoUrl === "string" && videoUrl.startsWith("http")) {
    return videoUrl;
  }

  if (typeof videoUrl === "string" && videoUrl.startsWith("/")) {
    return `${config.baseUrl}${videoUrl}`;
  }

  const clipId = typeof clip.id === "string" ? clip.id : "";
  if (!clipId) {
    return undefined;
  }

  return `${config.baseUrl}/tasks/${taskId}/clips/${clipId}/file`;
}

function parseClips(
  config: SupoClipConfig,
  taskId: string,
  payload: unknown
): SupoClipClip[] {
  const list = Array.isArray(payload)
    ? payload
    : payload &&
        typeof payload === "object" &&
        Array.isArray((payload as { clips?: unknown }).clips)
      ? ((payload as { clips: unknown[] }).clips ?? [])
      : [];

  return list.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }

    const clip = entry as Record<string, unknown>;
    const id = typeof clip.id === "string" ? clip.id : "";
    if (!id) {
      return [];
    }

    const text = typeof clip.text === "string" ? clip.text.trim() : "";
    const duration =
      typeof clip.duration === "number"
        ? clip.duration
        : Number(clip.duration);

    return [
      {
        id,
        clipId: id,
        idx:
          typeof clip.clip_order === "number"
            ? clip.clip_order
            : index + 1,
        title: text || undefined,
        previewUrl: resolvePreviewUrl(config, taskId, clip),
        durationSec: Number.isFinite(duration) ? duration : undefined,
        score:
          typeof clip.virality_score === "number"
            ? clip.virality_score
            : typeof clip.relevance_score === "number"
              ? clip.relevance_score
              : undefined
      }
    ];
  });
}

async function createSupoClipTask(
  config: SupoClipConfig,
  input: {
    sourceUrl: string;
    title?: string;
    processingMode?: "fast" | "balanced" | "quality";
  }
): Promise<SupoClipProjectResult> {
  try {
    const response = await fetch(`${config.baseUrl}/tasks/`, {
      method: "POST",
      headers: authHeaders(config, "application/json"),
      body: JSON.stringify({
        source: {
          url: input.sourceUrl,
          title: input.title
        },
        processing_mode: input.processingMode ?? "fast"
      })
    });

    const text = await response.text();
    let payload: unknown = text;

    try {
      payload = JSON.parse(text);
    } catch {
      // Keep raw text for error messages.
    }

    if (!response.ok) {
      return {
        ok: false,
        mode: "live",
        status: response.status,
        message:
          typeof payload === "string"
            ? payload
            : JSON.stringify(payload, null, 2)
      };
    }

    const taskId =
      payload && typeof payload === "object"
        ? (payload as { task_id?: string }).task_id
        : undefined;

    if (!taskId) {
      return {
        ok: false,
        mode: "live",
        message: "SupoClip did not return a task_id."
      };
    }

    return {
      ok: true,
      mode: "live",
      projectId: taskId,
      status: "queued"
    };
  } catch (error) {
    return {
      ok: false,
      mode: "live",
      message:
        error instanceof Error
          ? `Could not reach SupoClip at ${config.baseUrl}: ${error.message}. Start it with pnpm supoclip.`
          : "Could not reach SupoClip. Start it with pnpm supoclip."
    };
  }
}

export function getSupoClipStatus(): SupoClipIntegrationStatus {
  const config = getConfig();
  const hasEnv = Boolean(config);

  return {
    configured: hasEnv,
    canEmbed: hasEnv,
    backendReachable: false,
    baseUrl: config?.baseUrl ?? DEFAULT_BASE_URL,
    frontendUrl: config?.frontendUrl ?? DEFAULT_FRONTEND_URL,
    hasTikTokAccount: false
  };
}

export async function getSupoClipIntegrationStatus(): Promise<SupoClipIntegrationStatus> {
  const status = getSupoClipStatus();
  const config = getConfig();

  if (!config) {
    return status;
  }

  try {
    const response = await fetch(`${config.baseUrl}/health`, {
      headers: authHeaders(config),
      // Vercel must not hang on an unreachable home-server URL (causes 500s).
      signal: AbortSignal.timeout(2500)
    });

    if (!response.ok) {
      return {
        ...status,
        backendReachable: false
      };
    }

    return {
      ...status,
      backendReachable: true
    };
  } catch {
    return {
      ...status,
      backendReachable: false
    };
  }
}

export async function createSupoClipProject(
  input: SupoClipProjectInput
): Promise<SupoClipProjectResult> {
  const config = getConfig();
  if (!config) {
    return mockMessage("SUPOCLIP_USER_ID");
  }

  return createSupoClipTask(config, {
    sourceUrl: input.videoUrl.trim(),
    title: input.projectName,
    processingMode: input.processingMode
  });
}

export async function createSupoClipProjectFromUpload(
  input: SupoClipUploadInput
): Promise<SupoClipProjectResult> {
  const config = getConfig();
  if (!config) {
    return mockMessage("SUPOCLIP_USER_ID");
  }

  try {
    const formData = new FormData();
    formData.append(
      "video",
      new Blob([input.file]),
      input.fileName || "upload.mp4"
    );

    const uploadResponse = await fetch(`${config.baseUrl}/upload`, {
      method: "POST",
      headers: authHeaders(config),
      body: formData
    });

    const uploadText = await uploadResponse.text();
    let uploadPayload: unknown = uploadText;

    try {
      uploadPayload = JSON.parse(uploadText);
    } catch {
      // Keep raw text for error messages.
    }

    if (!uploadResponse.ok) {
      return {
        ok: false,
        mode: "live",
        status: uploadResponse.status,
        message:
          typeof uploadPayload === "string"
            ? uploadPayload
            : JSON.stringify(uploadPayload, null, 2)
      };
    }

    const videoPath =
      uploadPayload && typeof uploadPayload === "object"
        ? (uploadPayload as { video_path?: string }).video_path
        : undefined;

    if (!videoPath) {
      return {
        ok: false,
        mode: "live",
        message: "SupoClip upload did not return a video_path."
      };
    }

    return createSupoClipTask(config, {
      sourceUrl: videoPath,
      title: input.projectName,
      processingMode: input.processingMode
    });
  } catch (error) {
    return {
      ok: false,
      mode: "live",
      message:
        error instanceof Error
          ? `Could not upload to SupoClip: ${error.message}`
          : "Could not upload to SupoClip."
    };
  }
}

export async function getSupoClipProjectClips(
  projectId: string
): Promise<SupoClipClipsResult> {
  const config = getConfig();
  if (!config) {
    return {
      ok: false,
      mode: "mock",
      message: "SUPOCLIP_USER_ID is not set."
    };
  }

  const taskId = projectId.trim();
  if (!taskId) {
    return {
      ok: false,
      mode: "live",
      message: "Task ID is required."
    };
  }

  try {
    const response = await fetch(`${config.baseUrl}/tasks/${taskId}`, {
      headers: authHeaders(config)
    });

    const text = await response.text();
    let payload: unknown = text;

    try {
      payload = JSON.parse(text);
    } catch {
      // Keep raw text for error messages.
    }

    if (!response.ok) {
      return {
        ok: false,
        mode: "live",
        status: response.status,
        message:
          typeof payload === "string"
            ? payload
            : JSON.stringify(payload, null, 2)
      };
    }

    if (!payload || typeof payload !== "object") {
      return {
        ok: false,
        mode: "live",
        message: "SupoClip returned an unexpected task payload."
      };
    }

    const task = payload as {
      status?: string;
      clips?: unknown[];
      progress_message?: string;
    };
    const status = task.status ?? "unknown";
    const clips = parseClips(config, taskId, task.clips ?? []);
    const processing =
      status === "queued" ||
      status === "processing" ||
      (status === "completed" && clips.length === 0);

    if (status === "error" || status === "failed") {
      return {
        ok: false,
        mode: "live",
        message:
          task.progress_message ??
          "SupoClip task failed. Check docker-compose logs -f worker."
      };
    }

    return {
      ok: true,
      mode: "live",
      clips,
      processing,
      status,
      progressMessage: task.progress_message
    };
  } catch (error) {
    return {
      ok: false,
      mode: "live",
      message:
        error instanceof Error
          ? `Could not reach SupoClip: ${error.message}`
          : "Could not reach SupoClip."
    };
  }
}

export async function waitForSupoClipClips(
  projectId: string,
  options?: { maxAttempts?: number; intervalMs?: number }
): Promise<SupoClipClipsResult> {
  const maxAttempts = options?.maxAttempts ?? 60;
  const intervalMs = options?.intervalMs ?? 10_000;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const result = await getSupoClipProjectClips(projectId);
    if (!result.ok) {
      return result;
    }

    if (result.status === "completed" && result.clips.length > 0) {
      return { ...result, processing: false };
    }

    if (result.status === "error" || result.status === "failed") {
      return result;
    }

    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  return getSupoClipProjectClips(projectId);
}

export async function autoPostAllClipsToTikTok(input: {
  projectId: string;
  clips: SupoClipClip[];
}): Promise<AutoPostAllResult> {
  const config = getConfig();
  if (!config) {
    return {
      ok: false,
      mode: "mock",
      message: "SUPOCLIP_USER_ID is not set."
    };
  }

  const results: ClipPostResult[] = input.clips.map((clip) => ({
    clipId: clip.clipId,
    ok: false,
    message:
      "SupoClip does not expose TikTok auto-posting through Clip Operator. Open the SupoClip UI to export or post clips."
  }));

  return {
    ok: false,
    mode: "live",
    results,
    posted: 0,
    failed: results.length,
    message: `SupoClip clips are ready at ${config.frontendUrl}. TikTok auto-post is not available for this provider.`
  };
}
