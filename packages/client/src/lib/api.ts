/**
 * Client API helpers (M1 anonymous mode).
 *
 * - `api()` is the default — no Authorization header. Use it for every public
 *   endpoint (projects, turns, facts, skills, mcp, plugins, ingest, chat, etc.).
 * - `apiAdmin()` adds the admin Bearer token from sessionStorage. Use it for
 *   the Settings admin operations (POST/PUT/DELETE on api-keys / opencode /
 *   mcp servers / users / openai-oauth).
 *
 * Tokens:
 *   - `getAdminToken()` returns the in-flight admin session token (issued by
 *     POST /api/auth/verify, stored in sessionStorage so it dies with the tab).
 *   - `setAdminToken()` is called from the Settings password prompt; clearing
 *     by passing `null` is equivalent to "log out of admin mode".
 *
 * The legacy `getToken()` / `setToken()` exports remain for any code that
 * still imports them, but they now wrap the admin token slot — there is no
 * separate per-user session in M1.
 */

const ADMIN_TOKEN_KEY = 'designbridge.admin_token';

export function getAdminToken(): string | null {
  return sessionStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminToken(t: string | null): void {
  if (t) sessionStorage.setItem(ADMIN_TOKEN_KEY, t);
  else sessionStorage.removeItem(ADMIN_TOKEN_KEY);
}

/** Back-compat aliases. Old callers expecting a single token use the admin slot. */
export const getToken = getAdminToken;
export const setToken = setAdminToken;

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  const r = await fetch(path, { ...init, headers });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new ApiError(r.status, body.error?.code ?? 'UNKNOWN', body.error?.message ?? r.statusText);
  }
  return r.json() as Promise<T>;
}

/**
 * Same as `api()` but adds the admin Bearer token. Use for admin-only Settings
 * operations. If no admin token is present, the request still goes out (server
 * will respond 401, callers should handle by surfacing a "please log in as
 * admin" message).
 */
export async function apiAdmin<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  const token = getAdminToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const r = await fetch(path, { ...init, headers });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new ApiError(r.status, body.error?.code ?? 'UNKNOWN', body.error?.message ?? r.statusText);
  }
  return r.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}
