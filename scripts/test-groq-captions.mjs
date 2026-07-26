const apiKey = process.argv[2] || process.env.GROQ_API_KEY;
if (!apiKey) {
  console.error("Usage: node scripts/test-groq-captions.mjs <api-key>");
  process.exit(1);
}

const samples = [
  {
    name: "Cuban valuation fight",
    transcript:
      "We are seeking $250,000 for 10 percent of the company. Mark Cuban: Your valuation is insane. You have no revenue and you want a $2.5 million valuation. But we have a patent pending and three big retailers interested. Cuban: Interested is not a purchase order."
  },
  {
    name: "OLeary equity squeeze",
    transcript:
      "I will give you the money but I want 40 percent. That is robbery. Mr Wonderful: Without me you have zero. Take it or leave it. The other sharks are out. I need this deal."
  },
  {
    name: "Emotional founder story",
    transcript:
      "My dad died when I was 12 and I built this company from his garage recipe. We did $1.2 million in sales last year. Barbara Corcoran: I am in. I love the story and the numbers. Kevin O'Leary: The story does not pay the bills but the margin does."
  }
];

function promptFor(transcript) {
  return `You write viral TikTok captions for a US Shark Tank clip account.

Goal: maximize watch time + follows. Caption = CLICKBAIT that teases the ending.
NEVER copy the transcript opening. NEVER start with So/And/Well/You know/Thank you/My name is.
Sound human and punchy — not corporate.

Episode/source: Shark Tank US Season clip
Niche: shark_tank_entrepreneurs

Transcript (CONTEXT only):
"""${transcript}"""

Write:
- hook: one scroll-stopping line (max ~90 chars)
- body: optional second short line (max ~80 chars)
- hashtags: 3-5 niche tags only (no #fyp #viral)

Return JSON only: {"hook":"...","body":"...","hashtags":"#... #..."}`;
}

async function run(sample) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      temperature: 0.9,
      max_tokens: 280,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You write scroll-stopping TikTok caption hooks as JSON. Never copy transcript openers."
        },
        { role: "user", content: promptFor(sample.transcript) }
      ]
    })
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`Groq ${response.status}: ${raw.slice(0, 400)}`);
  }
  const payload = JSON.parse(raw);
  return JSON.parse(payload.choices?.[0]?.message?.content);
}

for (const sample of samples) {
  const out = await run(sample);
  console.log(`\n=== ${sample.name} ===`);
  console.log(`HOOK: ${out.hook}`);
  if (out.body) console.log(`BODY: ${out.body}`);
  console.log(`TAGS: ${out.hashtags}`);
}

console.log(
  "\nJudge: hooks should tease stakes/conflict, not sound like dialogue openers."
);
