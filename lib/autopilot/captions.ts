const DEFAULT_HASHTAGS = "#sharktank #entrepreneur #business #startup #money";
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

/** Filler-only lines we never want to use as a hook. */
const FILLER = new Set([
  "yeah",
  "yep",
  "no",
  "okay",
  "ok",
  "right",
  "sure",
  "uh",
  "um",
  "so",
  "well",
  "i think so",
  "it",
  "you know"
]);

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

/** Pick the first substantive sentence (not filler), else the longest. */
function pickHook(cleaned: string): string {
  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const substantive = sentences.find(
    (s) => s.length >= 25 && !FILLER.has(s.replace(/[.!?]+$/, "").toLowerCase())
  );

  const chosen =
    substantive ??
    [...sentences].sort((a, b) => b.length - a.length)[0] ??
    cleaned;

  return chosen.length > 120 ? `${chosen.slice(0, 117).trimEnd()}...` : chosen;
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

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return hash;
}

function withOptionalCta(
  title: string,
  includeCta: boolean,
  seed: string
): string {
  if (!includeCta) {
    return title;
  }
  const cta = CTA_LINES[Math.abs(hashString(seed)) % CTA_LINES.length]!;
  return `${title}\n${cta}`;
}

export function buildAutopilotCaption(input: {
  title?: string | null;
  description?: string | null;
}): { title: string; description: string } {
  const cleanedTitle = cleanTranscriptText(input.title);
  const title = cleanedTitle ? pickHook(cleanedTitle) : "Clip";
  const description = cleanTranscriptText(input.description) || DEFAULT_HASHTAGS;

  return { title, description };
}

function fallbackTikTokCaption(
  transcript: string,
  niche?: string | null,
  includeCta = false
): {
  title: string;
  description: string;
} {
  const cleaned = cleanTranscriptText(transcript);
  const rawHook = cleaned ? pickHook(cleaned) : "This money lesson hits different.";
  const series = pickSeriesLabel(cleaned || rawHook);
  const hook = `${series}: ${rawHook}`;

  const nicheTag = niche?.trim().replace(/\s+/g, "").toLowerCase();
  const hashtags = nicheTag
    ? `${DEFAULT_HASHTAGS} #${nicheTag.replace(/[^a-z0-9_]/gi, "")}`
    : DEFAULT_HASHTAGS;

  return {
    title: withOptionalCta(hook, includeCta, cleaned || rawHook),
    description: hashtags
  };
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
    if (!hook) {
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
      title: withOptionalCta("Shark Tank money lesson.", includeCta, "empty"),
      description: DEFAULT_HASHTAGS
    };
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return fallbackTikTokCaption(transcript, input.niche, includeCta);
  }

  const series = pickSeriesLabel(transcript);
  const prompt = `Write a TikTok caption that grows an entrepreneur / Shark Tank clip account.

Series style to match (keep account consistent): "${series}"
Source: ${input.sourceTitle?.trim() || "long-form interview"}
Niche: ${input.niche?.trim() || "shark_tank_entrepreneurs"}
Transcript excerpt:
"""${transcript.slice(0, 900)}"""

Rules:
- hook = scroll-stopping first line (curiosity, stakes, money, or conflict). NOT a raw transcript dump.
- Prefer formats like "Mark Cuban rule:", "Deal I'd take:", "Founder mistake:"
- body = optional one short clarifying line
- no emojis
- 3 to 5 niche hashtags only (no #fyp #viral spam)
- Do NOT include a follow CTA in hook/body (we add that separately)

Return JSON only: {"hook":"...","body":"...","hashtags":"#... #..."}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.85,
          maxOutputTokens: 256,
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
