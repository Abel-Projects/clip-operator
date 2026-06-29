"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  authFetch,
  clearSitePassword,
  getStoredSitePassword,
  storeSitePassword
} from "@/lib/client-auth";

type PostStatus = "queued" | "posting" | "posted" | "failed";

type MonitorPost = {
  id: string;
  status: PostStatus;
  scheduledAt: string;
  postedAt: string | null;
  captionTitle: string | null;
  errorMessage: string | null;
  opusClipId: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  metricsSyncedAt: string | null;
  clip: {
    title: string | null;
    score: number | null;
    durationSec: number | null;
    previewUrl: string | null;
    rank: number;
  } | null;
  campaign: {
    sourceUrl: string;
    status: string;
  } | null;
};

type MonitorSummary = {
  totalPosts: number;
  posted: number;
  queued: number;
  failed: number;
  avgClipScore: number | null;
  metricsPending: number;
};

function formatWhen(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function formatDuration(seconds: number | null | undefined) {
  if (!seconds) return "—";
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

function formatMetric(value: number | null) {
  return value == null ? "—" : value.toLocaleString();
}

function statusClass(status: PostStatus) {
  switch (status) {
    case "posted":
      return "ok";
    case "failed":
      return "bad";
    case "posting":
      return "active";
    default:
      return "";
  }
}

export default function MonitorDashboard() {
  const [siteUnlocked, setSiteUnlocked] = useState(false);
  const [sitePassword, setSitePassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [posts, setPosts] = useState<MonitorPost[]>([]);
  const [summary, setSummary] = useState<MonitorSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [filter, setFilter] = useState<"all" | PostStatus>("all");

  const loadMonitor = useCallback(async () => {
    const response = await authFetch("/api/autopilot/monitor");

    if (response.status === 401) {
      setSiteUnlocked(false);
      return;
    }

    setSiteUnlocked(true);

    const data = (await response.json()) as {
      ok?: boolean;
      posts?: MonitorPost[];
      summary?: MonitorSummary;
      message?: string;
    };

    if (!data.ok) {
      throw new Error(data.message ?? "Could not load monitor.");
    }

    setPosts(data.posts ?? []);
    setSummary(data.summary ?? null);
  }, []);

  useEffect(() => {
    if (getStoredSitePassword()) {
      void loadMonitor()
        .catch((error) =>
          setErrorMessage(error instanceof Error ? error.message : "Load failed.")
        )
        .finally(() => setLoading(false));
      return;
    }

    void loadMonitor()
      .catch(() => setSiteUnlocked(false))
      .finally(() => setLoading(false));
  }, [loadMonitor]);

  useEffect(() => {
    if (!siteUnlocked) return;

    const interval = setInterval(() => {
      void loadMonitor().catch(() => undefined);
    }, 30_000);

    return () => clearInterval(interval);
  }, [siteUnlocked, loadMonitor]);

  async function handleUnlockSite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError("");

    const password = sitePassword.trim();
    if (!password) return;

    storeSitePassword(password);
    const response = await authFetch("/api/autopilot/monitor");
    if (response.status === 401) {
      clearSitePassword();
      setPasswordError("Wrong password.");
      return;
    }

    setSiteUnlocked(true);
    setSitePassword("");
    await loadMonitor();
  }

  const visiblePosts =
    filter === "all" ? posts : posts.filter((post) => post.status === filter);

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
    <main className="opus-page opus-page-wide">
      <header className="opus-topbar">
        <div className="opus-brand">
          <span className="opus-logo">Clip Operator</span>
          <span className="opus-tag">Monitor</span>
        </div>
        <nav className="opus-nav">
          <a href="/">Autopilot</a>
          <a href="/workbench">Manual mode</a>
        </nav>
      </header>

      <section className="opus-intro">
        <h1>Track clips and posts.</h1>
        <p>
          See what autopilot queued, posted, or failed — clip scores, previews, and source
          videos. TikTok view counts sync in a future update.
        </p>
      </section>

      {errorMessage ? (
        <div className="opus-alert" role="alert">
          {errorMessage}
        </div>
      ) : null}

      <div className="opus-stats">
        <div className="opus-stat">
          <span className="opus-stat-label">Posted</span>
          <strong>{summary?.posted ?? 0}</strong>
        </div>
        <div className="opus-stat">
          <span className="opus-stat-label">Queued</span>
          <strong>{summary?.queued ?? 0}</strong>
        </div>
        <div className="opus-stat">
          <span className="opus-stat-label">Failed</span>
          <strong>{summary?.failed ?? 0}</strong>
        </div>
        <div className="opus-stat">
          <span className="opus-stat-label">Avg clip score</span>
          <strong>{summary?.avgClipScore ?? "—"}</strong>
        </div>
      </div>

      {summary && summary.metricsPending > 0 ? (
        <p className="opus-hint">
          {summary.metricsPending} posted clip(s) waiting for TikTok metrics sync.
        </p>
      ) : null}

      <div className="opus-filter-row">
        {(["all", "posted", "queued", "failed"] as const).map((entry) => (
          <button
            key={entry}
            type="button"
            className={`opus-filter-tab ${filter === entry ? "active" : ""}`}
            onClick={() => setFilter(entry)}
          >
            {entry === "all" ? "All" : entry.charAt(0).toUpperCase() + entry.slice(1)}
          </button>
        ))}
      </div>

      <section className="opus-panel">
        {loading ? <p className="opus-hint">Loading…</p> : null}
        {!loading && visiblePosts.length === 0 ? (
          <p className="opus-hint">No posts yet. Queue a video from Autopilot.</p>
        ) : null}

        {!loading && visiblePosts.length > 0 ? (
          <div className="opus-table-wrap">
            <table className="opus-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Clip</th>
                  <th>Score</th>
                  <th>Length</th>
                  <th>Scheduled</th>
                  <th>Posted</th>
                  <th>Views</th>
                  <th>Likes</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {visiblePosts.map((post) => (
                  <tr key={post.id}>
                    <td>
                      <span className={`opus-pill ${statusClass(post.status)}`}>
                        {post.status}
                      </span>
                    </td>
                    <td>
                      <div className="opus-table-clip">
                        {post.clip?.previewUrl ? (
                          <a
                            href={post.clip.previewUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="opus-table-preview"
                          >
                            Preview
                          </a>
                        ) : null}
                        <span>{post.captionTitle ?? post.clip?.title ?? post.opusClipId}</span>
                      </div>
                      {post.errorMessage ? (
                        <p className="opus-error opus-table-error">{post.errorMessage}</p>
                      ) : null}
                    </td>
                    <td>{post.clip?.score ?? "—"}</td>
                    <td>{formatDuration(post.clip?.durationSec)}</td>
                    <td>{formatWhen(post.scheduledAt)}</td>
                    <td>{formatWhen(post.postedAt)}</td>
                    <td>{formatMetric(post.views)}</td>
                    <td>{formatMetric(post.likes)}</td>
                    <td className="opus-table-source">
                      {post.campaign?.sourceUrl ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </main>
  );
}
