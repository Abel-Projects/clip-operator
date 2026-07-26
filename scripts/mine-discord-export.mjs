/**
 * Stream-mine DiscordChatExporter JSON without loading the whole file.
 * Usage: node scripts/mine-discord-export.mjs <path.json> [keywords...]
 */
import fs from "node:fs";
import path from "node:path";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/mine-discord-export.mjs <export.json>");
  process.exit(1);
}

const keywords = (
  process.argv.slice(3).length
    ? process.argv.slice(3)
    : [
        "hook",
        "first 3",
        "3 second",
        "retention",
        "caption",
        "subtitle",
        "posting",
        "posts a day",
        "per day",
        "cadence",
        "niche",
        "algorithm",
        "views",
        "virality",
        "viral",
        "clip length",
        "seconds",
        "15-25",
        "20 second",
        "30 second",
        "editing",
        "capcut",
        "thumbnail",
        "hashtag",
        "growth",
        "shadowban",
        "flood",
        "quality",
        "shark",
        "freytag",
        "tease",
        "cta",
        "engagement",
        "watch time",
        "completion",
        "repost",
        "delete",
        "prune",
        "schedule",
        "best time",
        "peak",
      ]
).map((k) => k.toLowerCase());

function unescapeJsonString(s) {
  try {
    return JSON.parse(`"${s}"`);
  } catch {
    return s
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }
}

/** Find balanced {...} starting at `{` index. Returns end index exclusive or -1. */
function findObjectEnd(str, start) {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < str.length; i++) {
    const c = str[i];
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

function extractField(objText, field) {
  const re = new RegExp(`"${field}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`);
  const m = objText.match(re);
  return m ? unescapeJsonString(m[1]) : "";
}

function extractAuthor(objText) {
  const m = objText.match(/"author"\s*:\s*\{/);
  if (!m) return "";
  const start = m.index + m[0].length - 1;
  const end = findObjectEnd(objText, start);
  if (end < 0) return "";
  const authorBlock = objText.slice(start, end);
  return (
    extractField(authorBlock, "nickname") ||
    extractField(authorBlock, "name") ||
    extractField(authorBlock, "displayName") ||
    ""
  );
}

const KEYWORD_RE = new RegExp(
  keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
  "i"
);

const hits = [];
const stats = {
  messages: 0,
  withContent: 0,
  hits: 0,
  bytes: 0,
};

let buf = "";
let inMessages = false;
let messagesStarted = false;
const CHUNK = 8 * 1024 * 1024;

const stream = fs.createReadStream(file, { encoding: "utf8", highWaterMark: CHUNK });

stream.on("data", (chunk) => {
  stats.bytes += Buffer.byteLength(chunk);
  buf += chunk;

  if (!inMessages) {
    const idx = buf.indexOf('"messages"');
    if (idx === -1) {
      // keep tail in case split across chunks
      if (buf.length > 200) buf = buf.slice(-200);
      return;
    }
    const arr = buf.indexOf("[", idx);
    if (arr === -1) return;
    buf = buf.slice(arr + 1);
    inMessages = true;
    messagesStarted = true;
  }

  while (true) {
    // skip whitespace/commas
    buf = buf.replace(/^[\s,]*/, "");
    if (!buf.length) break;
    if (buf[0] === "]") {
      // end of messages array
      stream.destroy();
      return;
    }
    if (buf[0] !== "{") {
      // incomplete or garbage — wait for more
      if (buf.length < 50) break;
      // skip to next object
      const next = buf.indexOf("{");
      if (next === -1) {
        buf = "";
        break;
      }
      buf = buf.slice(next);
    }

    const end = findObjectEnd(buf, 0);
    if (end < 0) break; // need more data

    const objText = buf.slice(0, end);
    buf = buf.slice(end);
    stats.messages++;

    const content = extractField(objText, "content").trim();
    if (!content || content.length < 25) continue;
    stats.withContent++;

    if (!KEYWORD_RE.test(content)) continue;
    stats.hits++;

    const author = extractAuthor(objText);
    const ts = extractField(objText, "timestamp");
    hits.push({
      author,
      timestamp: ts,
      content: content.slice(0, 800),
    });
  }

  if (stats.messages % 5000 === 0 && stats.messages > 0) {
    process.stderr.write(
      `\rscanned ${stats.messages} msgs, ${stats.hits} hits, ${(stats.bytes / 1e6).toFixed(0)} MB...`
    );
  }
});

stream.on("close", () => finish());
stream.on("end", () => finish());
stream.on("error", (err) => {
  console.error(err);
  process.exit(1);
});

let finished = false;
function finish() {
  if (finished) return;
  finished = true;
  process.stderr.write("\n");

  // Deduplicate near-identical content
  const seen = new Set();
  const unique = [];
  for (const h of hits) {
    const key = h.content.slice(0, 120).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(h);
  }

  // Prefer longer advice-y messages
  unique.sort((a, b) => b.content.length - a.content.length);

  const outDir = path.dirname(file);
  const outPath = path.join(outDir, "main-chat-hits.json");
  const top = unique.slice(0, 200);
  fs.writeFileSync(outPath, JSON.stringify({ stats, topCount: top.length, top }, null, 2));

  console.log(
    JSON.stringify(
      {
        file,
        messagesStarted,
        ...stats,
        uniqueHits: unique.length,
        wrote: outPath,
      },
      null,
      2
    )
  );

  // Print a readable sample for the agent
  for (const h of top.slice(0, 40)) {
    console.log("\n---");
    console.log(`[${h.timestamp?.slice(0, 10) || "?"}] ${h.author || "?"}`);
    console.log(h.content);
  }
}
