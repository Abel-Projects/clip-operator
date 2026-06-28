export type WayinVideoClip = {
  id: string;
  clipId: string;
  idx: number;
  title?: string;
  description?: string;
  hashtags?: string;
  previewUrl?: string;
  thumbnailUrl?: string;
  durationSec?: number;
  score?: number;
};

export type WayinVideoProjectInput = {
  videoUrl: string;
  projectName?: string;
  targetDuration?: string;
  limit?: number;
};

export type WayinVideoUploadInput = {
  file: ArrayBuffer;
  fileName: string;
  projectName?: string;
  targetDuration?: string;
  limit?: number;
};

export type WayinVideoProjectRef = {
  id: string;
  /** Website library IDs (hmtask…) are not usable with the API. */
  isWebsiteTaskId: boolean;
};

/** Accept a raw API id or a wayin.ai library URL and normalize to an API task id. */
export function parseWayinVideoProjectRef(input: string): WayinVideoProjectRef | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const fromUrl =
    trimmed.match(/wayin(?:video)?\.ai\/wayinvideo\/video\/([^/?#]+)/i)?.[1] ??
    trimmed.match(/\/video\/([^/?#]+)/)?.[1];

  const id = fromUrl ?? trimmed;
  if (!id) {
    return null;
  }

  return {
    id,
    isWebsiteTaskId: /^hmtask/i.test(id)
  };
}

export function wayinVideoWebsiteTaskMessage(taskId: string): string {
  return (
    `"${taskId}" is a WayinVideo website task ID (from the library URL), not an API project ID. ` +
    "Clip Operator can only load clips created via the API (ids like prj06… or proj_…). " +
    "If you clipped from http://localhost:3000, open that page in the same browser and check " +
    "the saved ID in “Already have clips?” or run localStorage.getItem('clip-operator:lastProject:wayinvideo') " +
    "in DevTools. You can also post clips directly from the WayinVideo website calendar."
  );
}

export type WayinVideoProjectResult =
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

export type WayinVideoClipsResult =
  | {
      ok: true;
      mode: "live";
      clips: WayinVideoClip[];
      processing: boolean;
      status: string;
    }
  | {
      ok: false;
      mode: "mock" | "live";
      message: string;
      status?: number;
    };

export type WayinVideoIntegrationStatus = {
  configured: boolean;
  baseUrl: string;
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

type WayinVideoConfig = {
  apiKey: string;
  baseUrl: string;
  tikTokAccountId?: string;
};

type WayinVideoSocialAccount = {
  id: string;
  platform: string;
  displayName?: string;
  tokenValid: boolean;
};

const DEFAULT_BASE_URL = "https://wayinvideo-api.wayin.ai/api/v2";

function getConfig(): WayinVideoConfig | null {
  const apiKey = process.env.WAYINVIDEO_API_KEY;
  if (!apiKey) {
    return null;
  }

  return {
    apiKey,
    baseUrl:
      process.env.WAYINVIDEO_API_BASE_URL?.replace(/\/$/, "") ?? DEFAULT_BASE_URL,
    tikTokAccountId: process.env.WAYINVIDEO_TIKTOK_ACCOUNT_ID
  };
}

function authHeaders(config: WayinVideoConfig): Record<string, string> {
  return {
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json",
    "x-wayinvideo-api-version": "v2"
  };
}

function buildClipBody(input: WayinVideoProjectInput): Record<string, unknown> {
  return {
    video_url: input.videoUrl,
    project_name: input.projectName ?? "",
    target_duration: input.targetDuration ?? "DURATION_0_90",
    enable_export: true,
    resolution: "HD_720",
    enable_caption: true,
    enable_ai_reframe: true,
    ratio: "RATIO_9_16",
    ...(input.limit ? { limit: input.limit } : {})
  };
}

function parseClips(payload: unknown): WayinVideoClip[] {
  const data =
    payload && typeof payload === "object"
      ? ((payload as { data?: Record<string, unknown> }).data ?? null)
      : null;
  const list = data && Array.isArray(data.clips) ? data.clips : [];

  return list.flatMap((entry) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }

    const clip = entry as Record<string, unknown>;
    const idx = typeof clip.idx === "number" ? clip.idx : Number(clip.idx);
    if (!Number.isFinite(idx)) {
      return [];
    }

    const parsed: WayinVideoClip = {
      id: String(idx),
      clipId: String(idx),
      idx
    };

    if (typeof clip.title === "string") {
      parsed.title = clip.title;
    }

    if (typeof clip.desc === "string") {
      parsed.description = clip.desc;
    }

    if (Array.isArray(clip.tags)) {
      parsed.hashtags = clip.tags
        .filter((tag): tag is string => typeof tag === "string")
        .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`))
        .join(" ");
    }

    if (typeof clip.export_link === "string") {
      parsed.previewUrl = clip.export_link;
    }

    if (typeof clip.thumbnail === "string") {
      parsed.thumbnailUrl = clip.thumbnail;
    }

    if (typeof clip.score === "number") {
      parsed.score = clip.score;
    }

    const beginMs =
      typeof clip.begin_ms === "number"
        ? clip.begin_ms
        : Number(clip.begin_ms);
    const endMs =
      typeof clip.end_ms === "number" ? clip.end_ms : Number(clip.end_ms);

    if (Number.isFinite(beginMs) && Number.isFinite(endMs) && endMs > beginMs) {
      parsed.durationSec = (endMs - beginMs) / 1000;
    }

    return [parsed];
  });
}

function parseTaskStatus(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "UNKNOWN";
  }

  const data = (payload as { data?: { status?: unknown } }).data;
  return typeof data?.status === "string" ? data.status : "UNKNOWN";
}

function parseProjectId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const data = (payload as { data?: { id?: unknown } }).data;
  return typeof data?.id === "string" ? data.id : null;
}

async function uploadVideoToWayinVideo(
  config: WayinVideoConfig,
  file: ArrayBuffer,
  fileName: string
): Promise<{ ok: true; identity: string } | { ok: false; message: string }> {
  const linkResponse = await fetch(`${config.baseUrl}/upload/single-file`, {
    method: "POST",
    headers: authHeaders(config),
    body: JSON.stringify({ name: fileName })
  });

  const linkText = await linkResponse.text();
  let linkPayload: unknown = linkText;

  try {
    linkPayload = JSON.parse(linkText);
  } catch {
    // Keep raw text when WayinVideo returns non-JSON errors.
  }

  if (!linkResponse.ok) {
    return {
      ok: false,
      message:
        typeof linkPayload === "string"
          ? linkPayload
          : JSON.stringify(linkPayload, null, 2)
    };
  }

  const data =
    linkPayload && typeof linkPayload === "object"
      ? ((linkPayload as { data?: { upload_url?: string; identity?: string } })
          .data ?? null)
      : null;

  if (!data?.upload_url || !data.identity) {
    return { ok: false, message: "WayinVideo did not return an upload URL." };
  }

  const uploadResponse = await fetch(data.upload_url, {
    method: "PUT",
    headers: { "Content-Type": "application/octet-stream" },
    body: file
  });

  if (!uploadResponse.ok) {
    return {
      ok: false,
      message: `Video upload failed (${uploadResponse.status}).`
    };
  }

  return { ok: true, identity: data.identity };
}

export function getWayinVideoStatus(): WayinVideoIntegrationStatus {
  return {
    configured: Boolean(getConfig()),
    baseUrl: getConfig()?.baseUrl ?? DEFAULT_BASE_URL,
    hasTikTokAccount: false
  };
}

export async function getWayinVideoIntegrationStatus(): Promise<WayinVideoIntegrationStatus> {
  const base = getWayinVideoStatus();
  if (!base.configured) {
    return base;
  }

  if (getConfig()?.tikTokAccountId) {
    return { ...base, hasTikTokAccount: true };
  }

  const account = await resolveTikTokAccount();
  return {
    ...base,
    hasTikTokAccount: Boolean(account),
    tikTokAccountName: account?.displayName
  };
}

export async function createWayinVideoProject(
  input: WayinVideoProjectInput
): Promise<WayinVideoProjectResult> {
  const config = getConfig();
  if (!config) {
    return {
      ok: false,
      mode: "mock",
      message: "WAYINVIDEO_API_KEY is not set."
    };
  }

  try {
    const response = await fetch(`${config.baseUrl}/clips`, {
      method: "POST",
      headers: authHeaders(config),
      body: JSON.stringify(buildClipBody(input))
    });

    const text = await response.text();
    let payload: unknown = text;

    try {
      payload = JSON.parse(text);
    } catch {
      // Keep raw text when WayinVideo returns non-JSON errors.
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

    const projectId = parseProjectId(payload);
    if (!projectId) {
      return {
        ok: false,
        mode: "live",
        message: "WayinVideo accepted the task but did not return a project ID."
      };
    }

    return {
      ok: true,
      mode: "live",
      projectId,
      status: parseTaskStatus(payload)
    };
  } catch (error) {
    return {
      ok: false,
      mode: "live",
      message:
        error instanceof Error
          ? `Could not reach WayinVideo: ${error.message}`
          : "Could not reach WayinVideo."
    };
  }
}

export async function createWayinVideoProjectFromUpload(
  input: WayinVideoUploadInput
): Promise<WayinVideoProjectResult> {
  const config = getConfig();
  if (!config) {
    return {
      ok: false,
      mode: "mock",
      message: "WAYINVIDEO_API_KEY is not set."
    };
  }

  try {
    const upload = await uploadVideoToWayinVideo(
      config,
      input.file,
      input.fileName
    );
    if (!upload.ok) {
      return { ok: false, mode: "live", message: upload.message };
    }

    return createWayinVideoProject({
      videoUrl: upload.identity,
      projectName: input.projectName,
      targetDuration: input.targetDuration,
      limit: input.limit
    });
  } catch (error) {
    return {
      ok: false,
      mode: "live",
      message:
        error instanceof Error
          ? `Could not upload to WayinVideo: ${error.message}`
          : "Could not upload to WayinVideo."
    };
  }
}

type WayinVideoResultsKind = "clips" | "find-moments";

async function fetchWayinVideoResults(
  config: WayinVideoConfig,
  projectId: string,
  kind: WayinVideoResultsKind
): Promise<{ ok: true; payload: unknown } | { ok: false; status: number; message: string }> {
  const path =
    kind === "find-moments"
      ? `/clips/find-moments/results/${projectId}`
      : `/clips/results/${projectId}`;

  const response = await fetch(`${config.baseUrl}${path}`, {
    method: "GET",
    headers: authHeaders(config)
  });

  const text = await response.text();
  let payload: unknown = text;

  try {
    payload = JSON.parse(text);
  } catch {
    // Keep raw text when WayinVideo returns non-JSON errors.
  }

  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload &&
      "message" in payload &&
      typeof (payload as { message?: unknown }).message === "string"
        ? (payload as { message: string }).message
        : typeof payload === "string"
          ? payload
          : JSON.stringify(payload, null, 2);

    return { ok: false, status: response.status, message };
  }

  return { ok: true, payload };
}

function parseWayinVideoClipsPayload(payload: unknown): WayinVideoClipsResult {
  const status = parseTaskStatus(payload);
  const clips = parseClips(payload);

  if (status === "FAILED") {
    const data =
      payload && typeof payload === "object"
        ? ((payload as { data?: { error_message?: string } }).data ?? null)
        : null;
    return {
      ok: false,
      mode: "live",
      message: data?.error_message ?? "WayinVideo clipping failed."
    };
  }

  return {
    ok: true,
    mode: "live",
    clips,
    status,
    processing: status !== "SUCCEEDED" || clips.length === 0
  };
}

export async function getWayinVideoProjectClips(
  projectRef: string
): Promise<WayinVideoClipsResult> {
  const config = getConfig();
  if (!config) {
    return {
      ok: false,
      mode: "mock",
      message: "WAYINVIDEO_API_KEY is not set."
    };
  }

  const parsed = parseWayinVideoProjectRef(projectRef);
  if (!parsed) {
    return {
      ok: false,
      mode: "live",
      message: "Project ID or WayinVideo URL is required."
    };
  }

  if (parsed.isWebsiteTaskId) {
    return {
      ok: false,
      mode: "live",
      message: wayinVideoWebsiteTaskMessage(parsed.id)
    };
  }

  const projectId = parsed.id;

  try {
    const kinds: WayinVideoResultsKind[] = ["clips", "find-moments"];
    let lastError = "WayinVideo project not found.";

    for (const kind of kinds) {
      const result = await fetchWayinVideoResults(config, projectId, kind);
      if (result.ok) {
        return parseWayinVideoClipsPayload(result.payload);
      }

      lastError = result.message;
      const notFound =
        result.status === 404 ||
        /not found/i.test(result.message) ||
        result.status === 400;
      if (!notFound) {
        return {
          ok: false,
          mode: "live",
          status: result.status,
          message: result.message
        };
      }
    }

    return {
      ok: false,
      mode: "live",
      message: lastError
    };
  } catch (error) {
    return {
      ok: false,
      mode: "live",
      message:
        error instanceof Error
          ? `Could not reach WayinVideo: ${error.message}`
          : "Could not reach WayinVideo."
    };
  }
}

export async function waitForWayinVideoClips(
  projectId: string,
  options?: { maxAttempts?: number; intervalMs?: number }
): Promise<WayinVideoClipsResult> {
  const maxAttempts = options?.maxAttempts ?? 60;
  const intervalMs = options?.intervalMs ?? 10000;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const result = await getWayinVideoProjectClips(projectId);
    if (!result.ok) {
      return result;
    }

    if (result.status === "SUCCEEDED" && result.clips.length > 0) {
      return { ...result, processing: false };
    }

    if (result.status === "FAILED") {
      return result;
    }

    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  return getWayinVideoProjectClips(projectId);
}

function parseSocialAccounts(payload: unknown): WayinVideoSocialAccount[] {
  const list = Array.isArray(payload)
    ? payload
    : payload &&
        typeof payload === "object" &&
        Array.isArray((payload as { data?: unknown }).data)
      ? ((payload as { data: unknown[] }).data ?? [])
      : [];

  return list.flatMap((entry) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }

    const account = entry as Record<string, unknown>;
    const id = typeof account.id === "string" ? account.id : "";
    if (!id) {
      return [];
    }

    return [
      {
        id,
        platform: typeof account.platform === "string" ? account.platform : "",
        displayName:
          typeof account.platform_username === "string"
            ? account.platform_username
            : undefined,
        tokenValid: account.token_valid === true
      }
    ];
  });
}

export async function resolveTikTokAccount(): Promise<WayinVideoSocialAccount | null> {
  const config = getConfig();
  if (!config) {
    return null;
  }

  if (config.tikTokAccountId) {
    return {
      id: config.tikTokAccountId,
      platform: "tiktok",
      tokenValid: true
    };
  }

  try {
    const response = await fetch(
      `${config.baseUrl}/social-media/accounts?active_only=true`,
      {
        method: "GET",
        headers: authHeaders(config)
      }
    );

    if (!response.ok) {
      return null;
    }

    const accounts = parseSocialAccounts(await response.json());
    return (
      accounts.find(
        (account) =>
          account.platform.toLowerCase() === "tiktok" && account.tokenValid
      ) ?? null
    );
  } catch {
    return null;
  }
}

function buildPublishDescription(clip: WayinVideoClip): string {
  const parts = [clip.description, clip.hashtags].filter(Boolean);
  return parts.join("\n\n").trim() || clip.title || "Clip";
}

export async function autoPostAllClipsToTikTok(input: {
  projectId: string;
  clips: WayinVideoClip[];
}): Promise<AutoPostAllResult> {
  const config = getConfig();
  if (!config) {
    return {
      ok: false,
      mode: "mock",
      message: "WAYINVIDEO_API_KEY is not set."
    };
  }

  const account = await resolveTikTokAccount();
  if (!account) {
    return {
      ok: false,
      mode: "live",
      message:
        "No TikTok account found. Connect TikTok in WayinVideo or set WAYINVIDEO_TIKTOK_ACCOUNT_ID."
    };
  }

  if (input.clips.length === 0) {
    return {
      ok: false,
      mode: "live",
      message: "No clips were available to post."
    };
  }

  const results: ClipPostResult[] = [];

  for (const clip of input.clips) {
    try {
      const response = await fetch(`${config.baseUrl}/social-media/publish`, {
        method: "POST",
        headers: authHeaders(config),
        body: JSON.stringify({
          project_id: input.projectId,
          idx: clip.idx,
          resolution: "720p",
          publish_configs: {
            [account.id]: {
              title: clip.title ?? "Clip",
              description: buildPublishDescription(clip),
              visibility: "public"
            }
          },
          scheduled_at: null
        })
      });

      const text = await response.text();
      let payload: unknown = text;

      try {
        payload = JSON.parse(text);
      } catch {
        // Keep raw text when WayinVideo returns non-JSON errors.
      }

      if (!response.ok) {
        results.push({
          clipId: clip.clipId,
          ok: false,
          message:
            typeof payload === "string"
              ? payload
              : JSON.stringify(payload, null, 2)
        });
      } else {
        results.push({
          clipId: clip.clipId,
          ok: true,
          message: `Queued TikTok post for ${clip.title ?? `clip ${clip.idx}`}`
        });
      }
    } catch (error) {
      results.push({
        clipId: clip.clipId,
        ok: false,
        message:
          error instanceof Error ? error.message : "Unexpected publish error."
      });
    }

    await new Promise((resolve) => setTimeout(resolve, 1200));
  }

  const posted = results.filter((result) => result.ok).length;
  const failed = results.length - posted;

  if (failed === 0) {
    return { ok: true, mode: "live", results, posted, failed };
  }

  if (posted === 0) {
    return {
      ok: false,
      mode: "live",
      message: "None of the clips could be posted to TikTok.",
      results,
      posted,
      failed
    };
  }

  return {
    ok: true,
    mode: "live",
    results,
    posted,
    failed,
    message: `${failed} clip(s) failed to post.`
  };
}
