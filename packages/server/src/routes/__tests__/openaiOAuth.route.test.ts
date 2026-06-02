import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../index';
import { setupAdmin, asAdmin } from './_helpers';
import { _resetAdminTokens } from '../../services/adminAuth';

let dataDir: string;
let app: ReturnType<typeof createApp>;
let token: string;

beforeEach(async () => {
  _resetAdminTokens();
  dataDir = mkdtempSync(join(tmpdir(), 'oauth-'));
  app = createApp({ dataDir });
  token = await setupAdmin(app);
});

afterEach(() => {
  (app.locals as Record<string, unknown> & { db?: { close(): void } }).db?.close();
  rmSync(dataDir, { recursive: true, force: true });
  _resetAdminTokens();
});

const auth = () => asAdmin(token);

describe('OpenAI OAuth routes', () => {
  it('POST /api/openai-oauth/start returns authorize URL with state+PKCE', async () => {
    const r = await request(app).post('/api/openai-oauth/start').set(auth());
    expect(r.status).toBe(200);
    expect(r.body.authorizeUrl).toContain('code_challenge=');
    expect(r.body.authorizeUrl).toContain('state=');
  });

  it('GET /api/openai-oauth/status returns connected:false when no token', async () => {
    const r = await request(app).get('/api/openai-oauth/status').set(auth());
    expect(r.status).toBe(200);
    expect(r.body.connected).toBe(false);
  });

  it('GET /api/openai-oauth/status returns connected:true after token in settings', async () => {
    const db = (app.locals as Record<string, unknown> & { db?: { prepare: (sql: string) => { run: (...args: unknown[]) => void } } }).db;
    db!.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('openai_oauth_access_token', 'sk-fake-test-token');
    const r = await request(app).get('/api/openai-oauth/status').set(auth());
    expect(r.status).toBe(200);
    expect(r.body.connected).toBe(true);
  });

  it('DELETE /api/openai-oauth removes the token', async () => {
    const db = (app.locals as Record<string, unknown> & { db?: { prepare: (sql: string) => { run: (...args: unknown[]) => void; get: (...args: unknown[]) => unknown } } }).db;
    db!.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('openai_oauth_access_token', 'sk-fake');
    const r = await request(app).delete('/api/openai-oauth').set(auth());
    expect(r.status).toBe(200);
    const row = db!.prepare('SELECT value FROM settings WHERE key=?').get('openai_oauth_access_token');
    expect(row).toBeUndefined();
  });

  it('GET /api/openai-oauth/callback with unknown state returns 400', async () => {
    const r = await request(app).get('/api/openai-oauth/callback?code=abc&state=unknown');
    expect(r.status).toBe(400);
  });
});
