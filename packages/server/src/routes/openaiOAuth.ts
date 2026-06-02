/**
 * OpenAI OAuth — PKCE flow.
 *
 * Endpoints:
 *   POST   /api/openai-oauth/start     — generate PKCE verifier + challenge + state, return authorize URL
 *   GET    /api/openai-oauth/callback  — receive code + state, exchange for token, popup close
 *   GET    /api/openai-oauth/status    — return connection state
 *   DELETE /api/openai-oauth           — disconnect (clear stored tokens)
 *
 * Storage (settings table):
 *   openai_oauth_access_token, openai_oauth_refresh_token, openai_oauth_expires_at,
 *   openai_oauth_account_id
 *
 * State storage (openai_oauth_state table — migration 007):
 *   state, code_verifier, created_at
 */

import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import type Database from 'better-sqlite3';
import { readSetting, writeSetting, deleteSetting } from '../services/settings.js';
import { invalidateProvider } from '../services/provider.js';
import { requireAdmin } from '../middleware/auth.js';

// ─── PKCE helpers ─────────────────────────────────────────────────────────────

function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

function generateState(): string {
  return crypto.randomBytes(16).toString('base64url');
}

// ─── Config helpers ───────────────────────────────────────────────────────────

function configValue(db: Database.Database, envKey: string, settingsKey: string, fallback?: string): string | null {
  const env = process.env[envKey];
  if (env && env.trim()) return env.trim();
  const stored = readSetting(db, settingsKey);
  if (stored) return stored;
  return fallback ?? null;
}

function getClientId(db: Database.Database): string | null {
  return configValue(db, 'OPENAI_OAUTH_CLIENT_ID', 'openai_oauth_client_id', 'app_EMoamEEZ73f0CkXaXp7hrann');
}

function getAuthorizeUrl(db: Database.Database): string {
  return (
    configValue(db, 'OPENAI_OAUTH_AUTHORIZE_URL', 'openai_oauth_authorize_url') ||
    'https://auth.openai.com/oauth/authorize'
  );
}

function getTokenUrl(db: Database.Database): string {
  return (
    configValue(db, 'OPENAI_OAUTH_TOKEN_URL', 'openai_oauth_token_url') ||
    'https://auth.openai.com/oauth/token'
  );
}

function getScope(db: Database.Database): string {
  return (
    configValue(db, 'OPENAI_OAUTH_SCOPE', 'openai_oauth_scope') ||
    'openid profile email offline_access'
  );
}

function resolveRedirectUri(db: Database.Database, req: Request): string {
  const explicit = configValue(db, 'OPENAI_OAUTH_REDIRECT_URI', 'openai_oauth_redirect_uri');
  if (explicit) return explicit;
  const base = resolvePublicBase(db, req);
  return `${base}/api/openai-oauth/callback`;
}

function resolvePublicBase(db: Database.Database, req: Request): string {
  const explicit = configValue(db, 'PUBLIC_BASE_URL', 'public_base_url');
  if (explicit) return explicit.replace(/\/+$/, '');

  const protoRaw = req.headers['x-forwarded-proto'];
  const hostRaw = req.headers['x-forwarded-host'];
  const proto = (Array.isArray(protoRaw) ? protoRaw[0] : protoRaw)?.split(',')[0]?.trim();
  const host = (Array.isArray(hostRaw) ? hostRaw[0] : hostRaw)?.split(',')[0]?.trim();
  if (proto && host && (proto === 'http' || proto === 'https')) {
    return `${proto}://${host}`;
  }

  const origin = req.headers.origin;
  const originStr = Array.isArray(origin) ? origin[0] : origin;
  if (originStr && /^https?:\/\//i.test(originStr)) {
    try {
      const u = new URL(originStr);
      return `${u.protocol}//${u.host}`;
    } catch { /* fall through */ }
  }

  const host2 = req.get('host') || 'localhost';
  return `${req.protocol}://${host2}`;
}

// ─── State table helpers ──────────────────────────────────────────────────────

interface OAuthStateRow { state: string; code_verifier: string; created_at: string }

function saveOAuthState(db: Database.Database, state: string, codeVerifier: string): void {
  db.prepare(
    'INSERT INTO openai_oauth_state (state, code_verifier) VALUES (?, ?)'
  ).run(state, codeVerifier);
  // Prune states older than 10 minutes to keep the table tidy
  db.prepare(
    "DELETE FROM openai_oauth_state WHERE created_at < datetime('now', '-10 minutes')"
  ).run();
}

function consumeOAuthState(db: Database.Database, state: string): string | null {
  const row = db.prepare(
    'SELECT code_verifier FROM openai_oauth_state WHERE state = ?'
  ).get(state) as Pick<OAuthStateRow, 'code_verifier'> | undefined;
  if (!row) return null;
  db.prepare('DELETE FROM openai_oauth_state WHERE state = ?').run(state);
  return row.code_verifier;
}

// ─── Router factory ───────────────────────────────────────────────────────────

export function buildOpenaiOAuthRouter(db: Database.Database): Router {
  const router = Router();

  /**
   * POST /start
   * Generates PKCE verifier + challenge + state, stores state, returns authorize URL.
   * Requires authentication.
   */
  router.post('/start', requireAdmin, (req: Request, res: Response) => {
    const clientId = getClientId(db);
    if (!clientId) {
      res.status(500).json({ error: 'OPENAI_OAUTH_CLIENT_ID not configured' });
      return;
    }

    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = generateState();

    saveOAuthState(db, state, codeVerifier);

    const redirectUri = resolveRedirectUri(db, req);
    const authorizeBase = getAuthorizeUrl(db);
    const scope = getScope(db);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    const authorizeUrl = `${authorizeBase}?${params.toString()}`;
    res.json({ authorizeUrl, state });
  });

  /**
   * GET /callback
   * Receives code + state from OpenAI OAuth redirect, validates state,
   * exchanges code for token, stores tokens, and renders a popup-close page.
   * No auth required (this is a redirect from OpenAI's auth server).
   */
  router.get('/callback', async (req: Request, res: Response) => {
    const { code, state, error: oauthError } = req.query as Record<string, string>;

    if (oauthError) {
      const msg = encodeURIComponent(String(oauthError));
      res.status(400).send(popupErrorHtml(`OAuth error: ${oauthError}`));
      return;
    }

    if (!code || !state) {
      res.status(400).json({ error: 'Missing code or state' });
      return;
    }

    const codeVerifier = consumeOAuthState(db, state);
    if (!codeVerifier) {
      res.status(400).json({ error: 'Invalid or expired state' });
      return;
    }

    const clientId = getClientId(db);
    if (!clientId) {
      res.status(500).json({ error: 'OPENAI_OAUTH_CLIENT_ID not configured' });
      return;
    }

    const tokenUrl = getTokenUrl(db);
    const redirectUri = resolveRedirectUri(db, req);

    let tokenResp: globalThis.Response;
    try {
      tokenResp = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: clientId,
          code,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier,
        }).toString(),
      });
    } catch (err) {
      const msg = (err as Error)?.message || 'network error';
      console.error('[openai-oauth] token exchange network error:', msg);
      res.status(502).json({ error: `Token exchange failed: ${msg}` });
      return;
    }

    if (!tokenResp.ok) {
      const text = await tokenResp.text().catch(() => '');
      console.error(`[openai-oauth] token exchange failed (${tokenResp.status}): ${text.slice(0, 200)}`);
      res.status(502).json({ error: `Token exchange failed: ${tokenResp.status}` });
      return;
    }

    let data: {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      id_token?: string;
    };
    try {
      data = await tokenResp.json() as typeof data;
    } catch {
      res.status(502).json({ error: 'Malformed token response' });
      return;
    }

    if (!data.access_token) {
      res.status(502).json({ error: 'Token response missing access_token' });
      return;
    }

    writeSetting(db, 'openai_oauth_access_token', data.access_token);
    if (data.refresh_token) {
      writeSetting(db, 'openai_oauth_refresh_token', data.refresh_token);
    }
    if (typeof data.expires_in === 'number' && data.expires_in > 0) {
      const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();
      writeSetting(db, 'openai_oauth_expires_at', expiresAt);
    } else {
      deleteSetting(db, 'openai_oauth_expires_at');
    }

    // Capture account_id from JWT claims if available
    const { extractAccountIdFromJwt } = await import('../services/codexResponsesAdapter.js');
    const accountId =
      extractAccountIdFromJwt(typeof data.id_token === 'string' ? data.id_token : null) ||
      extractAccountIdFromJwt(data.access_token);
    if (accountId) {
      writeSetting(db, 'openai_oauth_account_id', accountId);
    } else {
      deleteSetting(db, 'openai_oauth_account_id');
    }

    invalidateProvider();

    // Close the popup and notify the parent window
    res.send(popupSuccessHtml());
  });

  /**
   * GET /status
   * Returns current OAuth connection state.
   */
  router.get('/status', requireAdmin, (_req: Request, res: Response) => {
    const accessToken = readSetting(db, 'openai_oauth_access_token');
    const expiresAt = readSetting(db, 'openai_oauth_expires_at');
    const clientIdConfigured = !!getClientId(db);
    const accountId = readSetting(db, 'openai_oauth_account_id');
    res.json({
      connected: !!accessToken,
      expiresAt,
      clientIdConfigured,
      accountId,
    });
  });

  /**
   * DELETE /
   * Disconnect — clear all stored OAuth tokens.
   */
  router.delete('/', requireAdmin, (_req: Request, res: Response) => {
    deleteSetting(db, 'openai_oauth_access_token');
    deleteSetting(db, 'openai_oauth_refresh_token');
    deleteSetting(db, 'openai_oauth_expires_at');
    deleteSetting(db, 'openai_oauth_account_id');
    invalidateProvider();
    res.json({ ok: true });
  });

  return router;
}

// ─── Popup HTML helpers ───────────────────────────────────────────────────────

function popupSuccessHtml(): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>授權成功</title></head>
<body>
<p>授權成功，視窗即將關閉…</p>
<script>
  try {
    window.opener && window.opener.postMessage({ source: 'openai-oauth', ok: true }, '*');
  } catch(e) {}
  window.close();
</script>
</body>
</html>`;
}

function popupErrorHtml(msg: string): string {
  const escaped = msg.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>授權失敗</title></head>
<body>
<p>授權失敗：${escaped}</p>
<script>
  try {
    window.opener && window.opener.postMessage({ source: 'openai-oauth', ok: false, error: ${JSON.stringify(msg)} }, '*');
  } catch(e) {}
</script>
</body>
</html>`;
}
