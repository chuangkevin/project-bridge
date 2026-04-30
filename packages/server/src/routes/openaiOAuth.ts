/**
 * OpenAI OAuth — local helper flow.
 *
 * Background: the Codex CLI public client_id (`app_EMoamEEZ73f0CkXaXp7hrann`) only accepts
 * `http://localhost:1455/auth/callback` as a redirect_uri. Hosted servers can't receive the
 * callback directly, so users download a small Node helper from this server, run it on
 * their own machine, and the helper POSTs the resulting tokens back here.
 *
 * Endpoints:
 *   GET    /api/openai-oauth/helper  — download zero-dep Node helper (server URL baked in)
 *   GET    /api/openai-oauth/helper.cmd  — Windows wrapper that runs the helper
 *   GET    /api/openai-oauth/helper.sh   — POSIX wrapper that runs the helper
 *   POST   /api/openai-oauth/token   — store tokens captured by the local helper
 *   GET    /api/openai-oauth/status  — return connection state
 *   DELETE /api/openai-oauth         — disconnect (clear stored tokens)
 *
 * Storage (settings table):
 *   openai_oauth_access_token, openai_oauth_refresh_token, openai_oauth_expires_at
 */

import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import db from '../db/connection';
import { invalidateProvider } from '../services/provider';

const router = Router();

interface SettingsRow { value?: string }

function getSetting(key: string): string | null {
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as SettingsRow | undefined;
    const v = row?.value?.trim();
    return v && v.length > 0 ? v : null;
  } catch { return null; }
}

function setSetting(key: string, value: string): void {
  db.prepare(
    "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
  ).run(key, value);
}

function deleteSetting(key: string): void {
  db.prepare('DELETE FROM settings WHERE key = ?').run(key);
}

function configValue(envKey: string, settingsKey: string, fallback?: string): string | null {
  const env = process.env[envKey];
  if (env && env.trim()) return env.trim();
  const stored = getSetting(settingsKey);
  if (stored) return stored;
  return fallback ?? null;
}

function getClientId(): string | null {
  return configValue('OPENAI_OAUTH_CLIENT_ID', 'openai_oauth_client_id');
}

function originFromForwardedHeaders(req: Request): string | null {
  const protoRaw = req.headers['x-forwarded-proto'];
  const hostRaw = req.headers['x-forwarded-host'];
  const proto = (Array.isArray(protoRaw) ? protoRaw[0] : protoRaw)?.split(',')[0]?.trim();
  const host = (Array.isArray(hostRaw) ? hostRaw[0] : hostRaw)?.split(',')[0]?.trim();
  if (!proto || !host) return null;
  if (proto !== 'http' && proto !== 'https') return null;
  return `${proto}://${host}`;
}

function originFromUrlHeader(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string' || !/^https?:\/\//i.test(raw)) return null;
  try {
    const u = new URL(raw);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

/**
 * Resolve the public URL the user's browser used to reach this server, so it
 * can be baked into the downloadable helper. The helper runs on the user's
 * local machine and POSTs tokens back here, so the URL must be reachable from
 * outside this process — `req.get('host')` alone is wrong behind a reverse
 * proxy (it'll return the upstream HTTP loopback like `localhost:3001`).
 *
 * Returns the URL plus a `source` tag describing which signal won, so the
 * helper download endpoint can echo it in a debug header for ops to verify.
 */
function resolveServerUrl(req: Request): { url: string; source: string } {
  // 1. Explicit override wins. Set PUBLIC_BASE_URL in prod to bypass sniffing.
  const explicit = configValue('PUBLIC_BASE_URL', 'public_base_url');
  if (explicit) return { url: explicit.replace(/\/+$/, ''), source: 'PUBLIC_BASE_URL' };

  // 2. Reverse-proxy headers. nginx/traefik terminate TLS and forward as HTTP;
  //    these carry the user-facing scheme + host.
  const forwarded = originFromForwardedHeaders(req);
  if (forwarded) return { url: forwarded.replace(/\/+$/, ''), source: 'x-forwarded-*' };

  // 3. Origin header — set on fetch/XHR from the SPA settings page.
  const origin = originFromUrlHeader(req.headers.origin);
  if (origin) return { url: origin.replace(/\/+$/, ''), source: 'origin-header' };

  // 4. Referer — set by browsers on plain anchor clicks (the helper download
  //    link is a top-level navigation that doesn't get Origin, but does get
  //    Referer pointing back at the settings page).
  const referer = originFromUrlHeader(req.headers.referer);
  if (referer) return { url: referer.replace(/\/+$/, ''), source: 'referer-header' };

  // 5. Last resort: the request as-received. Correct for local dev; in prod
  //    without any of the above it'll bake the upstream loopback URL — that's
  //    a deploy misconfiguration (set PUBLIC_BASE_URL).
  const host = req.get('host') || 'localhost';
  return { url: `${req.protocol}://${host}`.replace(/\/+$/, ''), source: 'host-header' };
}

const LOOPBACK_HOST_RE = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[?::1\]?)(:\d+)?$/i;

function isLoopback(url: string): boolean {
  return LOOPBACK_HOST_RE.test(url);
}

const HELPER_FILENAME = 'openai-auth-helper.js';

function loadHelperTemplate(): string {
  const candidates = [
    path.resolve(__dirname, '..', 'assets', HELPER_FILENAME),
    path.resolve(__dirname, '..', '..', 'src', 'assets', HELPER_FILENAME),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
    } catch { /* try next */ }
  }
  throw new Error(`openai-auth-helper.js not found. Looked in: ${candidates.join(', ')}`);
}

function buildHelperJs(req: Request): { js: string; serverUrl: string; source: string } {
  const template = loadHelperTemplate();
  const { url: serverUrl, source } = resolveServerUrl(req);

  if (isLoopback(serverUrl) && source !== 'host-header') {
    // Won the resolver round but is still loopback — almost always a misconfig.
    console.warn(
      `[openai-oauth] helper download baked loopback URL "${serverUrl}" (source: ${source}). ` +
      `Set PUBLIC_BASE_URL to the public URL the user's browser uses, otherwise the helper ` +
      `will hit ECONNREFUSED when uploading tokens back from a different machine.`
    );
  } else if (isLoopback(serverUrl)) {
    // Resolved purely from Host — fine in local dev, suspect in prod.
    console.warn(
      `[openai-oauth] helper download baked loopback URL "${serverUrl}" — only the Host ` +
      `header was available. If this is a prod deploy, set PUBLIC_BASE_URL or fix the reverse ` +
      `proxy to forward X-Forwarded-Proto / X-Forwarded-Host.`
    );
  }

  // Replace the literal sentinel string. The helper guards against unreplaced placeholders.
  const js = template.replace(/__PROJECT_BRIDGE_SERVER__/g, serverUrl);
  return { js, serverUrl, source };
}

router.get('/helper', (req: Request, res: Response) => {
  try {
    const { js, serverUrl, source } = buildHelperJs(req);
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${HELPER_FILENAME}"`);
    res.setHeader('Cache-Control', 'no-store');
    // Echo the baked URL so ops can verify with `curl -I` what got embedded
    // before debugging an ECONNREFUSED on the user side.
    res.setHeader('X-Helper-Server-Url', serverUrl);
    res.setHeader('X-Helper-Server-Url-Source', source);
    return res.send(js);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to build helper' });
  }
});

router.get('/helper.cmd', (req: Request, res: Response) => {
  // Windows wrapper. User downloads both files into the same folder; double-clicking
  // this .cmd shells out to node on the helper.js next to it.
  const cmd = [
    '@echo off',
    'setlocal',
    'cd /d "%~dp0"',
    'where node >nul 2>nul',
    'if errorlevel 1 (',
    '  echo Node.js is required. Install from https://nodejs.org/ and try again.',
    '  pause',
    '  exit /b 1',
    ')',
    `node "%~dp0${HELPER_FILENAME}" %*`,
    'echo.',
    'pause',
  ].join('\r\n') + '\r\n';
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', 'attachment; filename="openai-auth-helper.cmd"');
  res.setHeader('Cache-Control', 'no-store');
  // Echo the resolver result so ops can verify wrapper + helper agree.
  const { url: serverUrl, source } = resolveServerUrl(req);
  res.setHeader('X-Helper-Server-Url', serverUrl);
  res.setHeader('X-Helper-Server-Url-Source', source);
  return res.send(cmd);
});

router.get('/helper.sh', (req: Request, res: Response) => {
  const sh = [
    '#!/usr/bin/env bash',
    'set -e',
    'cd "$(dirname "$0")"',
    'if ! command -v node >/dev/null 2>&1; then',
    '  echo "Node.js is required. Install from https://nodejs.org/ and try again." >&2',
    '  exit 1',
    'fi',
    `exec node "$(dirname "$0")/${HELPER_FILENAME}" "$@"`,
  ].join('\n') + '\n';
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', 'attachment; filename="openai-auth-helper.sh"');
  res.setHeader('Cache-Control', 'no-store');
  const { url: serverUrl, source } = resolveServerUrl(req);
  res.setHeader('X-Helper-Server-Url', serverUrl);
  res.setHeader('X-Helper-Server-Url-Source', source);
  return res.send(sh);
});

router.post('/token', (req: Request, res: Response) => {
  const { access_token, refresh_token, expires_in, expires_at } = req.body || {};
  if (!access_token || typeof access_token !== 'string') {
    return res.status(400).json({ error: 'Missing access_token' });
  }

  setSetting('openai_oauth_access_token', access_token);
  if (refresh_token && typeof refresh_token === 'string') {
    setSetting('openai_oauth_refresh_token', refresh_token);
  }
  if (typeof expires_at === 'string') {
    setSetting('openai_oauth_expires_at', expires_at);
  } else if (typeof expires_in === 'number' && expires_in > 0) {
    const at = new Date(Date.now() + expires_in * 1000).toISOString();
    setSetting('openai_oauth_expires_at', at);
  } else {
    deleteSetting('openai_oauth_expires_at');
  }

  invalidateProvider();
  return res.json({ ok: true });
});

router.get('/status', (_req: Request, res: Response) => {
  const accessToken = getSetting('openai_oauth_access_token');
  const expiresAt = getSetting('openai_oauth_expires_at');
  const clientIdConfigured = !!getClientId();
  return res.json({
    connected: !!accessToken,
    expiresAt,
    clientIdConfigured,
  });
});

router.delete('/', (_req: Request, res: Response) => {
  deleteSetting('openai_oauth_access_token');
  deleteSetting('openai_oauth_refresh_token');
  deleteSetting('openai_oauth_expires_at');
  invalidateProvider();
  return res.json({ ok: true });
});

export default router;
