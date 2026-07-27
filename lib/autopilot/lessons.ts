import { randomUUID } from "node:crypto";
import { computeNextPostSlots } from "@/lib/autopilot/scheduler";
import { getAutopilotSettings } from "@/lib/autopilot/settings";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { AutopilotSettingsRow, ScheduledPostRow } from "@/lib/supabase/types";

const DEFAULT_HASHTAGS = "#sharktank #entrepreneur #business";
const GROQ_MODEL = process.env.GROQ_CAPTION_MODEL?.trim() || "llama-3.3-70b-versatile";

const LESSON_SEEDS = [
  "Mark Cuban rule: never invest in a business you don't understand",
  "Kevin O'Leary rule: cash flow is more important than hype",
  "Barbara Corcoran tip: sell with confidence before you have the perfect product",
  "Daymond John lesson: branding can outlast a weak product",
  "Lori Greiner take: packaging and shelf appeal close retail deals",
  "Founder mistake: asking for money without knowing your unit economics",
  "Valuation reality check: a big ask with zero sales gets shredded",
  "Deal I'd take: give up equity for a shark who opens real doors",
  "Shark Tank money lesson: traction beats a clever pitch deck",
  "Investor rule: if you can't explain margins in one sentence, you're not ready"
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return hash;
}

function startOfUtcDayIso(date = new Date()): string {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  ).toISOString();
}

async function countLessonsQueuedOrPostedToday(): Promise<number> {
  const supabase = getSupabaseAdmin();
  const dayStart = startOfUtcDayIso();

  const { count, error } = await supabase
    .from("scheduled_posts")
    .select("id", { count: "exact", head: true })
    .eq("content_type", "lesson")
    .in("status", ["rendering", "queued", "posting", "posted"])
    .gte("scheduled_at", dayStart);

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

type LessonScript = {
  hook: string;
  voiceover: string;
  onScreenLines: string[];
  hashtags: string;
};

function fallbackLesson(seed: string): LessonScript {
  const hook = seed.includes(":") ? seed.split(":")[0]!.trim() + " rule" : "Shark Tank money lesson";
  const body = seed.includes(":") ? seed.split(":").slice(1).join(":").trim() : seed;
  return {
    hook: `${hook}: ${body}`.slice(0, 90),
    voiceover: `${body}. That's the kind of lesson founders learn the hard way on Shark Tank. Follow for more investor rules.`,
    onScreenLines: [hook.slice(0, 28), body.slice(0, 42)],
    hashtags: DEFAULT_HASHTAGS
  };
}

async function generateLessonScript(seed: string): Promise<LessonScript> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    return fallbackLesson(seed);
  }

  const prompt = `You write narrated TikTok scripts for a US Shark Tank clip account.
Stay ON NICHE: Shark Tank / US sharks / founder deals / money lessons only.
Never mention fruit stories, horror, Reddit, crypto pumps, or off-topic niches.

Seed angle: "${seed}"

Return JSON only:
{
  "hook": "scroll-stopping first line max 90 chars",
  "voiceover": "spoken script 35-55 words, punchy, tease stakes, end with soft follow CTA",
  "onScreenLines": ["line1 max 32 chars", "line2 max 40 chars"],
  "hashtags": "#sharktank #entrepreneur #business"
}`;

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.85,
        max_tokens: 320,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "You write Shark Tank niche TikTok lesson scripts as JSON."
          },
          { role: "user", content: prompt }
        ]
      })
    });

    if (!response.ok) {
      return fallbackLesson(seed);
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = json.choices?.[0]?.message?.content?.trim();
    if (!raw) {
      return fallbackLesson(seed);
    }

    const data = JSON.parse(raw) as Partial<LessonScript>;
    const hook = data.hook?.trim();
    const voiceover = data.voiceover?.trim();
    if (!hook || !voiceover) {
      return fallbackLesson(seed);
    }

    const lines = Array.isArray(data.onScreenLines)
      ? data.onScreenLines.map((line) => String(line).trim()).filter(Boolean).slice(0, 3)
      : fallbackLesson(seed).onScreenLines;

    return {
      hook: hook.slice(0, 100),
      voiceover: voiceover.slice(0, 500),
      onScreenLines: lines.length ? lines : fallbackLesson(seed).onScreenLines,
      hashtags: data.hashtags?.includes("#") ? data.hashtags.trim() : DEFAULT_HASHTAGS
    };
  } catch {
    return fallbackLesson(seed);
  }
}

/**
 * Queue up to lesson_posts_per_day narrated lessons (status=rendering).
 * Home-server lesson-agent renders MP4 then flips to queued.
 */
export async function maybeQueueLessonPosts(
  settings: AutopilotSettingsRow,
  actions: string[]
): Promise<void> {
  if (!settings.lesson_posts_enabled) {
    return;
  }

  const perDay = Math.max(0, Math.min(5, settings.lesson_posts_per_day ?? 1));
  if (perDay < 1) {
    return;
  }

  const already = await countLessonsQueuedOrPostedToday();
  if (already >= perDay) {
    return;
  }

  const toQueue = perDay - already;
  const slots = await computeNextPostSlots({ count: toQueue, settings });
  const supabase = getSupabaseAdmin();

  for (let i = 0; i < toQueue; i += 1) {
    const seed =
      LESSON_SEEDS[Math.abs(hashString(`${Date.now()}-${i}`)) % LESSON_SEEDS.length]!;
    const script = await generateLessonScript(seed);
    const lessonKey = `lesson-${randomUUID()}`;
    const scheduledAt = (slots[i] ?? new Date()).toISOString();

    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .insert({
        source_url: `lesson://${lessonKey}`,
        niche: settings.niche || "us_shark_tank",
        clip_provider: "supoclip",
        provider_project_id: "lesson",
        status: "done",
        error_message: null
      })
      .select("*")
      .single();

    if (campaignError || !campaign) {
      actions.push(`Lesson queue failed (campaign): ${campaignError?.message ?? "unknown"}`);
      return;
    }

    const { data: clip, error: clipError } = await supabase
      .from("campaign_clips")
      .insert({
        campaign_id: campaign.id,
        provider_clip_id: lessonKey,
        title: script.voiceover,
        score: 80,
        duration_sec: 20,
        rank: 1,
        selected: true
      })
      .select("*")
      .single();

    if (clipError || !clip) {
      actions.push(`Lesson queue failed (clip): ${clipError?.message ?? "unknown"}`);
      return;
    }

    const onScreen = script.onScreenLines.join(" | ");
    const { error: postError } = await supabase.from("scheduled_posts").insert({
      campaign_id: campaign.id,
      campaign_clip_id: clip.id,
      provider_project_id: "lesson",
      provider_clip_id: lessonKey,
      scheduled_at: scheduledAt,
      status: "rendering",
      content_type: "lesson",
      local_video_path: null,
      caption_title: `${script.hook}\n${onScreen}`,
      caption_description: script.hashtags,
      error_message: null
    });

    if (postError) {
      actions.push(`Lesson queue failed (post): ${postError.message}`);
      return;
    }

    actions.push(`Queued Shark Tank lesson for ${scheduledAt}: ${script.hook}`);
  }
}

export type LessonRenderJob = {
  id: string;
  voiceover: string;
  hook: string;
  onScreenLines: string[];
  scheduledAt: string;
};

export async function claimNextLessonRenderJob(): Promise<LessonRenderJob | null> {
  const settings = await getAutopilotSettings();
  if (!settings.enabled || !settings.lesson_posts_enabled) {
    return null;
  }

  const supabase = getSupabaseAdmin();

  // Clear stale render claims (>15m) so a crashed agent can retry.
  const staleBefore = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data: stale } = await supabase
    .from("scheduled_posts")
    .select("id, error_message")
    .eq("status", "rendering")
    .eq("content_type", "lesson")
    .like("error_message", "render-claim:%");
  for (const row of stale ?? []) {
    const claimedAt = Date.parse(String(row.error_message).slice("render-claim:".length));
    if (Number.isFinite(claimedAt) && new Date(claimedAt).toISOString() < staleBefore) {
      await supabase
        .from("scheduled_posts")
        .update({ error_message: null })
        .eq("id", row.id)
        .eq("status", "rendering");
    }
  }

  const { data: candidates, error } = await supabase
    .from("scheduled_posts")
    .select("*")
    .eq("status", "rendering")
    .eq("content_type", "lesson")
    .is("local_video_path", null)
    .is("error_message", null)
    .order("scheduled_at", { ascending: true })
    .limit(5);

  if (error) {
    throw new Error(error.message);
  }

  for (const row of candidates ?? []) {
    const post = row as ScheduledPostRow;
    const claimMarker = `render-claim:${new Date().toISOString()}`;

    const { data: claimed, error: claimError } = await supabase
      .from("scheduled_posts")
      .update({ error_message: claimMarker })
      .eq("id", post.id)
      .eq("status", "rendering")
      .is("local_video_path", null)
      .select("*")
      .maybeSingle();

    if (claimError || !claimed) {
      continue;
    }

    const { data: clip } = await supabase
      .from("campaign_clips")
      .select("title")
      .eq("id", claimed.campaign_clip_id)
      .maybeSingle();

    const voiceover = (clip?.title || claimed.caption_title || "").trim();
    const hook = (claimed.caption_title ?? "Shark Tank money lesson").split("\n")[0]!.trim();
    const onScreenRaw = (claimed.caption_title ?? "").includes("\n")
      ? claimed.caption_title!.split("\n").slice(1).join(" ")
      : hook;
    const onScreenLines = onScreenRaw
      .split("|")
      .map((part: string) => part.trim())
      .filter(Boolean)
      .slice(0, 3);

    return {
      id: claimed.id,
      voiceover: voiceover || hook,
      hook,
      onScreenLines: onScreenLines.length ? onScreenLines : [hook],
      scheduledAt: claimed.scheduled_at
    };
  }

  return null;
}

export async function completeLessonRenderJob(
  postId: string,
  result: { ok: boolean; localVideoPath?: string; message?: string }
): Promise<{ ok: boolean; message: string }> {
  const supabase = getSupabaseAdmin();

  const { data: post, error: fetchError } = await supabase
    .from("scheduled_posts")
    .select("*")
    .eq("id", postId)
    .maybeSingle();

  if (fetchError) {
    throw new Error(fetchError.message);
  }
  if (!post) {
    return { ok: false, message: "Post not found." };
  }
  if (post.status !== "rendering") {
    return { ok: false, message: `Post is ${post.status}, not rendering.` };
  }

  if (result.ok && result.localVideoPath) {
    const { error } = await supabase
      .from("scheduled_posts")
      .update({
        status: "queued",
        local_video_path: result.localVideoPath,
        error_message: null
      })
      .eq("id", postId);

    if (error) {
      throw new Error(error.message);
    }
    return { ok: true, message: "Lesson rendered and queued." };
  }

  const { error } = await supabase
    .from("scheduled_posts")
    .update({
      status: "failed",
      error_message: result.message ?? "Lesson render failed."
    })
    .eq("id", postId);

  if (error) {
    throw new Error(error.message);
  }

  return { ok: true, message: result.message ?? "Marked lesson failed." };
}
