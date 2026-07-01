"use client";

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
  provider_project_id: string | null;
  status: CampaignStatus;
  error_message: string | null;
  created_at: string;
};

type Summary = {
  pendingCampaigns: number;
  queuedPosts: number;
  postedToday: number;
  nextPostAt: string | null;
};

function formatPostInterval(hours: number): string {
  if (hours < 1) {
    const minutes = Math.round(hours * 60);
    return `${minutes}m`;
  }
  if (Number.isInteger(hours)) {
    return `${hours}h`;
  }
  return `${Math.round(hours * 60)}m`;
}

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

function formatWhen(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function statusLabel(status: CampaignStatus) {
  switch (status) {
    case "pending":
      return "Queued";
    case "clipping":
      return "Clipping";
    case "scheduling":
      return "Scheduling";
    case "active":
      return "Posting";
    case "done":
      return "Done";
    case "failed":
      return "Failed";
  }
}

function providerLabel(provider: string) {
  return provider === "supoclip" ? "SupoClip" : "WayinVideo";
}

export default function AutopilotDashboard() {
  const [siteUnlocked, setSiteUnlocked] = useState(false);
  const [sitePassword, setSitePassword] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const [sourceUrl, setSourceUrl] = useState("");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
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
      campaigns?: Campaign[];
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

    setCampaigns(campaignData.campaigns ?? []);
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
      setSuccessMessage("Queued manually — autopilot will clip and schedule posts.");
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

  return (
    <SiteShell mode="autopilot" wide>
      <section className="opus-intro">
        <h1>Shark Tank entrepreneurs on autopilot.</h1>
        <p>
          Discovers interview-style business videos (≤{settings?.max_source_duration_min ?? 20}{" "}
          min), clips with {providerLabel(settings?.clip_provider ?? "wayinvideo")}, and posts
          to TikTok about every{" "}
          {formatPostInterval(settings?.min_hours_between_posts ?? 1 / 3)} (up to 3/hour) — up to{" "}
          {settings?.sources_per_day ?? 4} new sources per day.
        </p>
      </section>

      {errorMessage ? (
        <div className="opus-alert" role="alert">
          {errorMessage}
        </div>
      ) : null}
      {successMessage ? <p className="opus-hint">{successMessage}</p> : null}

      <div className="opus-stats">
        <div className="opus-stat">
          <span className="opus-stat-label">In pipeline</span>
          <strong>{summary?.pendingCampaigns ?? 0}</strong>
        </div>
        <div className="opus-stat">
          <span className="opus-stat-label">Queued posts</span>
          <strong>{summary?.queuedPosts ?? 0}</strong>
        </div>
        <div className="opus-stat">
          <span className="opus-stat-label">Posted today</span>
          <strong>{summary?.postedToday ?? 0}</strong>
        </div>
        <div className="opus-stat">
          <span className="opus-stat-label">Next post</span>
          <strong className="opus-stat-compact">{formatWhen(summary?.nextPostAt ?? null)}</strong>
        </div>
      </div>

      <div className="opus-panel opus-resume">
        <div className="opus-row">
          <div>
            <h3>Autopilot {settings?.enabled ? "ON" : "PAUSED"}</h3>
            <p className="opus-hint">
              Provider: {providerLabel(settings?.clip_provider ?? "wayinvideo")} · Up to{" "}
              {settings?.max_clips_per_source ?? 4} clips per source · Failed items auto-clear
              after 7 days
            </p>
          </div>
          <button type="button" className="opus-secondary" onClick={toggleAutopilot}>
            {settings?.enabled ? "Pause" : "Resume"}
          </button>
        </div>
      </div>

      <details className="opus-panel">
        <summary className="opus-advanced-toggle">Manual override (optional)</summary>
        <form className="opus-input-row" onSubmit={handleSubmit} style={{ marginTop: "1rem" }}>
          <input
            className="opus-input opus-input-lg"
            value={sourceUrl}
            onChange={(event) => setSourceUrl(event.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            disabled={submitting || settings?.enabled === false}
          />
          <button
            type="submit"
            className="opus-cta"
            disabled={!sourceUrl.trim() || submitting || settings?.enabled === false}
          >
            {submitting ? "Queuing…" : "Queue URL"}
          </button>
        </form>
      </details>

      <MonitorSection
        posts={monitorPosts}
        summary={monitorSummary}
        loading={loading}
        onClearFailed={handleClearFailed}
        clearingFailed={clearingFailed}
      />

      {campaigns.length > 0 ? (
        <section className="opus-panel">
          <h3>Recent sources</h3>
          <ul className="opus-campaign-list">
            {campaigns.slice(0, 8).map((campaign) => (
              <li key={campaign.id} className="opus-campaign-item">
                <div>
                  <strong>
                    {statusLabel(campaign.status)} · {providerLabel(campaign.clip_provider)}
                  </strong>
                  <p className="opus-hint opus-campaign-url">{campaign.source_url}</p>
                  {campaign.error_message ? (
                    <p className="opus-error">{campaign.error_message}</p>
                  ) : null}
                </div>
                <span className="opus-hint">{formatWhen(campaign.created_at)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </SiteShell>
  );
}
