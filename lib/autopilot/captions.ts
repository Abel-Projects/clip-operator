const DEFAULT_HASHTAGS =
  "#sharktank #entrepreneur #businessadvice #startup #sidehustle";
const GEMINI_MODEL = "gemini-2.0-flash-lite";

const SERIES_FORMATS = [
  "Shark Tank money lesson",
  "Deal I'd take",
  "Investor rule",
  "Founder mistake",
  "Valuation reality check"
];

/** Soft CTAs — used on ~1 of every 5 posts. */
const CTA_LINES = [
  "Follow for daily Shark Tank money lessons.",
  "Part 2 if this hits — follow so you don't miss it.",
  "Follow for more investor breakdowns."
];

/**
 * SupoClip "titles" are raw transcripts with speaker labels
 * ("Speaker A:", "Speaker 1:", ">>"). Strip that noise so captions read cleanly.
 */
export function cleanTranscriptText(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/\bspeaker\s*[a-z0-9]+\s*:/gi, " ")
    .replace(/^\s*>>+/gm, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return hash;
}

function pickSeriesLabel(transcript: string): string {
  const lower = transcript.toLowerCase();
  if (lower.includes("cuban")) return "Mark Cuban rule";
  if (lower.includes("o'leary") || lower.includes("oleary") || lower.includes("mr. wonderful")) {
    return "Kevin O'Leary rule";
  }
  if (lower.includes("corcoran") || lower.includes("barbara")) return "Barbara Corcoran tip";
  if (lower.includes("daymond")) return "Daymond John lesson";
  if (lower.includes("lori") || lower.includes("greiner")) return "Lori Greiner take";
  const index = Math.abs(hashString(transcript)) % SERIES_FORMATS.length;
  return SERIES_FORMATS[index]!;
}

function withOptionalCta(title: string, includeCta: boolean, seed: string): string {
  if (!includeCta) {
    return title;
  }
  const cta = CTA_LINES[Math.abs(hashString(seed)) % CTA_LINES.length]!;
  return `${title}\n${cta}`;
}

/**
 * Use a stored caption as-is (do NOT re-pick a transcript sentence).
 * Only cleans speaker labels if somehow still present.
 */
export function buildAutopilotCaption(input: {
  title?: string | null;
  description?: string | null;
}): { title: string; description: string } {
  const title = cleanTranscriptText(input.title) || "Clip";
  const description = cleanTranscriptText(input.description) || DEFAULT_HASHTAGS;
  return { title, description };
}

function moneyOrStakeHint(transcript: string): string | null {
  const money = transcript.match(/\$[\d,.]+(?:\s*(?:million|k|thousand))?/i)?.[0];
  if (money) {
    return money.replace(/\s+/g, "");
  }
  const percent = transcript.match(/\b\d{1,3}%\b/)?.[0];
  return percent ?? null;
}

/**
 * Clickbait fallback when Gemini is unavailable — never paste raw transcript.
 */
function fallbackTikTokCaption(
  transcript: string,
  niche?: string | null,
  includeCta = false
): { title: string; description: string } {
  const cleaned = cleanTranscriptText(transcript);
  const series = pickSeriesLabel(cleaned);
  const stake = moneyOrStakeHint(cleaned);

  const templates = [
    stake
      ? `${series}: They asked for ${stake}. What happened next is wild.`
      : `${series}: The Sharks hated this pitch… until one number changed everything.`,
    stake
      ? `${series}: ${stake} on the line — and the founder almost walked.`
      : `${series}: This founder said one sentence that flipped the whole room.`,
    `${series}: Don't make this mistake if you want a deal.`,
    `${series}: The offer was insane. Here's why it almost worked.`,
    stake
      ? `${series}: ${stake} valuation — and Cuban wasn't buying it.`
      : `${series}: Watch the Sharks fight over this deal.`
  ];

  const hook = templates[Math.abs(hashString(cleaned || series)) % templates.length]!;

  const nicheTag = niche?.trim().replace(/\s+/g, "").toLowerCase();
  const hashtags = nicheTag
    ? `${DEFAULT_HASHTAGS} #${nicheTag.replace(/[^a-z0-9_]/gi, "")}`
    : DEFAULT_HASHTAGS;

  return {
    title: withOptionalCta(hook, includeCta, cleaned || series),
    description: hashtags
  };
}

function looksLikeRawTranscript(hook: string): boolean {
  const lower = hook.toLowerCase();
  if (hook.length > 110) return true;
  if (/^(so|and|well|you know|uh|um|i mean)\b/i.test(hook)) return true;
  if (/\bspeaker\b/i.test(hook)) return true;
  // Weak hooks that are clearly mid-conversation
  if (
    /^(thank you|thanks|hello|hi everyone|my name is|this is my)\b/i.test(lower)
  ) {
    return true;
  }
  return false;
}

function parseGeminiCaption(
  text: string,
  includeCta: boolean,
  seed: string
): { title: string; description: string } | null {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");

  try {
    const data = JSON.parse(cleaned) as {
      hook?: string;
      body?: string;
      hashtags?: string;
    };

    const hook = data.hook?.trim();
    if (!hook || looksLikeRawTranscript(hook)) {
      return null;
    }

    const body = data.body?.trim() ?? "";
    const hashtags = data.hashtags?.trim() || DEFAULT_HASHTAGS;
    const title = body ? `${hook}\n${body}` : hook;

    return {
      title: withOptionalCta(title, includeCta, seed),
      description: hashtags
    };
  } catch {
    return null;
  }
}

export async function generateAutopilotCaption(input: {
  transcript: string;
  sourceTitle?: string | null;
  niche?: string | null;
  includeCta?: boolean;
}): Promise<{ title: string; description: string }> {
  const transcript = cleanTranscriptText(input.transcript);
  const includeCta = Boolean(input.includeCta);

  if (!transcript) {
    return {
      title: withOptionalCta(
        "Shark Tank money lesson: This pitch went sideways fast.",
        includeCta,
        "empty"
      ),
      description: DEFAULT_HASHTAGS
    };
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return fallbackTikTokCaption(transcript, input.niche, includeCta);
  }

  const series = pickSeriesLabel(transcript);
  const prompt = `You write viral TikTok captions for a Shark Tank / entrepreneur clip account.

Goal: maximize watch time + follows. The caption must be CLICKBAIT — curiosity, money, conflict, stakes.
NEVER copy the transcript opening. NEVER start with So/And/Well/You know/Thank you.

Series label to use when it fits: "${series}"
Episode/source: ${input.sourceTitle?.trim() || "Shark Tank / entrepreneur interview"}
Niche: ${input.niche?.trim() || "shark_tank_entrepreneurs"}

Transcript (for CONTEXT only — extract the drama, do not quote weakly):
"""${transcript.slice(0, 1200)}"""

Write:
- hook: one scroll-stopping line (max ~90 chars). Prefer formats like:
  "Mark Cuban rule: …"
  "They wanted $X for Y% — then this happened."
  "The Shark that said no just lost millions."
  "Founder mistake: …"
- body: optional second short line that raises stakes (max ~80 chars)
- hashtags: 3-5 niche tags only (no #fyp #viral)

Return JSON only: {"hook":"...","body":"...","hashtags":"#... #..."}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.95,
          maxOutputTokens: 280,
          responseMimeType: "application/json"
        }
      })
    });

    if (!response.ok) {
      return fallbackTikTokCaption(transcript, input.niche, includeCta);
    }

    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return fallbackTikTokCaption(transcript, input.niche, includeCta);
    }

    const parsed = parseGeminiCaption(text, includeCta, transcript);
    return parsed ?? fallbackTikTokCaption(transcript, input.niche, includeCta);
  } catch {
    return fallbackTikTokCaption(transcript, input.niche, includeCta);
  }
}
