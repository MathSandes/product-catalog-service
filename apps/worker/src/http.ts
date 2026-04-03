export const FETCH_HEADERS: Record<string, string> = {
  Accept: "application/json",
  "User-Agent": "catalog-enrichment-worker/1.0 (+https://github.com)",
};

export async function fetchWithTimeout(
  url: string,
  ms: number,
  init?: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        ...FETCH_HEADERS,
        ...(init?.headers as Record<string, string> | undefined),
      },
    });
  } finally {
    clearTimeout(t);
  }
}
