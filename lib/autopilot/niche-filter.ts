/**
 * Niche gate for US Shark Tank long-form sources.
 * Blocklist alone was letting podcasts + international franchises through.
 */

export type NicheSourceMeta = {
  title?: string | null;
  channelTitle?: string | null;
};

const COMPILATION_BLOCKLIST = [
  "shark tank best moments",
  "funny moments",
  "#shorts",
  "#short",
  " youtube shorts",
  "youtube short",
  "tiktok",
  "reel",
  "shorts:",
  " | shorts",
  "top 10",
  "top 5",
  "highlight reel",
  "clip compilation",
  "rejected pitches",
  "shark tank clips",
  "vertical video",
  "one pitch from every episode",
  "best pitches",
  "worst pitches",
  "all pitches from"
];

/** International Shark Tank / Dragons' Den franchises — not US ABC. */
const NON_US_FRANCHISE = [
  "shark tank australia",
  "shark tank au",
  "shark tank uk",
  "shark tank canada",
  "shark tank india",
  "shark tank mexico",
  "shark tank philippines",
  "shark tank vietnam",
  "shark tank south africa",
  "shark tank brazil",
  "shark tank italy",
  "shark tank germany",
  "shark tank france",
  "shark tank japan",
  "shark tank korea",
  "shark tank china",
  "shark tank pakistan",
  "shark tank indonesia",
  "dragons' den",
  "dragon's den",
  "dragons den",
  "lora's den",
  "money tiger",
  "tumbling dice",
  "shark tank global episode", // often non-US franchise dumps
  "cnbc shark tank" // often India
];

const NON_US_CHANNEL_HINTS = [
  "shark tank australia",
  "shark tank uk",
  "shark tank india",
  "sony tv",
  "star plus",
  "network 10",
  "network ten",
  "channel 4",
  "bbc",
  "ctv",
  "dragons' den",
  "dragon's den"
];

/** Must look like US Shark Tank episode / pitch content. */
const US_POSITIVE = [
  "shark tank",
  "sharktank"
];

const US_SHARK_OR_SHOW_HINTS = [
  "mark cuban",
  "barbara corcoran",
  "kevin o'leary",
  "kevin oleary",
  "daymond john",
  "lori greiner",
  "robert herjavec",
  "mr. wonderfu",
  "mr wonderful",
  "abc",
  "season ",
  " s0",
  " s1",
  " s2",
  " s3",
  " s4",
  " s5",
  " s6",
  " s7",
  " s8",
  " s9",
  "episode",
  "full episode",
  "pitch"
];

/** Explicitly not the niche even if someone says "entrepreneur". */
const OFF_NICHE = [
  "how i built this",
  "npr ",
  "ted talk",
  "tedx",
  "all-in podcast",
  "my first million",
  "diary of a ceo",
  "lex fridman",
  "joe rogan",
  "ycombinator",
  "y combinator startup school"
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/['']/g, "'")
    .replace(/^\[winner-similar\]\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isUsSharkTankSource(meta: NicheSourceMeta): boolean {
  return usSharkTankRejectReason(meta) === null;
}

/** Returns null if OK, otherwise a short reject reason. */
export function usSharkTankRejectReason(meta: NicheSourceMeta): string | null {
  const title = normalize(meta.title ?? "");
  const channel = normalize(meta.channelTitle ?? "");
  const haystack = `${title} ${channel}`;

  if (!title) {
    return "missing title";
  }

  if (COMPILATION_BLOCKLIST.some((p) => title.includes(p))) {
    return "compilation/shorts";
  }

  if (OFF_NICHE.some((p) => haystack.includes(p))) {
    return "off-niche show/podcast";
  }

  if (NON_US_FRANCHISE.some((p) => haystack.includes(p))) {
    return "non-US Shark Tank franchise";
  }

  if (NON_US_CHANNEL_HINTS.some((p) => channel.includes(p))) {
    return "non-US channel";
  }

  // Soft region words in title (avoid false positives like "Canada" in a US founder story
  // by requiring them next to shark tank / franchise context).
  if (
    /\b(uk|australia|au|india|mexico|philippines|vietnam)\b/.test(title) &&
    /shark\s*tank|dragons?\s*'?\s*den/.test(title)
  ) {
    return "non-US region in title";
  }

  const hasSharkTank = US_POSITIVE.some((p) => haystack.includes(p));
  if (!hasSharkTank) {
    return "not Shark Tank";
  }

  // Require at least a light US/show signal so bare "Shark Tank" foreign dumps
  // without season/ABC/shark names still need to clear franchise blocklist above.
  const hasUsHint = US_SHARK_OR_SHOW_HINTS.some((p) => haystack.includes(p));
  if (!hasUsHint && /global/.test(channel) && !/abc|united states|us\b/.test(haystack)) {
    // Shark Tank Global uploads without US markers — skip
    return "global channel without US markers";
  }

  return null;
}
