"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  authFetch,
  clearSitePassword,
  getStoredSitePassword,
  storeSitePassword
} from "@/lib/client-auth";

type Provider = "opusclip" | "wayinvideo" | "supoclip";

type IntegrationStatus = {
  configured: boolean;
  hasTikTokAccount: boolean;
  tikTokAccountName?: string;
};

type ClipItem = {
  id: string;
  clipId: string;
  title?: string;
  previewUrl?: string;
  durationSec?: number;
  score?: number;
};

type ClipPostResult = {
  clipId: string;
  ok: boolean;
  message: string;
};

type Phase =
  | "idle"
  | "submitting"
  | "processing"
  | "posting"
  | "ready"
  | "error";

type SourceMode = "link" | "upload";

const PROVIDERS: {
  id: Provider;
  label: string;
  hint: string;
  logo: string;
  supportsTikTok: boolean;
}[] = [
  {
    id: "wayinvideo",
    label: "WayinVideo",
    hint: "WayinVideo AI clipping API",
    logo: "/logos/wayinvideo.png",
    supportsTikTok: true
  },
  {
    id: "opusclip",
    label: "OpusClip",
    hint: "Hosted OpusClip API",
    logo: "/logos/opusclip.png",
    supportsTikTok: true
  },
  {
    id: "supoclip",
    label: "SupoClip",
    hint: "Self-hosted open-source clipper",
    logo: "/logos/supoclip.svg",
    supportsTikTok: false
  }
];

const PROVIDER_ENV_KEYS: Record<Provider, string> = {
  opusclip: "OPUSCLIP_API_KEY",
  wayinvideo: "WAYINVIDEO_API_KEY",
  supoclip: "SUPOCLIP_USER_ID"
};

function parseInitialProvider(searchParams: URLSearchParams): Provider {
  const requested = searchParams.get("provider");
  if (
    requested === "opusclip" ||
    requested === "wayinvideo" ||
    requested === "supoclip"
  ) {
    return requested;
  }

  return "wayinvideo";
}

function formatDuration(seconds?: number) {
  if (!seconds) return null;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ClipWorkbench() {
  const searchParams = useSearchParams();
  const initialProvider = parseInitialProvider(searchParams);

  const [provider, setProvider] = useState<Provider>(initialProvider);
  const [sourceMode, setSourceMode] = useState<SourceMode>("link");
  const [videoUrl, setVideoUrl] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [topicKeywords, setTopicKeywords] = useState("");
  const [clipDurationSec, setClipDurationSec] = useState("90");
  const [projectId, setProjectId] = useState("");
  const [existingProjectId, setExistingProjectId] = useState("");
  const [clips, setClips] = useState<ClipItem[]>([]);
  const [postResults, setPostResults] = useState<ClipPostResult[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [integration, setIntegration] = useState<IntegrationStatus | null>(null);
  const [siteUnlocked, setSiteUnlocked] = useState(false);
  const [sitePassword, setSitePassword] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const apiBase = `${basePath}/api/${provider}`;
  const providerMeta = PROVIDERS.find((entry) => entry.id === provider) ?? PROVIDERS[0];
  const providerLabel = providerMeta.label;
  const supportsTikTok = providerMeta.supportsTikTok;
  const hasSource = sourceMode === "link" ? Boolean(videoUrl.trim()) : Boolean(selectedFile);
  const postedCount = postResults.filter((result) => result.ok).length;

  const activeStep = useMemo(() => {
    if (phase === "posting" || (phase === "ready" && postedCount > 0)) return 4;
    if (phase === "ready" && clips.length > 0) return 3;
    if (phase === "submitting" || phase === "processing" || projectId) return 2;
    return 1;
  }, [phase, clips.length, projectId, postedCount]);

  const isBusy =
    phase === "submitting" || phase === "processing" || phase === "posting";

  const loadIntegration = useCallback(async () => {
    const response = await authFetch(`${apiBase}/config`);

    if (response.status === 401) {
      setSiteUnlocked(false);
      setIntegration(null);
      return;
    }

    setSiteUnlocked(true);
    const data = (await response.json()) as IntegrationStatus;
    setIntegration(data);
  }, [apiBase]);

  useEffect(() => {
    if (getStoredSitePassword()) {
      void loadIntegration().catch(() =>
        setIntegration({
          configured: false,
          hasTikTokAccount: false
        })
      );
      return;
    }

    void loadIntegration().catch(() => {
      setSiteUnlocked(false);
      setIntegration({
        configured: false,
        hasTikTokAccount: false
      });
    });
  }, [loadIntegration]);

  async function handleUnlockSite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError("");

    const password = sitePassword.trim();
    if (!password) {
      return;
    }

    storeSitePassword(password);

    const response = await authFetch(`${apiBase}/config`);
    if (response.status === 401) {
      clearSitePassword();
      setPasswordError("Wrong password.");
      return;
    }

    setSiteUnlocked(true);
    setSitePassword("");
    await loadIntegration();
  }

  useEffect(() => {
    const saved = localStorage.getItem(`clip-operator:lastProject:${provider}`);
    if (saved) {
      setExistingProjectId(saved);
    }
  }, [provider]);

  function rememberProjectId(id: string) {
    localStorage.setItem(`clip-operator:lastProject:${provider}`, id);
    setExistingProjectId(id);
  }

  function resetRunState() {
    setProjectId("");
    setClips([]);
    setPostResults([]);
    setPhase("idle");
    setErrorMessage("");
  }

  function handleProviderChange(next: Provider) {
    setProvider(next);
    resetRunState();
  }

  async function loadClips(id: string) {
    const response = await authFetch(
      `${apiBase}/clips?projectId=${encodeURIComponent(id)}`
    );
    const data = (await response.json()) as {
      ok?: boolean;
      clips?: ClipItem[];
      message?: string;
    };

    if (!data.ok) {
      throw new Error(data.message ?? "Could not load clips.");
    }

    return data.clips ?? [];
  }

  async function pollClipsUntilReady(id: string) {
    const maxAttempts = 40;
    const intervalMs = 15_000;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const nextClips = await loadClips(id);
      if (nextClips.length > 0) {
        return nextClips;
      }

      if (attempt < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    }

    throw new Error(
      "Clips are still processing. Use “Check if clips are ready” in a few minutes."
    );
  }

  async function autoPostAll(id: string) {
    const response = await authFetch(`${apiBase}/auto-publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: id })
    });

    const data = (await response.json()) as {
      ok?: boolean;
      results?: ClipPostResult[];
      posted?: number;
      failed?: number;
      message?: string;
    };

    if (data.results) {
      setPostResults(data.results);
    }

    if (!data.ok && (data.posted ?? 0) === 0) {
      throw new Error(data.message ?? "Auto-post to TikTok failed.");
    }

    if (data.message && (data.failed ?? 0) > 0) {
      setErrorMessage(data.message);
    }

    return data;
  }

  async function postExistingProject(id: string) {
    setProjectId(id);
    setPhase("posting");
    setErrorMessage("");
    setPostResults([]);
    rememberProjectId(id);

    const nextClips = await loadClips(id);
    setClips(nextClips);

    if (nextClips.length === 0) {
      throw new Error("No clips found for that project ID.");
    }

    if (!integration?.hasTikTokAccount) {
      const configResponse = await authFetch(`${apiBase}/config`);
      const configData = (await configResponse.json()) as IntegrationStatus;
      setIntegration(configData);

      if (!configData.hasTikTokAccount) {
        setPhase("ready");
        if (supportsTikTok) {
          throw new Error(
            `Clips loaded, but no TikTok account was found in ${providerLabel}.`
          );
        }
        return;
      }
    }

    await autoPostAll(id);
    setPhase("ready");
  }

  async function handleResumeExisting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const id = existingProjectId.trim();
    if (!id) return;

    try {
      await postExistingProject(id);
    } catch (error) {
      setPhase("error");
      setErrorMessage(
        error instanceof Error ? error.message : "Could not post existing clips."
      );
    }
  }

  async function handlePostReadyClips() {
    if (!projectId) return;

    setPhase("posting");
    setErrorMessage("");

    try {
      await autoPostAll(projectId);
      setPhase("ready");
    } catch (error) {
      setPhase("ready");
      setErrorMessage(
        error instanceof Error ? error.message : "Could not post clips."
      );
    }
  }

  async function startProject() {
    const topicList = topicKeywords
      .split(",")
      .map((keyword) => keyword.trim())
      .filter(Boolean);
    const clipDuration = Number(clipDurationSec) || undefined;

    if (sourceMode === "upload" && selectedFile) {
      const formData = new FormData();
      formData.append("file", selectedFile);

      if (provider === "opusclip") {
        formData.append("sourceLang", "auto");
        if (topicList.length > 0) {
          formData.append("topicKeywords", topicList.join(", "));
        }
        if (clipDuration) {
          formData.append("clipDurationSec", String(clipDuration));
        }
      } else if (provider === "supoclip") {
        if (topicList.length > 0) {
          formData.append("projectName", topicList.join(", "));
        }
      } else if (topicList.length > 0) {
        formData.append("projectName", topicList.join(", "));
      }

      const response = await authFetch(`${apiBase}/project`, {
        method: "POST",
        body: formData
      });

      return (await response.json()) as {
        ok?: boolean;
        projectId?: string;
        message?: string;
      };
    }

    const body =
      provider === "opusclip"
        ? {
            videoUrl: videoUrl.trim(),
            topicKeywords: topicList,
            clipDurationSec: clipDuration,
            sourceLang: "auto"
          }
        : provider === "supoclip"
          ? {
              videoUrl: videoUrl.trim(),
              projectName: topicList.join(", ") || undefined
            }
          : {
              videoUrl: videoUrl.trim(),
              projectName: topicList.join(", ") || undefined
            };

    const response = await authFetch(`${apiBase}/project`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    return (await response.json()) as {
      ok?: boolean;
      projectId?: string;
      message?: string;
    };
  }

  async function handleGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasSource) return;

    setPhase("submitting");
    setErrorMessage("");
    setClips([]);
    setPostResults([]);
    setProjectId("");

    try {
      const data = await startProject();

      if (!data.ok || !data.projectId) {
        throw new Error(data.message ?? "Could not start clipping.");
      }

      setProjectId(data.projectId);
      rememberProjectId(data.projectId);
      setPhase("processing");

      const nextClips = await pollClipsUntilReady(data.projectId);
      setClips(nextClips);

      if (nextClips.length === 0) {
        setPhase("processing");
        return;
      }

      const configResponse = await authFetch(`${apiBase}/config`);
      const configData = (await configResponse.json()) as IntegrationStatus;
      setIntegration(configData);

      if (!configData.hasTikTokAccount) {
        setPhase("ready");
        if (supportsTikTok) {
          setErrorMessage(
            `Clips are ready, but no TikTok account was found in ${providerLabel}.`
          );
        }
        return;
      }

      setPhase("posting");
      await autoPostAll(data.projectId);
      setPhase("ready");
    } catch (error) {
      setPhase((current) => (current === "processing" ? "error" : "ready"));
      setErrorMessage(
        error instanceof Error ? error.message : "Something went wrong."
      );
    }
  }

  async function handleCheckAgain() {
    if (!projectId) return;

    setPhase("processing");
    setErrorMessage("");

    try {
      const nextClips = await loadClips(projectId);
      setClips(nextClips);

      if (nextClips.length === 0) {
        setPhase("processing");
        return;
      }

      const configResponse = await authFetch(`${apiBase}/config`);
      const configData = (await configResponse.json()) as IntegrationStatus;
      setIntegration(configData);

      if (!configData.hasTikTokAccount) {
        setPhase("ready");
        return;
      }

      setPhase("posting");
      await autoPostAll(projectId);
      setPhase("ready");
    } catch (error) {
      setPhase("ready");
      setErrorMessage(
        error instanceof Error ? error.message : "Could not refresh clips."
      );
    }
  }

  function handleStartOver() {
    setVideoUrl("");
    setSelectedFile(null);
    resetRunState();
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setVideoUrl("");
    event.target.value = "";
  }

  function handleModeChange(mode: SourceMode) {
    setSourceMode(mode);
    setErrorMessage("");

    if (mode === "link") {
      setSelectedFile(null);
    } else {
      setVideoUrl("");
    }
  }

  const submittingLabel =
    sourceMode === "upload"
      ? `Uploading your video to ${providerLabel}…`
      : `Sending to ${providerLabel}…`;

  const envKey = PROVIDER_ENV_KEYS[provider];
  const runLabel = supportsTikTok
    ? `Run ${providerLabel} → TikTok`
    : `Run ${providerLabel}`;

  if (!siteUnlocked) {
    return (
      <main className="opus-page opus-page-auth">
        <form className="opus-auth" onSubmit={handleUnlockSite}>
          <h1>Password required</h1>
          <input
            className="opus-input"
            type="password"
            value={sitePassword}
            onChange={(event) => setSitePassword(event.target.value)}
            autoComplete="current-password"
            autoFocus
            aria-label="Password"
          />
          {passwordError ? <p className="opus-error">{passwordError}</p> : null}
          <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true">
            Continue
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="opus-page">
      <header className="opus-topbar">
        <div className="opus-brand">
          <span className="opus-logo">Clip Operator</span>
        </div>
        <nav className="opus-nav">
          <a href="/">Autopilot</a>
        </nav>
      </header>

      <section className="opus-intro">
        <h1>Compare clipping APIs side by side.</h1>
        <p>
          Pick OpusClip, WayinVideo, or self-hosted SupoClip, paste a link or
          upload a file, and compare the clip workflow side by side.
        </p>
      </section>

      <>
      <div className="opus-provider-toggle" role="tablist" aria-label="API provider">
        {PROVIDERS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={provider === entry.id}
            className={`opus-provider-tab ${provider === entry.id ? "active" : ""}`}
            onClick={() => handleProviderChange(entry.id)}
            disabled={isBusy}
          >
            <span className="opus-provider-head">
              <img
                src={`${basePath}${entry.logo}`}
                alt=""
                className="opus-provider-logo"
                width={28}
                height={28}
              />
              <span className="opus-provider-name">{entry.label}</span>
            </span>
            <span className="opus-provider-hint">{entry.hint}</span>
          </button>
        ))}
      </div>

      {!integration?.configured ? (
        <p className="opus-alert">
          {provider === "supoclip" ? (
            <>
              Start SupoClip with <code>pnpm supoclip</code>, create an account at{" "}
              <code>http://localhost:3107</code>, then add{" "}
              <code>SUPOCLIP_USER_ID</code> and <code>SUPOCLIP_AUTH_SECRET</code> to{" "}
              <code>.env.local</code>.
            </>
          ) : (
            <>
              Add {envKey} to <code>.env.local</code> and restart the dev server.
            </>
          )}
        </p>
      ) : null}
      {integration?.configured && supportsTikTok && !integration.hasTikTokAccount ? (
        <p className="opus-alert">
          Connect TikTok in your {providerLabel} dashboard to enable auto-posting.
        </p>
      ) : null}
      {integration?.tikTokAccountName ? (
        <p className="opus-hint">TikTok: @{integration.tikTokAccountName}</p>
      ) : null}

      <ol className="opus-steps opus-steps-4" aria-label="Progress">
        <li className={`opus-step ${activeStep >= 1 ? "active" : ""} ${activeStep > 1 ? "done" : ""}`}>
          <span className="opus-step-num">1</span>
          <span className="opus-step-label">Add video</span>
        </li>
        <li className={`opus-step ${activeStep >= 2 ? "active" : ""} ${activeStep > 2 ? "done" : ""}`}>
          <span className="opus-step-num">2</span>
          <span className="opus-step-label">Clip</span>
        </li>
        <li className={`opus-step ${activeStep >= 3 ? "active" : ""} ${activeStep > 3 ? "done" : ""}`}>
          <span className="opus-step-num">3</span>
          <span className="opus-step-label">Captions</span>
        </li>
        <li className={`opus-step ${activeStep >= 4 ? "active" : ""}`}>
          <span className="opus-step-num">4</span>
          <span className="opus-step-label">TikTok</span>
        </li>
      </ol>

      {errorMessage ? (
        <div className="opus-alert" role="alert">
          {errorMessage}
        </div>
      ) : null}

      {(phase === "idle" || phase === "error") && clips.length === 0 ? (
        <form className="opus-panel" onSubmit={handleGenerate}>
          <div className="opus-source-toggle" role="tablist" aria-label="Video source">
            <button
              type="button"
              role="tab"
              aria-selected={sourceMode === "link"}
              className={`opus-source-tab ${sourceMode === "link" ? "active" : ""}`}
              onClick={() => handleModeChange("link")}
            >
              Paste link
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={sourceMode === "upload"}
              className={`opus-source-tab ${sourceMode === "upload" ? "active" : ""}`}
              onClick={() => handleModeChange("upload")}
            >
              Upload file
            </button>
          </div>

          {sourceMode === "link" ? (
            <>
              <label className="opus-label" htmlFor="video-url">
                Video URL
              </label>
              <input
                id="video-url"
                className="opus-input opus-input-lg"
                value={videoUrl}
                onChange={(event) => setVideoUrl(event.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                autoFocus
              />
              <p className="opus-hint">YouTube, Vimeo, Dropbox, and other public links work.</p>
            </>
          ) : (
            <>
              <label className="opus-upload-zone">
                <input
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm,video/*"
                  onChange={handleFileChange}
                  hidden
                />
                <span className="opus-upload-title">
                  {selectedFile ? selectedFile.name : "Choose a video file"}
                </span>
                <span className="opus-upload-meta">
                  {selectedFile
                    ? formatFileSize(selectedFile.size)
                    : "MP4, MOV, or WebM"}
                </span>
              </label>
              {selectedFile ? (
                <button
                  type="button"
                  className="opus-advanced-toggle"
                  onClick={() => setSelectedFile(null)}
                >
                  Remove file
                </button>
              ) : null}
            </>
          )}

          <button
            type="button"
            className="opus-advanced-toggle"
            onClick={() => setShowAdvanced((value) => !value)}
            aria-expanded={showAdvanced}
          >
            {showAdvanced ? "Hide options" : "More options"}
          </button>

          {showAdvanced ? (
            <div className="opus-advanced">
              <label className="opus-label" htmlFor="topic-keywords">
                Focus topics <span className="opus-optional">optional</span>
              </label>
              <input
                id="topic-keywords"
                className="opus-input"
                value={topicKeywords}
                onChange={(event) => setTopicKeywords(event.target.value)}
                placeholder="launch, interview, product demo"
              />
              {provider === "opusclip" ? (
                <>
                  <label className="opus-label" htmlFor="clip-duration">
                    Max clip length (seconds)
                  </label>
                  <input
                    id="clip-duration"
                    className="opus-input opus-input-short"
                    value={clipDurationSec}
                    onChange={(event) => setClipDurationSec(event.target.value)}
                    inputMode="numeric"
                  />
                </>
              ) : provider === "supoclip" ? (
                <p className="opus-hint">
                  SupoClip runs locally via Docker. Clips render with subtitles in
                  fast mode by default.
                </p>
              ) : (
                <p className="opus-hint">
                  WayinVideo exports 9:16 clips with animated captions by default.
                </p>
              )}
            </div>
          ) : null}

          <button
            type="submit"
            className="opus-cta"
            disabled={!hasSource || !integration?.configured || isBusy}
          >
            {runLabel}
          </button>
        </form>
      ) : null}

      {(phase === "idle" || phase === "error") && clips.length === 0 ? (
        <form className="opus-panel opus-resume" onSubmit={handleResumeExisting}>
          <h3>Already have clips?</h3>
          <p className="opus-hint">
            Paste the API project ID from Clip Operator (shown while clipping) or a{" "}
            <code>prj06…</code> / <code>proj_…</code> id — not the <code>hmtask…</code> id
            from the WayinVideo website URL.
          </p>
          <label className="opus-label" htmlFor="existing-project-id">
            {provider === "wayinvideo" ? "API project ID or URL" : provider === "supoclip" ? "Task ID" : "Project ID"}
          </label>
          <input
            id="existing-project-id"
            className="opus-input"
            value={existingProjectId}
            onChange={(event) => setExistingProjectId(event.target.value)}
            placeholder={
              provider === "wayinvideo"
                ? "prj06… or paste wayin.ai/wayinvideo/video/… URL"
                : provider === "supoclip"
                  ? "SupoClip task UUID"
                  : "P0000000..."
            }
          />
          <p className="opus-hint">
            {provider === "wayinvideo" ? (
              <>
                Website library links use <code>hmtask…</code> ids and cannot be loaded via
                the API. If you clipped here before, this field may already have your saved{" "}
                <code>prj06…</code> id. Or post from the{" "}
                <a href="https://wayin.ai/wayinvideo" target="_blank" rel="noreferrer">
                  WayinVideo website
                </a>{" "}
                directly.
              </>
            ) : provider === "supoclip" ? (
              <>
                Paste the SupoClip task ID returned by Clip Operator or from{" "}
                <a href="http://localhost:3107" target="_blank" rel="noreferrer">
                  the SupoClip UI
                </a>
                .
              </>
            ) : (
              "Find it in your OpusClip dashboard project URL."
            )}
          </p>
          <button
            type="submit"
            className="opus-secondary"
            disabled={!existingProjectId.trim() || !integration?.configured || isBusy}
          >
            {supportsTikTok ? "Post existing clips to TikTok" : "Load existing clips"}
          </button>
        </form>
      ) : null}

      {phase === "submitting" || phase === "processing" || phase === "posting" ? (
        <div className="opus-panel opus-processing">
          <div className="opus-spinner" aria-hidden="true" />
          <h2>
            {phase === "submitting"
              ? submittingLabel
              : phase === "processing"
                ? `${providerLabel} is clipping your video…`
                : `Posting ${clips.length} clip${clips.length === 1 ? "" : "s"} to TikTok…`}
          </h2>
          <p>
            {phase === "posting"
              ? "Generating captions and queueing each clip."
              : provider === "wayinvideo"
                ? "WayinVideo finds viral moments, reframes to vertical, and renders captioned clips."
                : provider === "supoclip"
                  ? "SupoClip transcribes locally, scores moments, and renders vertical clips with subtitles."
                  : "OpusClip transcribes the video, finds viral moments, and renders vertical clips with captions."}
          </p>
          {projectId && phase !== "submitting" ? (
            <p className="opus-hint">Project: {projectId}</p>
          ) : null}
          {projectId && phase === "processing" ? (
            <button type="button" className="opus-secondary" onClick={() => void handleCheckAgain()}>
              Check if clips are ready
            </button>
          ) : null}
        </div>
      ) : null}

      {phase === "ready" && clips.length > 0 ? (
        <div className="opus-results">
          <div className="opus-results-head">
            <div>
              <h2>
                {postedCount > 0
                  ? `${postedCount} of ${clips.length} posted via ${providerLabel}`
                  : `${clips.length} clip${clips.length === 1 ? "" : "s"} from ${providerLabel}`}
              </h2>
              <p className="opus-hint">
                {postedCount > 0
                  ? "Posts are queued. Check TikTok in a few minutes."
                  : "Preview your clips below."}
              </p>
            </div>
            <div className="opus-results-actions">
              {postedCount === 0 && integration?.hasTikTokAccount ? (
                <button
                  type="button"
                  className="opus-cta opus-cta-sm"
                  onClick={() => void handlePostReadyClips()}
                >
                  Post all to TikTok
                </button>
              ) : null}
              <button type="button" className="opus-secondary" onClick={handleStartOver}>
                New run
              </button>
            </div>
          </div>

          <div className="opus-clips">
            {clips.map((clip) => {
              const duration = formatDuration(clip.durationSec);
              const postResult = postResults.find(
                (result) => result.clipId === clip.clipId
              );

              return (
                <article key={clip.id} className="opus-clip">
                  <div className="opus-clip-body">
                    <h3>{clip.title ?? "Untitled clip"}</h3>
                    {duration ? <p className="opus-clip-meta">{duration}</p> : null}
                    {typeof clip.score === "number" ? (
                      <p className="opus-clip-meta">Score: {clip.score}</p>
                    ) : null}
                    {postResult ? (
                      <p className={`opus-clip-meta ${postResult.ok ? "ok" : "bad"}`}>
                        {postResult.message}
                      </p>
                    ) : null}
                  </div>
                  <div className="opus-clip-actions">
                    {clip.previewUrl ? (
                      <a
                        className="opus-cta opus-cta-sm"
                        href={clip.previewUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Preview
                      </a>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      ) : null}
      </>
    </main>
  );
}
