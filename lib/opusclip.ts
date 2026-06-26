export type OpusClipProjectInput = {
  sourceUrl?: string;
  caption?: string;
  tone?: string;
};

export type OpusClipPostInput = {
  clipUrl: string;
  caption: string;
  targetAccountId: string;
  scheduleFor?: string;
};

type LiveResult = {
  ok: boolean;
  mode: "live";
  status: number;
  body: string;
};

type MockResult = {
  ok: false;
  mode: "mock";
  message: string;
};

export async function createOpusClipProject(
  input: OpusClipProjectInput
): Promise<LiveResult | MockResult> {
  const apiKey = process.env.OPUSCLIP_API_KEY;
  const baseUrl = process.env.OPUSCLIP_API_BASE_URL;

  if (!apiKey || !baseUrl) {
    return {
      ok: false,
      mode: "mock",
      message:
        "OPUSCLIP_API_KEY or OPUSCLIP_API_BASE_URL is not set, so this project is running in mock mode."
    };
  }

  const response = await fetch(`${baseUrl}/api/project/create`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  return {
    ok: response.ok,
    mode: "live",
    status: response.status,
    body: await response.text()
  };
}

export async function publishOpusClipPost(
  input: OpusClipPostInput
): Promise<LiveResult | MockResult> {
  const apiKey = process.env.OPUSCLIP_API_KEY;
  const baseUrl = process.env.OPUSCLIP_API_BASE_URL;

  if (!apiKey || !baseUrl) {
    return {
      ok: false,
      mode: "mock",
      message:
        "OPUSCLIP_API_KEY or OPUSCLIP_API_BASE_URL is not set, so publishing is running in mock mode."
    };
  }

  const response = await fetch(`${baseUrl}/api/post-tasks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  return {
    ok: response.ok,
    mode: "live",
    status: response.status,
    body: await response.text()
  };
}
