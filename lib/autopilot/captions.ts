const DEFAULT_HASHTAGS = "#sharktank #entrepreneur #business #startup #fyp";
const GEMINI_MODEL = "gemini-2.0-flash-lite";

export function buildAutopilotCaption(input: {
  title?: string | null;
  description?: string | null;
}): { title: string; description: string } {
  const title = input.title?.trim() || "Clip";
  const description = input.description?.trim() || title;

  return { title, description };
}

function fallbackTikTokCaption(transcript: string, niche?: string | null): {
  title: string;
  description: string;
} {
  const cleaned = transcript.replace(/\s+/g, " ").trim();
  const firstSentence = cleaned.split(/(?<=[.!?])\s+/)[0]?.trim() || cleaned;
  const hook =
    firstSentence.length > 120
      ? `${firstSentence.slice(0, 117).trimEnd()}...`
      : firstSentence || "This clip hits different.";

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
  const transcript = input.transcript.replace(/\s+/g, " ").trim();
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
