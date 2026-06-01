const TOKEN_KEY = 'db_session_token';

export function getToken(): string | null { return localStorage.getItem(TOKEN_KEY); }
export function setToken(t: string | null): void {
  if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY);
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body) headers.set('Content-Type', 'application/json');
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
