/**
 * apiClient.ts — Central fetch wrapper.
 *
 * All API calls should use `apiFetch` so the server URL is configurable
 * at runtime via Settings → API Server URL.
 *
 * Default: empty string (same-origin, relative paths like "/api/...")
 * Override: any value stored under API_BASE_URL_KEY in localStorage,
 *           e.g. "http://192.168.1.10:3001"
 */

export const API_BASE_URL_KEY = "iivo_api_base_url";
export const API_BASE_URL_DEFAULT = "";

/** Returns the configured base URL, trimming trailing slashes. */
export function getApiBaseUrl(): string {
  try {
    const stored = localStorage.getItem(API_BASE_URL_KEY);
    return (stored ?? API_BASE_URL_DEFAULT).replace(/\/+$/, "");
  } catch {
    return API_BASE_URL_DEFAULT;
  }
}

/** Persists a new base URL to localStorage. Pass empty string to restore default. */
export function setApiBaseUrl(url: string): void {
  const trimmed = url.trim().replace(/\/+$/, "");
  if (trimmed === "") {
    localStorage.removeItem(API_BASE_URL_KEY);
  } else {
    localStorage.setItem(API_BASE_URL_KEY, trimmed);
  }
}

/**
 * Drop-in replacement for `fetch` for all `/api/...` calls.
 * Prepends the configured base URL so the app can talk to a remote
 * or non-standard-port server without code changes.
 */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const base = getApiBaseUrl();
  const url = base ? `${base}${path}` : path;
  return fetch(url, init);
}
