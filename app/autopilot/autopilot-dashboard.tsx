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
  opus_project_id: string | null;
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

type Settings = {
  max_clips_per_source: number;
  posts_per_day: number;
  min_hours_between_posts: number;
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
      setSuccessMessage("Queued — clipping and scheduling run in the background.");
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
        <h1>Paste a YouTube link. Autopilot handles the rest.</h1>
        <p>
          OpusClip finds clips, schedules TikTok posts ({settings?.posts_per_day ?? 4}/day
          max, {settings?.min_hours_between_posts ?? 3}h apart).
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

      <form className="opus-panel" onSubmit={handleSubmit}>
        <label className="opus-label" htmlFor="source-url">
          YouTube URL
        </label>
        <div className="opus-input-row">
          <input
            id="source-url"
            className="opus-input opus-input-lg"
            value={sourceUrl}
            onChange={(event) => setSourceUrl(event.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            autoFocus
            disabled={submitting || settings?.enabled === false}
          />
          <button
            type="submit"
            className="opus-cta"
            disabled={!sourceUrl.trim() || submitting || settings?.enabled === false}
          >
            {submitting ? "Queuing…" : "Queue"}
          </button>
        </div>
      </form>

      <div className="opus-panel opus-resume">
        <div className="opus-row">
          <div>
            <h3>Autopilot {settings?.enabled ? "ON" : "PAUSED"}</h3>
            <p className="opus-hint">
              Up to {settings?.max_clips_per_source ?? 4} clips per video
            </p>
          </div>
          <button type="button" className="opus-secondary" onClick={toggleAutopilot}>
            {settings?.enabled ? "Pause" : "Resume"}
          </button>
        </div>
      </div>

      <MonitorSection
        posts={monitorPosts}
        summary={monitorSummary}
        loading={loading}
      />

      {campaigns.length > 0 ? (
        <section className="opus-panel">
          <h3>Recent sources</h3>
          <ul className="opus-campaign-list">
            {campaigns.slice(0, 5).map((campaign) => (
              <li key={campaign.id} className="opus-campaign-item">
                <div>
                  <strong>{statusLabel(campaign.status)}</strong>
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
