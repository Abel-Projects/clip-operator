export type ClipJobInput = {
  sourceUrl: string;
};

export type ClipJobResult =
  | {
      ok: true;
      mode: "live";
      jobId: string;
      status: string;
    }
  | {
      ok: false;
      mode: "mock" | "live";
      message: string;
      status?: number;
    };

export type ClipSummary = {
  title?: string;
  videoUrl?: string;
};

export type ClipJobStatus = {
  status: string;
  logs: string[];
  clips: ClipSummary[];
};

export type PublishClipInput = {
  jobId: string;
  clipIndex?: number;
  platforms?: string[];
  title?: string;
  description?: string;
  scheduledDate?: string;
  timezone?: string;
};

export type PublishClipResult =
  | {
      ok: true;
      mode: "live";
      status: number;
      body: string;
    }
  | {
      ok: false;
      mode: "mock" | "live";
      message: string;
      status?: number;
    };

type OpenShortsConfig = {
  baseUrl: string;
  geminiApiKey: string;
  uploadPostApiKey?: string;
  uploadPostUserId?: string;
};

function getConfig(): OpenShortsConfig | null {
  const baseUrl = process.env.OPENSHORTS_BASE_URL?.replace(/\/$/, "");
  const geminiApiKey = process.env.GEMINI_API_KEY;

  if (!baseUrl || !geminiApiKey) {
    return null;
  }

  return {
    baseUrl,
    geminiApiKey,
    uploadPostApiKey: process.env.UPLOAD_POST_API_KEY,
    uploadPostUserId: process.env.UPLOAD_POST_USER_ID
  };
}

function mockMessage(missing: string): ClipJobResult {
  return {
    ok: false,
    mode: "mock",
    message: `${missing} is not set, so clip generation is running in mock mode.`
  };
}

function parseClips(result: unknown): ClipSummary[] {
  if (!result || typeof result !== "object") {
    return [];
  }

  const clips = (result as { clips?: unknown }).clips;
  if (!Array.isArray(clips)) {
    return [];
  }

  return clips.map((clip) => {
    if (!clip || typeof clip !== "object") {
      return {};
    }

    const entry = clip as { title?: unknown; video_url?: unknown };
    return {
      title: typeof entry.title === "string" ? entry.title : undefined,
      videoUrl: typeof entry.video_url === "string" ? entry.video_url : undefined
    };
  });
}

export async function createClipJob(input: ClipJobInput): Promise<ClipJobResult> {
  const config = getConfig();
  if (!config) {
    return mockMessage("OPENSHORTS_BASE_URL or GEMINI_API_KEY");
  }

  try {
    const response = await fetch(`${config.baseUrl}/api/process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gemini-Key": config.geminiApiKey
      },
      body: JSON.stringify({
        url: input.sourceUrl,
        acknowledged: true
      })
    });

    if (!response.ok) {
      return {
        ok: false,
        mode: "live",
        status: response.status,
        message: await response.text()
      };
    }

    const data = (await response.json()) as { job_id?: string; status?: string };
    if (!data.job_id) {
      return {
        ok: false,
        mode: "live",
        message: "OpenShorts did not return a job_id."
      };
    }

    return {
      ok: true,
      mode: "live",
      jobId: data.job_id,
      status: data.status ?? "queued"
    };
  } catch (error) {
    return {
      ok: false,
      mode: "live",
      message:
        error instanceof Error
          ? `Could not reach OpenShorts at ${config.baseUrl}: ${error.message}. Start it with pnpm openshorts.`
          : "Could not reach OpenShorts. Start it with pnpm openshorts."
    };
  }
}

export async function getClipJobStatus(jobId: string): Promise<ClipJobStatus | null> {
  const config = getConfig();
  if (!config) {
    return null;
  }

  try {
    const response = await fetch(`${config.baseUrl}/api/status/${jobId}`);
    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      status?: string;
      logs?: string[];
      result?: unknown;
    };

    return {
      status: data.status ?? "unknown",
      logs: Array.isArray(data.logs) ? data.logs : [],
      clips: parseClips(data.result)
    };
  } catch {
    return null;
  }
}

export async function waitForClipJob(
  jobId: string,
  options?: { maxAttempts?: number; intervalMs?: number }
): Promise<ClipJobStatus | null> {
  const maxAttempts = options?.maxAttempts ?? 30;
  const intervalMs = options?.intervalMs ?? 2000;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const status = await getClipJobStatus(jobId);
    if (!status) {
      return null;
    }

    if (status.status === "completed" || status.status === "failed") {
      return status;
    }

    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  return getClipJobStatus(jobId);
}

export async function publishClip(input: PublishClipInput): Promise<PublishClipResult> {
  const config = getConfig();
  if (!config) {
    return {
      ok: false,
      mode: "mock",
      message: "OPENSHORTS_BASE_URL or GEMINI_API_KEY is not set."
    };
  }

  if (!config.uploadPostApiKey || !config.uploadPostUserId) {
    return {
      ok: false,
      mode: "mock",
      message:
        "UPLOAD_POST_API_KEY or UPLOAD_POST_USER_ID is not set, so publishing is running in mock mode."
    };
  }

  try {
    const response = await fetch(`${config.baseUrl}/api/social/post`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        job_id: input.jobId,
        clip_index: input.clipIndex ?? 0,
        api_key: config.uploadPostApiKey,
        user_id: config.uploadPostUserId,
        platforms: input.platforms ?? ["tiktok", "instagram", "youtube"],
        title: input.title,
        description: input.description,
        scheduled_date: input.scheduledDate,
        timezone: input.timezone ?? "UTC"
      })
    });

    const body = await response.text();
    if (response.ok) {
      return {
        ok: true as const,
        mode: "live" as const,
        status: response.status,
        body
      };
    }

    return {
      ok: false as const,
      mode: "live" as const,
      message: body,
      status: response.status
    };
  } catch (error) {
    return {
      ok: false,
      mode: "live",
      message:
        error instanceof Error
          ? `Could not reach OpenShorts at ${config.baseUrl}: ${error.message}`
          : "Could not reach OpenShorts."
    };
  }
}
