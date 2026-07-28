/**
 * Niche gate: US Shark Tank full-episode sources only.
 * Guest podcasts, shark interviews, and highlight compilations are rejected.
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
  "top 3",
  "highlight reel",
  "clip compilation",
  "compilation",
  "rejected pitches",
  "shark tank clips",
  "vertical video",
  "one pitch from every episode",
  "best pitches",
  "worst pitches",
  "best food pitches",
  "all pitches from",
  "craziest offers",
  "strangest pitches",
  "bidding wars",
  "golden ticket moments",
  "biggest deals",
  "biggest shark fights",
  "best & worst",
  "you won't believe"
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
  "shark tank colombia",
  "dragons' den",
  "dragon's den",
  "dragons den",
  "lora's den",
  "money tiger",
  "tumbling dice",
  "shark tank global episode",
  "cnbc shark tank"
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
const US_POSITIVE = ["shark tank", "sharktank"];

/** Episode / show signals — required (not optional). */
const EPISODE_HINTS = [
  "full episode",
  "full ep",
  "complete episode",
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
  "episode ",
  " ep ",
  " ep.",
  "pitch"
];

/** Guest appearances, podcasts, advice — not clipable Tank episodes. */
const GUEST_OR_PODCAST = [
  "podcast",
  " interview",
  "interviews",
  "talks shark tank",
  "reveals",
  "shares business",
  "shares advice",
  "on building ",
  "lessons from shark tank",
  "blueprint for",
  "secrets to success",
  "post shark tank",
  "after shark tank",
  "inside the mind",
  "from shark tank to",
  "shark tank's barbara",
  "shark tank's daymond",
  "shark tank's kevin",
  "shark tank's lori",
  "shark tank's mark",
  "shark tank's robert",
  "shark tank investor",
  "how to scale",
  "business advice",
  "got $",
  "investment:",
  "dr. oz",
  "doctor oz",
  "jay shetty",
  "earn your leisure",
  "diary of a ceo",
  "lex fridman",
  "joe rogan",
  "adam friedland",
  "fifth column",
  "mick unplugged",
  "jamie kern",
  "codie sanchez",
  "jobber",
  "caregiving",
  "alzheimer",
  "deep mma",
  "startup to storefront",
  "the scribble",
  "the money signal",
  "genuine school",
  "warrior kid"
];

const OFF_NICHE = [
  "how i built this",
  "npr ",
  "ted talk",
  "tedx",
  "all-in podcast",
  "my first million",
  "ycombinator",
  "y combinator startup school"
];

/** Channels that mostly upload compilations / dumps, not usable full episodes. */
const CHANNEL_BLOCKLIST = [
  "shark tank global",
  "sony pictures television"
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

  if (GUEST_OR_PODCAST.some((p) => haystack.includes(p))) {
    return "podcast/interview/guest appearance";
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

  if (CHANNEL_BLOCKLIST.some((p) => channel.includes(p))) {
    return "compilation dump channel";
  }

  if (
    /\b(uk|australia|au|india|mexico|philippines|vietnam|colombia)\b/.test(title) &&
    /shark\s*tank|dragons?\s*'?\s*den/.test(title)
  ) {
    return "non-US region in title";
  }

  const hasSharkTank = US_POSITIVE.some((p) => haystack.includes(p));
  if (!hasSharkTank) {
    return "not Shark Tank";
  }

  const hasEpisodeHint = EPISODE_HINTS.some((p) => haystack.includes(p));
  if (!hasEpisodeHint) {
    return "not a full episode/pitch source";
  }

  return null;
}
