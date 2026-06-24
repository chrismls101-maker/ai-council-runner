/**
 * Live connection test for custom OpenAI-compatible providers (main process).
 */

async function probeUrl(
  url: string,
  apiKey: string,
  method: "GET" | "POST",
  body?: string,
): Promise<Response> {
  return fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body,
    signal: AbortSignal.timeout(12_000),
  });
}

export async function testProviderConnection(input: {
  baseUrl: string;
  apiKey: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const baseUrl = input.baseUrl.trim().replace(/\/+$/, "");
  const apiKey = input.apiKey.trim();
  if (!baseUrl || !apiKey) {
    return { ok: false, error: "Base URL and API key are required." };
  }

  const attempts: Array<{ url: string; method: "GET" | "POST"; body?: string }> = [
    { url: `${baseUrl}/models`, method: "GET" },
    {
      url: `${baseUrl}/chat/completions`,
      method: "POST",
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 1,
        messages: [{ role: "user", content: "." }],
      }),
    },
  ];

  let lastStatus: number | null = null;
  for (const attempt of attempts) {
    try {
      const res = await probeUrl(attempt.url, apiKey, attempt.method, attempt.body);
      if (res.ok) return { ok: true };
      lastStatus = res.status;
      if (res.status === 401 || res.status === 403) {
        return { ok: false, error: "Key not recognized — check it and try again" };
      }
      if (res.status === 404) continue;
      if (res.status >= 400 && res.status < 500) {
        return { ok: false, error: `Connection failed (${res.status})` };
      }
    } catch {
      /* try next endpoint */
    }
  }

  if (lastStatus === 404) {
    return { ok: false, error: "Provider endpoint not found — check the base URL" };
  }
  return { ok: false, error: "Could not reach provider — check the base URL" };
}
