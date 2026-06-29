export type OpusClipProjectInput = {
  videoUrl: string;
  uploadId?: string;
  topicKeywords?: string[];
  brandTemplateId?: string;
  sourceLang?: string;
  clipDurationSec?: number;
};

export type OpusClipUploadInput = {
  file: ArrayBuffer;
  fileName?: string;
  topicKeywords?: string[];
  brandTemplateId?: string;
  sourceLang?: string;
  clipDurationSec?: number;
};

export type OpusClipClip = {
  id: string;
  clipId: string;
  title?: string;
  description?: string;
  hashtags?: string;
  previewUrl?: string;
  durationSec?: number;
  score?: number;
};

export type OpusClipProjectResult =
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

export type OpusClipClipsResult =
  | {
      ok: true;
      mode: "live";
      clips: OpusClipClip[];
      processing: boolean;
    }
  | {
      ok: false;
      mode: "mock" | "live";
      message: string;
      status?: number;
    };

export type OpusClipPublishInput = {
  projectId: string;
  clipId: string;
  title?: string;
  description?: string;
  postAccountId?: string;
  subAccountId?: string;
};

export type OpusClipPublishResult =
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

export type OpusClipIntegrationStatus = {
  configured: boolean;
  baseUrl: string;
  hasOrgId: boolean;
  hasPublishAccounts: boolean;
  hasTikTokAccount: boolean;
  tikTokAccountName?: string;
};

export type OpusClipSocialAccount = {
  postAccountId: string;
  subAccountId: string;
  platform: string;
  displayName?: string;
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

type OpusClipConfig = {
  apiKey: string;
  baseUrl: string;
  orgId?: string;
  postAccountId?: string;
  subAccountId?: string;
};

function getConfig(): OpusClipConfig | null {
  const apiKey = process.env.OPUSCLIP_API_KEY;
  if (!apiKey) {
    return null;
  }

  return {
    apiKey,
    baseUrl:
      process.env.OPUSCLIP_API_BASE_URL?.replace(/\/$/, "") ??
      "https://api.opus.pro/api",
    orgId: process.env.OPUSCLIP_ORG_ID,
    postAccountId: process.env.OPUSCLIP_POST_ACCOUNT_ID,
    subAccountId: process.env.OPUSCLIP_SUB_ACCOUNT_ID
  };
}

function mockProjectMessage(missing: string): OpusClipProjectResult {
  return {
    ok: false,
    mode: "mock",
    message: `${missing} is not set, so OpusClip is running in mock mode.`
  };
}

function mockClipsMessage(missing: string): OpusClipClipsResult {
  return {
    ok: false,
    mode: "mock",
    message: `${missing} is not set, so OpusClip is running in mock mode.`
  };
}

function mockPublishMessage(missing: string): OpusClipPublishResult {
  return {
    ok: false,
    mode: "mock",
    message: `${missing} is not set, so OpusClip is running in mock mode.`
  };
}

function authHeaders(
  config: OpusClipConfig,
  options?: { uploadId?: string }
): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json"
  };

  if (config.orgId) {
    headers["x-opus-org-id"] = config.orgId;
  }

  if (options?.uploadId) {
    headers["x-opus-upload-id"] = options.uploadId;
  }

  return headers;
}

function buildProjectBody(input: OpusClipProjectInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    videoUrl: input.videoUrl
  };

  if (input.brandTemplateId) {
    body.brandTemplateId = input.brandTemplateId;
  }

  if (input.topicKeywords?.length || input.clipDurationSec) {
    body.curationPref = {
      ...(input.topicKeywords?.length
        ? { topicKeywords: input.topicKeywords }
        : {}),
      ...(input.clipDurationSec
        ? { clipDurations: [[0, input.clipDurationSec]] }
        : {}),
      genre: "Auto",
      skipCurate: false
    };
  }

  if (input.sourceLang) {
    body.importPref = { sourceLang: input.sourceLang };
  }

  return body;
}

async function uploadVideoToOpusClip(
  config: OpusClipConfig,
  file: ArrayBuffer
): Promise<{ ok: true; uploadId: string } | { ok: false; message: string }> {
  const linkResponse = await fetch(`${config.baseUrl}/upload-links`, {
    method: "POST",
    headers: authHeaders(config),
    body: JSON.stringify({ video: { usecase: "LocalUpload" } })
  });

  const linkText = await linkResponse.text();
  let linkPayload: unknown = linkText;

  try {
    linkPayload = JSON.parse(linkText);
  } catch {
    // Keep raw text when OpusClip returns non-JSON errors.
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

  if (!linkPayload || typeof linkPayload !== "object") {
    return { ok: false, message: "OpusClip did not return an upload link." };
  }

  const { url, uploadId } = linkPayload as { url?: string; uploadId?: string };
  if (!url || !uploadId) {
    return { ok: false, message: "OpusClip upload link response was incomplete." };
  }

  const sessionResponse = await fetch(url, {
    method: "POST",
    headers: {
      "x-goog-resumable": "start",
      "Content-Length": "0"
    }
  });

  if (!sessionResponse.ok) {
    return {
      ok: false,
      message: `Could not start OpusClip upload session (${sessionResponse.status}).`
    };
  }

  const sessionUrl = sessionResponse.headers.get("location");
  if (!sessionUrl) {
    return {
      ok: false,
      message: "OpusClip did not return an upload session URL."
    };
  }

  const uploadResponse = await fetch(sessionUrl, {
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

  return { ok: true, uploadId };
}

function parseProjectId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const candidates = [record.id, record.projectId, record.project_id];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  const data = record.data;
  if (data && typeof data === "object") {
    return parseProjectId(data);
  }

  return null;
}

function parseClipId(rawId: unknown, projectId: string): string {
  if (typeof rawId !== "string" || !rawId.trim()) {
    return "";
  }

  const id = rawId.trim();
  if (id.includes(".")) {
    const [, clipId] = id.split(".", 2);
    return clipId ?? id;
  }

  if (id.startsWith(projectId)) {
    return id.slice(projectId.length).replace(/^\./, "");
  }

  return id;
}

function parseClips(payload: unknown, projectId: string): OpusClipClip[] {
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

    const clip = entry as Record<string, unknown>;
    const compositeId =
      typeof clip.id === "string"
        ? clip.id
        : typeof clip.clipId === "string"
          ? `${projectId}.${clip.clipId}`
          : "";
    const clipId =
      typeof clip.clipId === "string"
        ? clip.clipId
        : parseClipId(compositeId, projectId);

    if (!clipId) {
      return [];
    }

    const parsed: OpusClipClip = {
      id: compositeId || `${projectId}.${clipId}`,
      clipId
    };

    if (typeof clip.title === "string") {
      parsed.title = clip.title;
    } else if (typeof clip.name === "string") {
      parsed.title = clip.name;
    }

    if (typeof clip.uriForPreview === "string") {
      parsed.previewUrl = clip.uriForPreview;
    } else if (typeof clip.previewUrl === "string") {
      parsed.previewUrl = clip.previewUrl;
    }

    if (typeof clip.durationSec === "number") {
      parsed.durationSec = clip.durationSec;
    } else if (typeof clip.duration === "number") {
      parsed.durationSec = clip.duration;
    } else if (typeof clip.durationMs === "number") {
      parsed.durationSec = clip.durationMs / 1000;
    }

    if (typeof clip.description === "string") {
      parsed.description = clip.description;
    }

    if (typeof clip.hashtags === "string") {
      parsed.hashtags = clip.hashtags;
    }

    const scoreCandidate =
      typeof clip.score === "number"
        ? clip.score
        : typeof clip.viralityScore === "number"
          ? clip.viralityScore
          : typeof clip.virality_score === "number"
            ? clip.virality_score
            : typeof clip.curatedScore === "number"
              ? clip.curatedScore
              : undefined;

    if (typeof scoreCandidate === "number") {
      parsed.score = scoreCandidate;
    }

    return [parsed];
  });
}

export function getOpusClipStatus(): OpusClipIntegrationStatus {
  const config = getConfig();

  return {
    configured: Boolean(config),
    baseUrl: config?.baseUrl ?? "https://api.opus.pro/api",
    hasOrgId: Boolean(config?.orgId),
    hasPublishAccounts: Boolean(config?.postAccountId && config?.subAccountId),
    hasTikTokAccount: false
  };
}

export async function getOpusClipIntegrationStatus(): Promise<OpusClipIntegrationStatus> {
  const base = getOpusClipStatus();
  if (!base.configured) {
    return base;
  }

  if (base.hasPublishAccounts) {
    return { ...base, hasTikTokAccount: true };
  }

  const account = await resolveTikTokAccount();
  return {
    ...base,
    hasTikTokAccount: Boolean(account),
    tikTokAccountName: account?.displayName
  };
}

function parseSocialAccounts(payload: unknown): OpusClipSocialAccount[] {
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
    const postAccountId =
      typeof account.postAccountId === "string" ? account.postAccountId : "";
    if (!postAccountId) {
      return [];
    }

    const platform =
      typeof account.platform === "string" ? account.platform : "UNKNOWN";
    const extPages = Array.isArray(account.extPages) ? account.extPages : [];
    const firstPage =
      extPages[0] && typeof extPages[0] === "object"
        ? (extPages[0] as Record<string, unknown>)
        : null;
    const subAccountId =
      typeof firstPage?.subAccountId === "string"
        ? firstPage.subAccountId
        : postAccountId;

    const parsed: OpusClipSocialAccount = {
      postAccountId,
      subAccountId,
      platform
    };

    if (typeof account.extUserName === "string") {
      parsed.displayName = account.extUserName;
    }

    return [parsed];
  });
}

export async function getOpusClipSocialAccounts(): Promise<
  OpusClipSocialAccount[] | null
> {
  const config = getConfig();
  if (!config) {
    return null;
  }

  try {
    const response = await fetch(
      `${config.baseUrl}/social-accounts?q=mine`,
      {
        method: "GET",
        headers: authHeaders(config)
      }
    );

    if (!response.ok) {
      return null;
    }

    return parseSocialAccounts(await response.json());
  } catch {
    return null;
  }
}

export async function resolveTikTokAccount(): Promise<OpusClipSocialAccount | null> {
  const config = getConfig();
  if (!config) {
    return null;
  }

  if (config.postAccountId) {
    return {
      postAccountId: config.postAccountId,
      subAccountId: config.subAccountId ?? config.postAccountId,
      platform: "TIKTOK",
      displayName: undefined
    };
  }

  const accounts = await getOpusClipSocialAccounts();
  if (!accounts?.length) {
    return null;
  }

  const tiktok =
    accounts.find((account) =>
      account.platform.toUpperCase().includes("TIKTOK")
    ) ?? null;

  return tiktok;
}

function buildCaption(clip: OpusClipClip): { title: string; description: string } {
  const title = clip.title ?? "Clip";
  const parts = [clip.description, clip.hashtags].filter(Boolean);
  const description = parts.join("\n\n").trim() || title;

  return { title, description };
}

async function createSocialCopyJob(input: {
  projectId: string;
  clipId: string;
  postAccountId: string;
  subAccountId: string;
}): Promise<{ ok: true; jobId: string } | { ok: false; message: string }> {
  const config = getConfig();
  if (!config) {
    return { ok: false, message: "OPUSCLIP_API_KEY is not set." };
  }

  const response = await fetch(`${config.baseUrl}/social-copy-jobs`, {
    method: "POST",
    headers: authHeaders(config),
    body: JSON.stringify(input)
  });

  const text = await response.text();
  let payload: unknown = text;

  try {
    payload = JSON.parse(text);
  } catch {
    // Keep raw text when OpusClip returns non-JSON errors.
  }

  if (!response.ok) {
    return {
      ok: false,
      message:
        typeof payload === "string"
          ? payload
          : JSON.stringify(payload, null, 2)
    };
  }

  const jobId =
    payload &&
    typeof payload === "object" &&
    (payload as { data?: { jobId?: string } }).data?.jobId;

  if (!jobId || typeof jobId !== "string") {
    return { ok: false, message: "OpusClip did not return a social copy job ID." };
  }

  return { ok: true, jobId };
}

async function waitForSocialCopyJob(
  jobId: string,
  options?: { maxAttempts?: number; intervalMs?: number }
): Promise<{ ok: true; title: string; description: string } | { ok: false; message: string }> {
  const config = getConfig();
  if (!config) {
    return { ok: false, message: "OPUSCLIP_API_KEY is not set." };
  }

  const maxAttempts = options?.maxAttempts ?? 20;
  const intervalMs = options?.intervalMs ?? 1500;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await fetch(`${config.baseUrl}/social-copy-jobs/${jobId}`, {
      method: "GET",
      headers: authHeaders(config)
    });

    const text = await response.text();
    let payload: unknown = text;

    try {
      payload = JSON.parse(text);
    } catch {
      // Keep raw text when OpusClip returns non-JSON errors.
    }

    if (!response.ok) {
      return {
        ok: false,
        message:
          typeof payload === "string"
            ? payload
            : JSON.stringify(payload, null, 2)
      };
    }

    const data =
      payload && typeof payload === "object"
        ? ((payload as { data?: Record<string, unknown> }).data ?? null)
        : null;

    const status = typeof data?.status === "string" ? data.status : "";

    if (status === "COMPLETED") {
      const result =
        data?.result && typeof data.result === "object"
          ? (data.result as Record<string, unknown>)
          : data;

      const title =
        typeof result?.title === "string"
          ? result.title
          : typeof data?.title === "string"
            ? data.title
            : "";
      const description =
        typeof result?.description === "string"
          ? result.description
          : typeof result?.caption === "string"
            ? result.caption
            : typeof data?.description === "string"
              ? data.description
              : "";

      if (title || description) {
        return {
          ok: true,
          title: title || "Clip",
          description: description || title || "Clip"
        };
      }
    }

    if (status === "FAILED") {
      const error =
        typeof data?.error === "string"
          ? data.error
          : "Social copy generation failed.";
      return { ok: false, message: error };
    }

    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  return { ok: false, message: "Social copy generation timed out." };
}

async function resolveClipCaption(
  projectId: string,
  clip: OpusClipClip,
  account: OpusClipSocialAccount
): Promise<{ title: string; description: string }> {
  const fallback = buildCaption(clip);
  const job = await createSocialCopyJob({
    projectId,
    clipId: clip.clipId,
    postAccountId: account.postAccountId,
    subAccountId: account.subAccountId
  });

  if (!job.ok) {
    return fallback;
  }

  await new Promise((resolve) => setTimeout(resolve, 1100));

  const copy = await waitForSocialCopyJob(job.jobId, {
    maxAttempts: 15,
    intervalMs: 1500
  });

  if (!copy.ok) {
    return fallback;
  }

  return copy;
}

export async function publishOpusClipToTikTok(input: {
  projectId: string;
  clip: OpusClipClip;
}): Promise<ClipPostResult> {
  const config = getConfig();
  if (!config) {
    return {
      clipId: input.clip.clipId,
      ok: false,
      message: "OPUSCLIP_API_KEY is not set."
    };
  }

  const account = await resolveTikTokAccount();
  if (!account) {
    return {
      clipId: input.clip.clipId,
      ok: false,
      message:
        "No TikTok account found. Connect TikTok in OpusClip or set OPUSCLIP_POST_ACCOUNT_ID."
    };
  }

  try {
    const caption = await resolveClipCaption(input.projectId, input.clip, account);
    const publish = await publishOpusClipPost({
      projectId: input.projectId,
      clipId: input.clip.clipId,
      title: caption.title,
      description: caption.description,
      postAccountId: account.postAccountId,
      subAccountId: account.subAccountId
    });

    return {
      clipId: input.clip.clipId,
      ok: publish.ok,
      message: publish.ok
        ? `Queued post for ${caption.title}`
        : publish.message
    };
  } catch (error) {
    return {
      clipId: input.clip.clipId,
      ok: false,
      message:
        error instanceof Error ? error.message : "Unexpected publish error."
    };
  }
}

export async function autoPostAllClipsToTikTok(input: {
  projectId: string;
  clips: OpusClipClip[];
}): Promise<AutoPostAllResult> {
  const config = getConfig();
  if (!config) {
    return {
      ok: false,
      mode: "mock",
      message: "OPUSCLIP_API_KEY is not set."
    };
  }

  const account = await resolveTikTokAccount();
  if (!account) {
    return {
      ok: false,
      mode: "live",
      message:
        "No TikTok account found. Connect TikTok in OpusClip or set OPUSCLIP_POST_ACCOUNT_ID."
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
    const result = await publishOpusClipToTikTok({
      projectId: input.projectId,
      clip
    });
    results.push(result);

    await new Promise((resolve) => setTimeout(resolve, 1200));
  }

  const posted = results.filter((result) => result.ok).length;
  const failed = results.length - posted;

  if (failed === 0) {
    return {
      ok: true,
      mode: "live",
      results,
      posted,
      failed
    };
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

export async function createOpusClipProject(
  input: OpusClipProjectInput
): Promise<OpusClipProjectResult> {
  const config = getConfig();
  if (!config) {
    return mockProjectMessage("OPUSCLIP_API_KEY");
  }

  const body = buildProjectBody(input);

  try {
    const response = await fetch(`${config.baseUrl}/clip-projects`, {
      method: "POST",
      headers: authHeaders(config, { uploadId: input.uploadId }),
      body: JSON.stringify(body)
    });

    const text = await response.text();
    let payload: unknown = text;

    try {
      payload = JSON.parse(text);
    } catch {
      // Keep raw text when OpusClip returns non-JSON errors.
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
        message: "OpusClip accepted the project but did not return a project ID."
      };
    }

    const status =
      payload &&
      typeof payload === "object" &&
      typeof (payload as { status?: unknown }).status === "string"
        ? (payload as { status: string }).status
        : undefined;

    return {
      ok: true,
      mode: "live",
      projectId,
      status
    };
  } catch (error) {
    return {
      ok: false,
      mode: "live",
      message:
        error instanceof Error
          ? `Could not reach OpusClip: ${error.message}`
          : "Could not reach OpusClip."
    };
  }
}

export async function createOpusClipProjectFromUpload(
  input: OpusClipUploadInput
): Promise<OpusClipProjectResult> {
  const config = getConfig();
  if (!config) {
    return mockProjectMessage("OPUSCLIP_API_KEY");
  }

  try {
    const upload = await uploadVideoToOpusClip(config, input.file);
    if (!upload.ok) {
      return {
        ok: false,
        mode: "live",
        message: upload.message
      };
    }

    return createOpusClipProject({
      videoUrl: upload.uploadId,
      uploadId: upload.uploadId,
      topicKeywords: input.topicKeywords,
      brandTemplateId: input.brandTemplateId,
      sourceLang: input.sourceLang,
      clipDurationSec: input.clipDurationSec
    });
  } catch (error) {
    return {
      ok: false,
      mode: "live",
      message:
        error instanceof Error
          ? `Could not upload to OpusClip: ${error.message}`
          : "Could not upload to OpusClip."
    };
  }
}

export async function getOpusClipProjectClips(
  projectId: string
): Promise<OpusClipClipsResult> {
  const config = getConfig();
  if (!config) {
    return mockClipsMessage("OPUSCLIP_API_KEY");
  }

  const query = new URLSearchParams({
    q: "findByProjectId",
    projectId
  });

  try {
    const response = await fetch(
      `${config.baseUrl}/exportable-clips?${query.toString()}`,
      {
        method: "GET",
        headers: authHeaders(config)
      }
    );

    const text = await response.text();
    let payload: unknown = text;

    try {
      payload = JSON.parse(text);
    } catch {
      // Keep raw text when OpusClip returns non-JSON errors.
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

    const clips = parseClips(payload, projectId);

    return {
      ok: true,
      mode: "live",
      clips,
      processing: clips.length === 0
    };
  } catch (error) {
    return {
      ok: false,
      mode: "live",
      message:
        error instanceof Error
          ? `Could not reach OpusClip: ${error.message}`
          : "Could not reach OpusClip."
    };
  }
}

export async function waitForOpusClipClips(
  projectId: string,
  options?: { maxAttempts?: number; intervalMs?: number }
): Promise<OpusClipClipsResult> {
  const maxAttempts = options?.maxAttempts ?? 30;
  const intervalMs = options?.intervalMs ?? 5000;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const result = await getOpusClipProjectClips(projectId);
    if (!result.ok) {
      return result;
    }

    if (result.clips.length > 0) {
      return { ...result, processing: false };
    }

    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  const finalResult = await getOpusClipProjectClips(projectId);
  if (!finalResult.ok) {
    return finalResult;
  }

  return {
    ...finalResult,
    processing: finalResult.clips.length === 0
  };
}

export async function publishOpusClipPost(
  input: OpusClipPublishInput
): Promise<OpusClipPublishResult> {
  const config = getConfig();
  if (!config) {
    return mockPublishMessage("OPUSCLIP_API_KEY");
  }

  const postAccountId = input.postAccountId ?? config.postAccountId;
  const subAccountId =
    input.subAccountId ?? config.subAccountId ?? postAccountId;

  if (!postAccountId) {
    return {
      ok: false,
      mode: "mock",
      message:
        "No OpusClip post account is configured, so publishing is running in mock mode."
    };
  }

  try {
    const response = await fetch(`${config.baseUrl}/post-tasks`, {
      method: "POST",
      headers: authHeaders(config),
      body: JSON.stringify({
        projectId: input.projectId,
        clipId: input.clipId,
        postAccountId,
        subAccountId,
        postDetail: {
          title: input.title ?? "Clip Operator post",
          custom: {
            description: input.description ?? input.title ?? "",
            privacy: "public"
          },
          mediaType: "video"
        }
      })
    });

    const body = await response.text();

    if (response.ok) {
      return {
        ok: true,
        mode: "live",
        status: response.status,
        body
      };
    }

    return {
      ok: false,
      mode: "live",
      status: response.status,
      message: body
    };
  } catch (error) {
    return {
      ok: false,
      mode: "live",
      message:
        error instanceof Error
          ? `Could not reach OpusClip: ${error.message}`
          : "Could not reach OpusClip."
    };
  }
}
