export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || "/api/backend";
const BASE = API_BASE;

/**
 * Builds a safe error for a failed response. Never echoes a raw HTML/text body
 * into the thrown message — an error page (e.g. a 404 or a redirect to an HTML
 * login page) can embed sensitive data such as the session token in its
 * serialized payload. Only a JSON `error`/`message` field is surfaced.
 */
async function responseError(res: Response): Promise<Error> {
  let detail = "";
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      const body = (await res.json()) as { error?: string; message?: string };
      detail = body.error ?? body.message ?? "";
    } catch {
      // ignore malformed JSON
    }
  }
  return new Error(detail ? `${res.status}: ${detail}` : `Request failed (${res.status})`);
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) throw await responseError(res);
  return res.json() as Promise<T>;
}

export async function apiUpload<T>(path: string, body: FormData): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: "POST", body });
  if (!res.ok) throw await responseError(res);
  return res.json() as Promise<T>;
}
