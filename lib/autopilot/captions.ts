/** Clip Academy: keep to ~3 niche tags (no #fyp / #viral). */
const DEFAULT_HASHTAGS = "#sharktank #entrepreneur #business";
const GEMINI_MODEL = "gemini-2.0-flash";
const GROQ_MODEL_DEFAULT = "llama-3.3-70b-versatile";

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
 * Template fallback when LLMs are unavailable — never paste raw transcript.
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
      ? `${series}: They asked for ${stake}. You won't believe what the Sharks said.`
      : `${series}: The Sharks hated this pitch… until one number changed everything.`,
    stake
      ? `${series}: ${stake} on the line — and the founder almost walked.`
      : `${series}: This one sentence flipped the whole room.`,
    `${series}: Don't make this mistake if you want a deal.`,
    `${series}: The offer was insane. Here's why it almost worked.`,
    stake
      ? `${series}: ${stake} valuation — Cuban wasn't buying it.`
      : `${series}: Watch the Sharks fight over this deal.`,
    `${series}: Tease: the ask sounded crazy. The answer was worse.`
  ];

  const hook = templates[Math.abs(hashString(cleaned || series)) % templates.length]!;

  return {
    title: withOptionalCta(hook, includeCta, cleaned || series),
    description: DEFAULT_HASHTAGS
  };
}

function looksLikeRawTranscript(hook: string): boolean {
  const lower = hook.toLowerCase();
  if (hook.length > 110) return true;
  if (/^(so|and|well|you know|uh|um|i mean)\b/i.test(hook)) return true;
  if (/\bspeaker\b/i.test(hook)) return true;
  if (
    /^(thank you|thanks|hello|hi everyone|my name is|this is my)\b/i.test(lower)
  ) {
    return true;
  }
  return false;
}

function parseCaptionJson(
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

function buildCaptionPrompt(input: {
  transcript: string;
  sourceTitle?: string | null;
  niche?: string | null;
  series: string;
}): string {
  return `You write viral TikTok captions for a US Shark Tank clip account.

Goal: maximize watch time + follows. Caption = CLICKBAIT that teases the ending (Freytag exposition).
The viewer must feel suspense in the first line — foreshadow the conflict/money/deal without spoiling it.
NEVER copy the transcript opening. NEVER start with So/And/Well/You know/Thank you/My name is.
NEVER describe the clip flatly ("this influencer does X"). Bake curiosity instead.
Sound human and punchy — not corporate, not spammy.

Series label to use when it fits: "${input.series}"
Episode/source: ${input.sourceTitle?.trim() || "Shark Tank US episode"}
Niche: ${input.niche?.trim() || "shark_tank_entrepreneurs"}

Transcript (CONTEXT only — extract drama/stakes, do not quote weakly):
"""${input.transcript.slice(0, 1200)}"""

Write:
- hook: one scroll-stopping line (max ~90 chars). Prefer:
  "Mark Cuban rule: …"
  "They wanted $X for Y% — then this happened."
  "The Shark that said no just lost millions."
  "Founder mistake: …"
  "You wouldn't believe what stopped this deal."
- body: optional second short line that raises stakes (max ~80 chars). Tease payoff; don't summarize the whole pitch.
- hashtags: exactly 3 niche tags (no #fyp #viral). Prefer #sharktank #entrepreneur #business

Return JSON only: {"hook":"...","body":"...","hashtags":"#... #... #..."}`;
}

async function captionViaGroq(
  prompt: string,
  includeCta: boolean,
  seed: string
): Promise<{ title: string; description: string } | null> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) return null;

  const model =
    process.env.GROQ_CAPTION_MODEL?.trim() || GROQ_MODEL_DEFAULT;

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        temperature: 0.9,
        max_tokens: 280,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You write scroll-stopping TikTok caption hooks as JSON. Never copy transcript openers."
          },
          { role: "user", content: prompt }
        ]
      })
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = payload.choices?.[0]?.message?.content;
    if (!text) return null;
    return parseCaptionJson(text, includeCta, seed);
  } catch {
    return null;
  }
}

async function captionViaGemini(
  prompt: string,
  includeCta: boolean,
  seed: string
): Promise<{ title: string; description: string } | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;

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
      return null;
    }

    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;
    return parseCaptionJson(text, includeCta, seed);
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

  const series = pickSeriesLabel(transcript);
  const prompt = buildCaptionPrompt({
    transcript,
    sourceTitle: input.sourceTitle,
    niche: input.niche,
    series
  });

  // Prefer Groq (better short-form hooks on free tier); Gemini as backup.
  const fromGroq = await captionViaGroq(prompt, includeCta, transcript);
  if (fromGroq) return fromGroq;

  const fromGemini = await captionViaGemini(prompt, includeCta, transcript);
  if (fromGemini) return fromGemini;

  return fallbackTikTokCaption(transcript, input.niche, includeCta);
}
