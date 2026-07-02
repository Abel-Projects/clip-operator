const SMALL_WORDS = new Set(["a", "an", "and", "of", "the", "for", "to", "in", "on"]);

export function humanizeNiche(niche: string | null | undefined): string {
  if (!niche) return "Your niche";
  const words = niche
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return "Your niche";

  return words
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index > 0 && SMALL_WORDS.has(lower)) {
        return lower;
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

export function providerLabel(provider: string | null | undefined): string {
  switch (provider) {
    case "wayinvideo":
      return "WayinVideo";
    case "supoclip":
      return "SupoClip";
    case "opusclip":
      return "OpusClip";
    case "openshorts":
      return "OpenShorts";
    default:
      return "SupoClip";
  }
}

export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

/** Human relative time, e.g. "in 48 min", "3h ago", "just now". */
export function formatRelative(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";

  const diffMs = date.getTime() - now;
  const future = diffMs >= 0;
  const absSec = Math.round(Math.abs(diffMs) / 1000);

  if (absSec < 45) return future ? "in under a minute" : "just now";

  const minutes = Math.round(absSec / 60);
  if (minutes < 60) return future ? `in ${minutes} min` : `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return future ? `in ${hours}h` : `${hours}h ago`;

  const days = Math.round(hours / 24);
  return future ? `in ${days}d` : `${days}d ago`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return "—";
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

export function formatMetric(value: number | null | undefined): string {
  return value == null ? "—" : value.toLocaleString();
}

/** Turn an hours gap into a friendly cadence, e.g. 1 -> "about 1/hour". */
export function formatCadence(minHoursBetweenPosts: number | null | undefined): string {
  if (!minHoursBetweenPosts || minHoursBetweenPosts <= 0) return "as fast as possible";
  if (minHoursBetweenPosts >= 1) {
    const rounded = Math.round(minHoursBetweenPosts * 10) / 10;
    return rounded === 1 ? "about 1/hour" : `about 1 every ${rounded}h`;
  }
  const perHour = Math.round(1 / minHoursBetweenPosts);
  return `about ${perHour}/hour`;
}
