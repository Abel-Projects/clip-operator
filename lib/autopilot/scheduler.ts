import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { AutopilotSettingsRow, ScheduledPostRow } from "@/lib/supabase/types";

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_MINUTE = 60 * 1000;

/** US entrepreneur TikTok peak hours in the account timezone. */
const PEAK_HOURS_LOCAL = new Set([7, 8, 9, 11, 12, 18, 19, 20, 21, 22]);

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function countPostsOnUtcDay(timestamps: Date[], day: Date): number {
  const start = startOfUtcDay(day).getTime();
  const end = start + 24 * MS_PER_HOUR;

  return timestamps.filter((ts) => {
    const t = ts.getTime();
    return t >= start && t < end;
  }).length;
}

function hourInTimeZone(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    hour12: false
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  return hour === 24 ? 0 : hour;
}

function isPeakLocalHour(date: Date, timeZone: string): boolean {
  return PEAK_HOURS_LOCAL.has(hourInTimeZone(date, timeZone));
}

/** Snap forward to the next peak window while preserving min gap. */
function snapToPeakHour(from: Date, timeZone: string): Date {
  if (isPeakLocalHour(from, timeZone)) {
    return from;
  }

  let cursor = new Date(from);
  for (let step = 0; step < 24 * 12; step += 1) {
    cursor = new Date(cursor.getTime() + 5 * MS_PER_MINUTE);
    if (isPeakLocalHour(cursor, timeZone)) {
      return cursor;
    }
  }

  return from;
}

export async function computeNextPostSlots(input: {
  count: number;
  settings: AutopilotSettingsRow;
  notBefore?: Date;
}): Promise<Date[]> {
  const supabase = getSupabaseAdmin();
  const minGapMs = input.settings.min_hours_between_posts * MS_PER_HOUR;
  const maxPerDay = Math.max(1, input.settings.posts_per_day);
  const timeZone = input.settings.timezone?.trim() || "America/New_York";

  const { data: existing, error } = await supabase
    .from("scheduled_posts")
    .select("scheduled_at, posted_at, status")
    .in("status", ["queued", "posting", "posted"])
    .order("scheduled_at", { ascending: false })
    .limit(200);

  if (error) {
    throw new Error(error.message);
  }

  const occupied = (existing ?? []).flatMap((row) => {
    const slots: Date[] = [];
    if (row.scheduled_at) {
      slots.push(new Date(row.scheduled_at));
    }
    if (row.posted_at) {
      slots.push(new Date(row.posted_at));
    }
    return slots;
  });

  occupied.sort((a, b) => a.getTime() - b.getTime());

  const slots: Date[] = [];
  let cursor = input.notBefore ? new Date(input.notBefore) : new Date();
  cursor = new Date(Math.max(cursor.getTime(), Date.now()));

  if (occupied.length > 0) {
    const last = occupied[occupied.length - 1];
    cursor = new Date(Math.max(cursor.getTime(), last.getTime() + minGapMs));
  }

  cursor = snapToPeakHour(cursor, timeZone);
  const allScheduled = [...occupied];

  while (slots.length < input.count) {
    const dayCount = countPostsOnUtcDay(allScheduled, cursor);
    if (dayCount >= maxPerDay) {
      const nextDay = startOfUtcDay(cursor);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      cursor = snapToPeakHour(
        new Date(Math.max(nextDay.getTime(), cursor.getTime())),
        timeZone
      );
      continue;
    }

    if (allScheduled.length > 0) {
      const last = allScheduled[allScheduled.length - 1];
      const minNext = last.getTime() + minGapMs;
      if (cursor.getTime() < minNext) {
        cursor = snapToPeakHour(new Date(minNext), timeZone);
        continue;
      }
    }

    if (!isPeakLocalHour(cursor, timeZone)) {
      cursor = snapToPeakHour(cursor, timeZone);
      continue;
    }

    const slot = new Date(cursor);
    slots.push(slot);
    allScheduled.push(slot);
    cursor = snapToPeakHour(new Date(slot.getTime() + minGapMs), timeZone);
  }

  return slots;
}

export async function getDueScheduledPosts(
  limit = 1
): Promise<ScheduledPostRow[]> {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("scheduled_posts")
    .select("*")
    .eq("status", "queued")
    .lte("scheduled_at", now)
    .order("scheduled_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function getLastPostedAt(): Promise<Date | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("scheduled_posts")
    .select("posted_at, scheduled_at")
    .eq("status", "posted")
    .order("posted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data?.posted_at) {
    return null;
  }

  return new Date(data.posted_at);
}

export async function canPostNow(settings: AutopilotSettingsRow): Promise<boolean> {
  const lastPosted = await getLastPostedAt();
  if (!lastPosted) {
    return true;
  }

  const minGapMs = settings.min_hours_between_posts * MS_PER_HOUR;
  return Date.now() - lastPosted.getTime() >= minGapMs;
}
