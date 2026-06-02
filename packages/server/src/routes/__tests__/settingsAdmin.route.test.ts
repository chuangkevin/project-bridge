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
  dataDir = mkdtempSync(join(tmpdir(), 'sa-'));
  app = createApp({ dataDir });
  token = await setupAdmin(app);
});
afterEach(() => {
  (app.locals as Record<string, unknown> & { db?: { close(): void } }).db?.close();
  rmSync(dataDir, { recursive: true, force: true });
  _resetAdminTokens();
});

const auth = () => asAdmin(token);

describe('GET /api/settings/:key', () => {
  it('returns present: false for an unset non-secret key', async () => {
    const r = await request(app).get('/api/settings/gemini_model').set(auth());
    expect(r.status).toBe(200);
    expect(r.body.present).toBe(false);
    expect(r.body.value).toBeNull();
  });

  it('returns present: true with masked value for secret key after PUT', async () => {
    await request(app).put('/api/settings/gemini_api_keys').set(auth())
      .send({ value: 'AIzaSy_longkey_abc123xyz' });
    const r = await request(app).get('/api/settings/gemini_api_keys').set(auth());
    expect(r.status).toBe(200);
    expect(r.body.present).toBe(true);
    // Value should be masked, not the original
    expect(r.body.value).not.toBe('AIzaSy_longkey_abc123xyz');
    expect(r.body.value).toContain('••••');
  });

  it('returns plain value for non-secret key', async () => {
    await request(app).put('/api/settings/gemini_model').set(auth())
      .send({ value: 'gemini-2.5-flash' });
    const r = await request(app).get('/api/settings/gemini_model').set(auth());
    expect(r.status).toBe(200);
    expect(r.body.value).toBe('gemini-2.5-flash');
  });

  it('400 on disallowed key', async () => {
    const r = await request(app).get('/api/settings/admin_password').set(auth());
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('401 without auth', async () => {
    const r = await request(app).get('/api/settings/gemini_model');
    expect(r.status).toBe(401);
  });
});

describe('PUT /api/settings/:key', () => {
  it('writes value and returns ok', async () => {
    const r = await request(app).put('/api/settings/gemini_model').set(auth())
      .send({ value: 'gemini-2.0-flash' });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    // Verify it's stored
    const g = await request(app).get('/api/settings/gemini_model').set(auth());
    expect(g.body.present).toBe(true);
    expect(g.body.value).toBe('gemini-2.0-flash');
  });

  it('400 on non-writable key', async () => {
    const r = await request(app).put('/api/settings/openai_oauth_access_token').set(auth())
      .send({ value: 'secret' });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('400 when value is not a string', async () => {
    const r = await request(app).put('/api/settings/gemini_model').set(auth())
      .send({ value: 42 });
    expect(r.status).toBe(400);
  });

  it('401 without auth', async () => {
    const r = await request(app).put('/api/settings/gemini_model').send({ value: 'x' });
    expect(r.status).toBe(401);
  });
});

describe('DELETE /api/settings/:key', () => {
  it('removes a previously set key', async () => {
    await request(app).put('/api/settings/gemini_model').set(auth()).send({ value: 'x' });
    const d = await request(app).delete('/api/settings/gemini_model').set(auth());
    expect(d.status).toBe(200);
    expect(d.body.ok).toBe(true);
    const g = await request(app).get('/api/settings/gemini_model').set(auth());
    expect(g.body.present).toBe(false);
  });

  it('400 on non-writable key', async () => {
    const r = await request(app).delete('/api/settings/openai_oauth_access_token').set(auth());
    expect(r.status).toBe(400);
  });

  it('401 without auth', async () => {
    const r = await request(app).delete('/api/settings/gemini_model');
    expect(r.status).toBe(401);
  });
});

describe('POST /api/settings/_reload-provider', () => {
  it('returns ok', async () => {
    const r = await request(app).post('/api/settings/_reload-provider').set(auth());
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
  });
});
