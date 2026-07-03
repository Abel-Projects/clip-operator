"use client";

import { useState } from "react";
import {
  cleanCaption,
  formatDuration,
  formatMetric,
  formatRelative,
  youtubeThumbnail
} from "@/lib/format";

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

function statusClass(status: PostStatus, scheduledAt: string) {
  switch (status) {
    case "posted":
      return "ok";
    case "failed":
      return "bad";
    case "posting":
      return "active";
    case "queued":
      return new Date(scheduledAt).getTime() <= Date.now() ? "active" : "";
    default:
      return "";
  }
}

function statusLabel(status: PostStatus, scheduledAt: string) {
  switch (status) {
    case "posted":
      return "Posted";
    case "posting":
      return "Publishing";
    case "failed":
      return "Failed";
    case "queued":
      return new Date(scheduledAt).getTime() <= Date.now() ? "Due now" : "Queued";
    default:
      return status;
  }
}

function whenLabel(post: MonitorPost): string {
  if (post.status === "posted" && post.postedAt) {
    return `Posted ${formatRelative(post.postedAt)}`;
  }
  if (post.status === "posting") {
    return "Publishing to TikTok…";
  }
  if (post.status === "failed") {
    return `Failed ${formatRelative(post.scheduledAt)}`;
  }
  if (new Date(post.scheduledAt).getTime() <= Date.now()) {
    return `Due ${formatRelative(post.scheduledAt)}`;
  }
  return `Up next ${formatRelative(post.scheduledAt)}`;
}

function visibleError(message: string | null, status: PostStatus): string | null {
  if (!message || status === "queued") {
    return null;
  }
  if (message.startsWith("claim:")) {
    return null;
  }
  return message;
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
    filter === "all"
      ? posts
      : filter === "queued"
        ? posts.filter((post) => post.status === "queued" || post.status === "posting")
        : posts.filter((post) => post.status === filter);

  return (
    <section className="opus-panel opus-monitor" id="monitor">
      <div className="opus-section-head">
        <div>
          <h2>Recent posts</h2>
          <p className="opus-hint">Everything the machine has clipped and sent to TikTok.</p>
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

      <div className="opus-filter-row">
        {(["all", "posted", "queued", "posting", "failed"] as const).map((entry) => (
          <button
            key={entry}
            type="button"
            className={`opus-filter-tab ${filter === entry ? "active" : ""}`}
            onClick={() => setFilter(entry)}
          >
            {entry === "all"
              ? "All"
              : entry === "posting"
                ? "Publishing"
                : entry.charAt(0).toUpperCase() + entry.slice(1)}
          </button>
        ))}
      </div>

      {loading ? <p className="opus-hint">Loading clips…</p> : null}
      {!loading && visiblePosts.length === 0 ? (
        <p className="opus-hint">
          Nothing here yet. When autopilot is on it discovers sources, clips them, and posts
          automatically.
        </p>
      ) : null}

      {!loading && visiblePosts.length > 0 ? (
        <div className="opus-post-grid">
          {visiblePosts.map((post) => {
            const caption =
              cleanCaption(post.captionTitle) ||
              cleanCaption(post.clip?.title) ||
              post.providerClipId;
            const when = whenLabel(post);
            const thumb = youtubeThumbnail(post.campaign?.sourceUrl);
            const clipUrl = post.clip?.previewUrl ?? null;
            const pillClass = statusClass(post.status, post.scheduledAt);
            const pillLabel = statusLabel(post.status, post.scheduledAt);
            const errorText = visibleError(post.errorMessage, post.status);

            return (
              <article key={post.id} className={`opus-post-card ${pillClass}`}>
                <div className="opus-post-thumb">
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="" />
                  ) : (
                    <div className="opus-processing-thumb-fallback">▶</div>
                  )}
                  <span className={`opus-pill ${pillClass} opus-post-thumb-pill`}>
                    {pillLabel}
                  </span>
                </div>

                <p className="opus-post-title" title={caption}>
                  {caption}
                </p>

                {errorText ? (
                  <p className="opus-error opus-post-error">{errorText}</p>
                ) : null}

                <div className="opus-post-meta">
                  <span>{when}</span>
                  {post.clip?.durationSec ? (
                    <span>· {formatDuration(post.clip.durationSec)}</span>
                  ) : null}
                  {post.clip?.score != null ? <span>· score {post.clip.score}</span> : null}
                </div>

                {post.status === "posted" ? (
                  <div className="opus-post-metrics">
                    <span>{formatMetric(post.views)} views</span>
                    <span>{formatMetric(post.likes)} likes</span>
                  </div>
                ) : null}

                <div className="opus-post-links">
                  {clipUrl ? (
                    <a href={clipUrl} target="_blank" rel="noreferrer" className="opus-textlink">
                      Watch clip ↗
                    </a>
                  ) : null}
                  {post.campaign?.sourceUrl ? (
                    <a
                      href={post.campaign.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="opus-textlink"
                    >
                      Source ↗
                    </a>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
