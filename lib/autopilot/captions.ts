const DEFAULT_HASHTAGS = "#sharktank #entrepreneur #business #startup #fyp";
const GEMINI_MODEL = "gemini-2.0-flash-lite";

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

export function buildAutopilotCaption(input: {
  title?: string | null;
  description?: string | null;
}): { title: string; description: string } {
  const cleanedTitle = cleanTranscriptText(input.title);
  const title = cleanedTitle ? pickHook(cleanedTitle) : "Clip";
  const description = cleanTranscriptText(input.description) || title;

  return { title, description };
}

function fallbackTikTokCaption(transcript: string, niche?: string | null): {
  title: string;
  description: string;
} {
  const cleaned = cleanTranscriptText(transcript);
  const hook = cleaned ? pickHook(cleaned) : "This clip hits different.";

  const nicheTag = niche?.trim().replace(/\s+/g, "").toLowerCase();
  const hashtags = nicheTag
    ? `${DEFAULT_HASHTAGS} #${nicheTag.replace(/[^a-z0-9_]/gi, "")}`
    : DEFAULT_HASHTAGS;

  return { title: hook, description: hashtags };
}

function parseGeminiCaption(text: string): { title: string; description: string } | null {
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

    return {
      title: body ? `${hook}\n${body}` : hook,
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
}): Promise<{ title: string; description: string }> {
  const transcript = cleanTranscriptText(input.transcript);
  if (!transcript) {
    return buildAutopilotCaption({ title: "Clip", description: DEFAULT_HASHTAGS });
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return fallbackTikTokCaption(transcript, input.niche);
  }

  const prompt = `Write a TikTok post caption for a short entrepreneur / Shark Tank style clip.

Source: ${input.sourceTitle?.trim() || "interview clip"}
Niche: ${input.niche?.trim() || "entrepreneurship"}
Transcript excerpt:
"""${transcript.slice(0, 900)}"""

Rules:
- hook must be scroll-stopping, not a transcript dump
- body is optional context (one short line max)
- no emojis
- hashtags must start with #

Return JSON only: {"hook":"...","body":"...","hashtags":"#..."}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 256,
          responseMimeType: "application/json"
        }
      })
    });

    if (!response.ok) {
      return fallbackTikTokCaption(transcript, input.niche);
    }

    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return fallbackTikTokCaption(transcript, input.niche);
    }

    const parsed = parseGeminiCaption(text);
    return parsed ?? fallbackTikTokCaption(transcript, input.niche);
  } catch {
    return fallbackTikTokCaption(transcript, input.niche);
  }
}
