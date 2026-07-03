"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import MonitorSection, {
  type MonitorPost,
  type MonitorSummary
} from "@/app/components/monitor-section";
import PasswordGate from "@/app/components/password-gate";
import SiteShell from "@/app/components/site-shell";
import {
  authFetch,
  clearSitePassword,
  getStoredSitePassword,
  storeSitePassword
} from "@/lib/client-auth";
import { formatRelative, providerLabel, youtubeThumbnail } from "@/lib/format";

type Summary = {
  pendingCampaigns: number;
  queuedPosts: number;
  postedToday: number;
  nextPostAt: string | null;
};

type CampaignStatus =
  | "pending"
  | "clipping"
  | "scheduling"
  | "active"
  | "done"
  | "failed";

type Campaign = {
  id: string;
  source_url: string;
  clip_provider: string;
  status: CampaignStatus;
  error_message: string | null;
  created_at: string;
};

type Settings = {
  niche: string;
  clip_provider: string;
  max_clips_per_source: number;
  posts_per_day: number;
  min_hours_between_posts: number;
  sources_per_day: number;
  enabled: boolean;
};

type Health = {
  clipProvider: string;
  supoclipReachable: boolean;
  publisherLastSeenAt: string | null;
  publisherOnline: boolean;
};

type Suggestion = {
  id: string;
  url: string;
  title: string | null;
  channel_title: string | null;
  duration_sec: number | null;
  thumbnail_url: string | null;
};

type ProcessingSnapshot = {
  clipJob: {
    id: string;
    source_url: string;
    status: string;
    clip_provider: string;
    provider_project_id: string | null;
    error_message: string | null;
  } | null;
  supoclip: {
    status: string;
    processing: boolean;
    clipCount: number;
    progressMessage: string | null;
  } | null;
  publishing: {
    activeCampaigns: number;
    queuedPosts: number;
  };
};

const CLIP_PIPELINE_STATUSES: CampaignStatus[] = ["pending", "clipping", "scheduling"];

function processingLabel(status: CampaignStatus, supoclip?: ProcessingSnapshot["supoclip"]): string {
  if (status === "clipping" && supoclip?.progressMessage) {
    return supoclip.progressMessage;
  }
  if (status === "clipping" && supoclip) {
    if (supoclip.processing) {
      return `SupoClip is working (${supoclip.status})…`;
    }
    if (supoclip.clipCount > 0) {
      return `SupoClip finished — ${supoclip.clipCount} clip(s) ready`;
    }
  }

  switch (status) {
    case "pending":
      return "Waiting to start in SupoClip";
    case "clipping":
      return "Clipping in SupoClip…";
    case "scheduling":
      return "Scheduling TikTok posts…";
    default:
      return status;
  }
}

export default function AutopilotDashboard() {
  const [siteUnlocked, setSiteUnlocked] = useState(false);
  const [sitePassword, setSitePassword] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const [sourceUrl, setSourceUrl] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [monitorPosts, setMonitorPosts] = useState<MonitorPost[]>([]);
  const [monitorSummary, setMonitorSummary] = useState<MonitorSummary | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [processingSnapshot, setProcessingSnapshot] = useState<ProcessingSnapshot | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [votingId, setVotingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [clearingFailed, setClearingFailed] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const loadDashboard = useCallback(async () => {
    const [campaignRes, settingsRes, monitorRes, healthRes, suggestRes, processingRes] =
      await Promise.all([
      authFetch("/api/autopilot/campaigns"),
      authFetch("/api/autopilot/settings"),
      authFetch("/api/autopilot/monitor"),
      authFetch("/api/autopilot/health"),
      authFetch("/api/autopilot/suggestions"),
      authFetch("/api/autopilot/processing")
    ]);

    if (
      campaignRes.status === 401 ||
      settingsRes.status === 401 ||
      monitorRes.status === 401
    ) {
      setSiteUnlocked(false);
      return;
    }

    setSiteUnlocked(true);

    const campaignData = (await campaignRes.json()) as {
      ok?: boolean;
      campaigns?: Campaign[];
      summary?: Summary;
      message?: string;
    };
    const settingsData = (await settingsRes.json()) as { settings?: Settings };
    const monitorData = (await monitorRes.json()) as {
      posts?: MonitorPost[];
      summary?: MonitorSummary;
    };
    const healthData = (await healthRes.json().catch(() => ({}))) as { health?: Health };
    const suggestData = (await suggestRes.json().catch(() => ({}))) as {
      suggestions?: Suggestion[];
    };
    const processingData = (await processingRes.json().catch(() => ({}))) as {
      processing?: ProcessingSnapshot;
    };

    if (!campaignData.ok) {
      throw new Error(campaignData.message ?? "Could not load autopilot.");
    }

    setCampaigns(campaignData.campaigns ?? []);
    setSummary(campaignData.summary ?? null);
    setMonitorPosts(monitorData.posts ?? []);
    setMonitorSummary(monitorData.summary ?? null);
    setHealth(healthData.health ?? null);
    setSuggestions(suggestData.suggestions ?? []);
    setProcessingSnapshot(processingData.processing ?? null);

    if (settingsData.settings) {
      setSettings(settingsData.settings);
    }
  }, []);

  useEffect(() => {
    if (getStoredSitePassword()) {
      void loadDashboard()
        .catch((error) =>
          setErrorMessage(error instanceof Error ? error.message : "Load failed.")
        )
        .finally(() => setLoading(false));
      return;
    }

    void loadDashboard()
      .catch(() => setSiteUnlocked(false))
      .finally(() => setLoading(false));
  }, [loadDashboard]);

  useEffect(() => {
    if (!siteUnlocked) return;
    const interval = setInterval(() => {
      void loadDashboard().catch(() => undefined);
    }, 20_000);
    return () => clearInterval(interval);
  }, [siteUnlocked, loadDashboard]);

  async function handleUnlockSite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError("");
    const password = sitePassword.trim();
    if (!password) return;

    storeSitePassword(password);
    const response = await authFetch("/api/autopilot/settings");
    if (response.status === 401) {
      clearSitePassword();
      setPasswordError("Wrong password.");
      return;
    }

    setSiteUnlocked(true);
    setSitePassword("");
    await loadDashboard();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response = await authFetch("/api/autopilot/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceUrl: sourceUrl.trim() })
      });

      const data = (await response.json()) as { ok?: boolean; message?: string };
      if (!data.ok) {
        throw new Error(data.message ?? "Could not queue video.");
      }

      setSourceUrl("");
      setSuccessMessage("Added — it'll be clipped, captioned, and scheduled to TikTok.");
      await loadDashboard();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Submit failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleAutopilot() {
    if (!settings) return;
    const response = await authFetch("/api/autopilot/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !settings.enabled })
    });
    const data = (await response.json()) as { settings?: Settings };
    if (data.settings) setSettings(data.settings);
  }

  async function voteSuggestion(id: string, vote: "up" | "down") {
    setVotingId(id);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const response = await authFetch("/api/autopilot/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, vote })
      });
      const data = (await response.json()) as { ok?: boolean; message?: string };
      if (!data.ok) throw new Error(data.message ?? "Vote failed.");
      setSuggestions((prev) => prev.filter((s) => s.id !== id));
      if (vote === "up") setSuccessMessage(data.message ?? "Approved.");
      await loadDashboard();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Vote failed.");
    } finally {
      setVotingId(null);
    }
  }

  async function handleClearFailed() {
    if (!window.confirm("Delete all failed posts and failed campaigns from the monitor?")) {
      return;
    }
    setClearingFailed(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const response = await authFetch("/api/autopilot/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true })
      });
      const data = (await response.json()) as {
        ok?: boolean;
        postsDeleted?: number;
        campaignsDeleted?: number;
        message?: string;
      };
      if (!data.ok) throw new Error(data.message ?? "Could not clear failed items.");
      setSuccessMessage(
        `Cleared ${data.postsDeleted ?? 0} failed post(s) and ${data.campaignsDeleted ?? 0} failed campaign(s).`
      );
      await loadDashboard();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Clear failed.");
    } finally {
      setClearingFailed(false);
    }
  }

  if (!siteUnlocked) {
    return (
      <PasswordGate
        password={sitePassword}
        error={passwordError}
        onPasswordChange={setSitePassword}
        onSubmit={handleUnlockSite}
      />
    );
  }

  const running = settings?.enabled ?? false;
  const engine = providerLabel(settings?.clip_provider);
  const postedToday = summary?.postedToday ?? 0;
  const queued = summary?.queuedPosts ?? 0;
  const nextPost = summary?.nextPostAt ? formatRelative(summary.nextPostAt) : null;
  const isSupoclip = (settings?.clip_provider ?? "supoclip") === "supoclip";
  const clipHealthy = !isSupoclip || (health?.supoclipReachable ?? false);
  const postHealthy = !isSupoclip || (health?.publisherOnline ?? false);
  const homeServerDown = running && isSupoclip && health != null && (!clipHealthy || !postHealthy);

  const clipJob = processingSnapshot?.clipJob ?? null;
  const clipProcessing =
    clipJob && CLIP_PIPELINE_STATUSES.includes(clipJob.status as CampaignStatus)
      ? clipJob
      : null;
  const processingThumb = clipProcessing ? youtubeThumbnail(clipProcessing.source_url) : null;
  const publishing = processingSnapshot?.publishing ?? { activeCampaigns: 0, queuedPosts: 0 };

  return (
    <SiteShell wide>
      {errorMessage ? (
        <div className="opus-alert" role="alert">
          {errorMessage}
        </div>
      ) : null}
      {successMessage ? <p className="opus-hint">{successMessage}</p> : null}

      {homeServerDown ? (
        <div className="opus-alert" role="alert">
          Home server offline —{" "}
          {!clipHealthy ? "SupoClip isn't reachable" : null}
          {!clipHealthy && !postHealthy ? " and " : null}
          {!postHealthy ? (
            <>
              the TikTok publisher hasn&apos;t checked in
              {health?.publisherLastSeenAt
                ? ` (last seen ${formatRelative(health.publisherLastSeenAt)})`
                : ""}
            </>
          ) : null}
          . Posting is paused until it&apos;s back.
        </div>
      ) : null}

      {/* Hero: big posted-today counter + on/off */}
      <section className={`opus-hero-status ${running ? "on" : "off"}`}>
        <div className="opus-counter">
          <span className="opus-counter-num">{postedToday}</span>
          <span className="opus-counter-label">TikToks posted today</span>
          <span className="opus-counter-sub">
            {queued} queued{nextPost ? ` · next ${nextPost}` : ""}
            {isSupoclip ? (
              <>
                {" · "}
                <span className={`opus-health-dot ${postHealthy ? "on" : "off"}`} />{" "}
                publisher {postHealthy ? "online" : "offline"}
              </>
            ) : null}
          </span>
        </div>
        <div className="opus-hero-toggle">
          <span className={`opus-status-dot ${running ? "on" : "off"}`} aria-hidden="true" />
          <span className="opus-hero-state">{running ? "Running" : "Paused"}</span>
          <button
            type="button"
            className={running ? "opus-secondary" : "opus-cta"}
            onClick={toggleAutopilot}
            disabled={!settings}
          >
            {running ? "Pause" : "Turn on"}
          </button>
        </div>
      </section>

      {/* SupoClip pipeline — only shows work actually in SupoClip, not TikTok publishing */}
      <section className="opus-panel">
        <div className="opus-section-head">
          <div>
            <h2>SupoClip</h2>
            <p className="opus-hint">Live clip pipeline — matches what SupoClip is working on.</p>
          </div>
        </div>
        {clipProcessing ? (
          <div className="opus-processing-card">
            <div className="opus-processing-thumb">
              {processingThumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={processingThumb} alt="" />
              ) : (
                <div className="opus-processing-thumb-fallback">▶</div>
              )}
              <span className="opus-processing-badge">
                {clipProcessing.status === "clipping" ? "Clipping" : "Queued"}
              </span>
            </div>
            <div className="opus-processing-info">
              <h3>
                {processingLabel(
                  clipProcessing.status as CampaignStatus,
                  processingSnapshot?.supoclip
                )}
              </h3>
              <p className="opus-hint">
                {providerLabel(clipProcessing.clip_provider)} · up to{" "}
                {settings?.max_clips_per_source ?? 4} clips
                {processingSnapshot?.supoclip?.status
                  ? ` · task ${processingSnapshot.supoclip.status}`
                  : ""}
              </p>
              <div className="opus-processing-links">
                <a
                  href={clipProcessing.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="opus-textlink"
                >
                  View source video ↗
                </a>
                <Link href="/supoclip" className="opus-textlink">
                  Open SupoClip ↗
                </Link>
              </div>
              {clipProcessing.error_message ? (
                <p className="opus-error">{clipProcessing.error_message}</p>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="opus-processing-empty opus-processing-idle">
            <p className="opus-processing-idle-title">SupoClip is idle</p>
            <p className="opus-hint">
              {running
                ? "No videos are clipping right now. Upvote a recommendation below or paste a YouTube link."
                : "Autopilot is paused. Turn it on or add a video below."}
            </p>
            {publishing.queuedPosts > 0 ? (
              <p className="opus-hint">
                TikTok publisher has {publishing.queuedPosts} clip
                {publishing.queuedPosts === 1 ? "" : "s"} queued from{" "}
                {publishing.activeCampaigns} finished source
                {publishing.activeCampaigns === 1 ? "" : "s"}.
              </p>
            ) : null}
            <Link href="/supoclip" className="opus-textlink">
              Open SupoClip editor →
            </Link>
          </div>
        )}
      </section>

      {/* Add a video now */}
      <section className="opus-panel opus-addnow">
        <div>
          <h3>Add a video now</h3>
          <p className="opus-hint">Paste a YouTube link to jump the queue.</p>
        </div>
        <form className="opus-input-row" onSubmit={handleSubmit}>
          <input
            className="opus-input opus-input-lg"
            value={sourceUrl}
            onChange={(event) => setSourceUrl(event.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            disabled={submitting}
          />
          <button type="submit" className="opus-cta" disabled={!sourceUrl.trim() || submitting}>
            {submitting ? "Adding…" : "Clip it"}
          </button>
        </form>
        <div className="opus-addnow-links">
          <Link href="/workbench" className="opus-textlink">
            Manual upload &amp; options →
          </Link>
          <Link href="/supoclip" className="opus-textlink">
            Open SupoClip editor →
          </Link>
        </div>
      </section>

      {/* Suggestion vote queue — always visible so you know where to curate */}
      <section className="opus-panel opus-suggest-panel">
        <div className="opus-section-head">
          <div>
            <h2>Up next — you decide</h2>
            <p className="opus-hint">
              New finds auto-clip and post. Downvote anything you don&apos;t want — it won&apos;t
              come back.
            </p>
          </div>
        </div>
        {suggestions.length > 0 ? (
          <div className="opus-suggest-grid">
            {suggestions.map((s) => (
              <article key={s.id} className="opus-suggest-card">
                <a href={s.url} target="_blank" rel="noreferrer" className="opus-suggest-thumb">
                  {s.thumbnail_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.thumbnail_url} alt="" />
                  ) : (
                    <div className="opus-processing-thumb-fallback">▶</div>
                  )}
                </a>
                <div className="opus-suggest-body">
                  <p className="opus-suggest-title">{s.title ?? s.url}</p>
                  {s.channel_title ? (
                    <p className="opus-hint">
                      {s.channel_title}
                      {s.duration_sec ? ` · ${Math.round(s.duration_sec / 60)}m` : ""}
                    </p>
                  ) : null}
                  <div className="opus-vote-row">
                    <button
                      type="button"
                      className="opus-vote up"
                      onClick={() => voteSuggestion(s.id, "up")}
                      disabled={votingId === s.id}
                      aria-label="Upvote"
                    >
                      ▲ Clip it
                    </button>
                    <button
                      type="button"
                      className="opus-vote down"
                      onClick={() => voteSuggestion(s.id, "down")}
                      disabled={votingId === s.id}
                      aria-label="Downvote"
                    >
                      ▼ Skip
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="opus-suggest-empty">
            <div className="opus-suggest-empty-icon" aria-hidden="true">
              ▶
            </div>
            <p className="opus-suggest-empty-title">No recommendations yet</p>
            <p className="opus-hint">
              Discovery runs every few minutes and looks for 15–30 minute interviews. Check back
              shortly, or paste a YouTube link above.
            </p>
          </div>
        )}
      </section>

      <MonitorSection
        posts={monitorPosts}
        summary={monitorSummary}
        loading={loading}
        onClearFailed={handleClearFailed}
        clearingFailed={clearingFailed}
      />
    </SiteShell>
  );
}
