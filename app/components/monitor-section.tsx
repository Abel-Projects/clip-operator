"use client";

import { useState } from "react";

export type PostStatus = "queued" | "posting" | "posted" | "failed";

export type MonitorPost = {
  id: string;
  status: PostStatus;
  scheduledAt: string;
  postedAt: string | null;
  captionTitle: string | null;
  errorMessage: string | null;
  providerClipId: string;
  views: number | null;
  likes: number | null;
  clip: {
    title: string | null;
    score: number | null;
    durationSec: number | null;
    previewUrl: string | null;
  } | null;
  campaign: {
    sourceUrl: string;
  } | null;
};

export type MonitorSummary = {
  posted: number;
  queued: number;
  failed: number;
  avgClipScore: number | null;
  metricsPending: number;
};

type MonitorSectionProps = {
  posts: MonitorPost[];
  summary: MonitorSummary | null;
  loading: boolean;
  onClearFailed?: () => void;
  clearingFailed?: boolean;
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

export default function MonitorSection({
  posts,
  summary,
  loading,
  onClearFailed,
  clearingFailed
}: MonitorSectionProps) {
  const [filter, setFilter] = useState<"all" | PostStatus>("all");
  const visiblePosts =
    filter === "all" ? posts : posts.filter((post) => post.status === filter);

  return (
    <section className="opus-panel opus-monitor" id="monitor">
      <div className="opus-section-head">
        <div>
          <h2>Monitor</h2>
          <p className="opus-hint">
            Clips queued and posted — scores, previews, and source videos. TikTok views
            sync coming soon.
          </p>
        </div>
        {summary ? (
          <div className="opus-monitor-mini-stats">
            <span>{summary.posted} posted</span>
            <span>{summary.queued} queued</span>
            {summary.failed > 0 ? <span className="bad">{summary.failed} failed</span> : null}
          </div>
        ) : null}
        {summary && summary.failed > 0 && onClearFailed ? (
          <button
            type="button"
            className="opus-secondary opus-secondary-sm"
            onClick={onClearFailed}
            disabled={clearingFailed}
          >
            {clearingFailed ? "Clearing…" : "Clear failed"}
          </button>
        ) : null}
      </div>

      {summary && summary.metricsPending > 0 ? (
        <p className="opus-hint">
          {summary.metricsPending} posted clip(s) waiting for TikTok metrics.
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

      {loading ? <p className="opus-hint">Loading clips…</p> : null}
      {!loading && visiblePosts.length === 0 ? (
        <p className="opus-hint">No clips yet. Autopilot will discover sources when enabled.</p>
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
                      <span>{post.captionTitle ?? post.clip?.title ?? post.providerClipId}</span>
                    </div>
                    {post.campaign?.sourceUrl ? (
                      <p className="opus-hint opus-table-source">{post.campaign.sourceUrl}</p>
                    ) : null}
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
