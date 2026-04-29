/**
 * OpenAI OAuth PKCE flow.
 *
 * Endpoints:
 *   POST /api/openai-oauth/start     — start a flow; returns { authorizeUrl, state }
 *   GET  /api/openai-oauth/callback  — OAuth redirect target; exchanges code → tokens; stores to settings
 *   GET  /api/openai-oauth/status    — return connection state
 *   DELETE /api/openai-oauth         — disconnect (clear stored tokens)
 *
 * Configuration (env-first, settings fallback):
 *   OPENAI_OAUTH_CLIENT_ID       — public OAuth client_id (REQUIRED)
 *   OPENAI_OAUTH_AUTHORIZE_URL   — defaults to https://auth.openai.com/authorize
 *   OPENAI_OAUTH_TOKEN_URL       — defaults to https://auth.openai.com/token
 *   OPENAI_OAUTH_SCOPE           — defaults to "openid profile email offline_access"
 *   OPENAI_OAUTH_REDIRECT_URI    — defaults to <PUBLIC_BASE_URL>/api/openai-oauth/callback
 *   PUBLIC_BASE_URL              — used to build the redirect_uri default
 *
 * Storage (settings table):
 *   openai_oauth_access_token, openai_oauth_refresh_token, openai_oauth_expires_at,
 *   openai_oauth_pending_state, openai_oauth_pending_verifier (cleared after exchange)
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
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

function getAuthorizeUrl(): string {
  return configValue('OPENAI_OAUTH_AUTHORIZE_URL', 'openai_oauth_authorize_url', 'https://auth.openai.com/authorize')!;
}

function getTokenUrl(): string {
  return configValue('OPENAI_OAUTH_TOKEN_URL', 'openai_oauth_token_url', 'https://auth.openai.com/token')!;
}

function getScope(): string {
  return configValue('OPENAI_OAUTH_SCOPE', 'openai_oauth_scope', 'openid profile email offline_access')!;
}

function getRedirectUri(req: Request): string {
  const explicit = configValue('OPENAI_OAUTH_REDIRECT_URI', 'openai_oauth_redirect_uri');
  if (explicit) return explicit;
  const publicBase = configValue('PUBLIC_BASE_URL', 'public_base_url');
  const base = publicBase || `${req.protocol}://${req.get('host')}`;
  return `${base.replace(/\/+$/, '')}/api/openai-oauth/callback`;
}

function base64Url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pkceVerifier(): string {
  return base64Url(crypto.randomBytes(32));
}

function pkceChallenge(verifier: string): string {
  return base64Url(crypto.createHash('sha256').update(verifier).digest());
}

router.post('/start', (req: Request, res: Response) => {
  const clientId = getClientId();
  if (!clientId) {
    return res.status(400).json({
      error: 'OAuth not configured',
      detail: 'Set OPENAI_OAUTH_CLIENT_ID env var (or save it via PUT /api/settings as openai_oauth_client_id).',
    });
  }

  const verifier = pkceVerifier();
  const challenge = pkceChallenge(verifier);
  const state = base64Url(crypto.randomBytes(16));

  setSetting('openai_oauth_pending_state', state);
  setSetting('openai_oauth_pending_verifier', verifier);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: getRedirectUri(req),
    scope: getScope(),
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });

  const authorizeUrl = `${getAuthorizeUrl()}?${params.toString()}`;
  return res.json({ authorizeUrl, state });
});

router.get('/callback', async (req: Request, res: Response) => {
  const code = (req.query.code as string) || '';
  const state = (req.query.state as string) || '';
  const errorParam = (req.query.error as string) || '';

  if (errorParam) {
    return res
      .status(400)
      .send(`<html><body><h2>OpenAI OAuth error</h2><pre>${escapeHtml(errorParam)}</pre><script>window.opener?.postMessage({ source: 'openai-oauth', ok: false, error: ${JSON.stringify(errorParam)} }, '*'); setTimeout(() => window.close(), 1500);</script></body></html>`);
  }

  if (!code || !state) {
    return res.status(400).send('Missing code or state');
  }

  const expectedState = getSetting('openai_oauth_pending_state');
  const verifier = getSetting('openai_oauth_pending_verifier');
  if (!expectedState || !verifier || state !== expectedState) {
    return res.status(400).send('State mismatch — possible CSRF. Restart the OAuth flow.');
  }

  const clientId = getClientId();
  if (!clientId) {
    return res.status(400).send('OAuth client_id not configured.');
  }

  try {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      code,
      redirect_uri: getRedirectUri(req),
      code_verifier: verifier,
    });

    const tokenResp = await fetch(getTokenUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    const text = await tokenResp.text();
    if (!tokenResp.ok) {
      return res.status(502).send(`<html><body><h2>Token exchange failed</h2><pre>${escapeHtml(text.slice(0, 1000))}</pre></body></html>`);
    }

    let tokens: any;
    try { tokens = JSON.parse(text); } catch {
      return res.status(502).send(`<html><body><h2>Token response not JSON</h2><pre>${escapeHtml(text.slice(0, 500))}</pre></body></html>`);
    }

    const accessToken = tokens.access_token;
    const refreshToken = tokens.refresh_token;
    const expiresIn = typeof tokens.expires_in === 'number' ? tokens.expires_in : null;

    if (!accessToken) {
      return res.status(502).send('Token response missing access_token');
    }

    setSetting('openai_oauth_access_token', String(accessToken));
    if (refreshToken) setSetting('openai_oauth_refresh_token', String(refreshToken));
    if (expiresIn) {
      const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
      setSetting('openai_oauth_expires_at', expiresAt);
    }

    deleteSetting('openai_oauth_pending_state');
    deleteSetting('openai_oauth_pending_verifier');
    invalidateProvider();

    return res.send(`<html><body>
      <h2>OpenAI OAuth connected</h2>
      <p>You can close this window.</p>
      <script>
        window.opener?.postMessage({ source: 'openai-oauth', ok: true }, '*');
        setTimeout(() => window.close(), 1000);
      </script>
    </body></html>`);
  } catch (err: any) {
    return res.status(500).send(`<html><body><h2>OAuth callback failed</h2><pre>${escapeHtml(err?.message || String(err))}</pre></body></html>`);
  }
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
  deleteSetting('openai_oauth_pending_state');
  deleteSetting('openai_oauth_pending_verifier');
  invalidateProvider();
  return res.json({ ok: true });
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default router;
