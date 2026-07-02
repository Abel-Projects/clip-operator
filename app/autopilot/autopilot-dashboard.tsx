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
import { formatRelative, humanizeNiche, providerLabel } from "@/lib/format";

type Summary = {
  pendingCampaigns: number;
  queuedPosts: number;
  postedToday: number;
  nextPostAt: string | null;
};

type Settings = {
  niche: string;
  clip_provider: string;
  max_clips_per_source: number;
  posts_per_day: number;
  min_hours_between_posts: number;
  sources_per_day: number;
  max_source_duration_min: number;
  enabled: boolean;
};

export default function AutopilotDashboard() {
  const [siteUnlocked, setSiteUnlocked] = useState(false);
  const [sitePassword, setSitePassword] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const [sourceUrl, setSourceUrl] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [monitorPosts, setMonitorPosts] = useState<MonitorPost[]>([]);
  const [monitorSummary, setMonitorSummary] = useState<MonitorSummary | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [clearingFailed, setClearingFailed] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const loadDashboard = useCallback(async () => {
    const [campaignRes, settingsRes, monitorRes] = await Promise.all([
      authFetch("/api/autopilot/campaigns"),
      authFetch("/api/autopilot/settings"),
      authFetch("/api/autopilot/monitor")
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
      summary?: Summary;
      message?: string;
    };

    const settingsData = (await settingsRes.json()) as {
      ok?: boolean;
      settings?: Settings;
    };

    const monitorData = (await monitorRes.json()) as {
      ok?: boolean;
      posts?: MonitorPost[];
      summary?: MonitorSummary;
    };

    if (!campaignData.ok) {
      throw new Error(campaignData.message ?? "Could not load autopilot.");
    }

    setSummary(campaignData.summary ?? null);
    setMonitorPosts(monitorData.posts ?? []);
    setMonitorSummary(monitorData.summary ?? null);

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
    if (data.settings) {
      setSettings(data.settings);
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

      if (!data.ok) {
        throw new Error(data.message ?? "Could not clear failed items.");
      }

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
  const nicheLabel = humanizeNiche(settings?.niche);
  const engine = providerLabel(settings?.clip_provider);
  const postedToday = summary?.postedToday ?? 0;
  const queued = summary?.queuedPosts ?? 0;
  const inPipeline = summary?.pendingCampaigns ?? 0;
  const nextPost = summary?.nextPostAt ? formatRelative(summary.nextPostAt) : null;

  return (
    <SiteShell subtitle={nicheLabel} wide>
      {errorMessage ? (
        <div className="opus-alert" role="alert">
          {errorMessage}
        </div>
      ) : null}
      {successMessage ? <p className="opus-hint">{successMessage}</p> : null}

      <section className={`opus-panel opus-status ${running ? "on" : "off"}`}>
        <div className="opus-status-main">
          <span className={`opus-status-dot ${running ? "on" : "off"}`} aria-hidden="true" />
          <div>
            <h1 className="opus-status-headline">
              {running ? "Autopilot is running." : "Autopilot is paused."}
            </h1>
            <p className="opus-status-sub">
              {running ? (
                <>
                  {nextPost ? <>Next post {nextPost} · </> : null}
                  {postedToday} posted today · {queued} queued
                </>
              ) : (
                <>Nothing is being posted. Turn it on to grow {nicheLabel} on TikTok.</>
              )}
            </p>
          </div>
        </div>
        <button
          type="button"
          className={running ? "opus-secondary" : "opus-cta"}
          onClick={toggleAutopilot}
          disabled={!settings}
        >
          {running ? "Pause" : "Turn on"}
        </button>
      </section>

      <section className="opus-pipeline" aria-label="Pipeline">
        <div className="opus-stage">
          <span className="opus-stage-icon">🔎</span>
          <strong>Discover</strong>
          <span className="opus-hint">YouTube · {settings?.sources_per_day ?? 4}/day</span>
        </div>
        <span className="opus-stage-arrow" aria-hidden="true">→</span>
        <div className="opus-stage">
          <span className="opus-stage-icon">✂️</span>
          <strong>Clip</strong>
          <span className="opus-hint">{engine} · {settings?.max_clips_per_source ?? 4}/video</span>
        </div>
        <span className="opus-stage-arrow" aria-hidden="true">→</span>
        <div className="opus-stage">
          <span className="opus-stage-icon">💬</span>
          <strong>Caption</strong>
          <span className="opus-hint">Auto</span>
        </div>
        <span className="opus-stage-arrow" aria-hidden="true">→</span>
        <div className="opus-stage">
          <span className="opus-stage-icon">📲</span>
          <strong>Post</strong>
          <span className="opus-hint">TikTok · {postedToday} today</span>
        </div>
      </section>

      <section className="opus-panel opus-addnow">
        <div>
          <h3>Add a video now</h3>
          <p className="opus-hint">
            Paste a YouTube link to jump the queue{inPipeline > 0 ? ` (${inPipeline} in pipeline)` : ""}.
          </p>
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
