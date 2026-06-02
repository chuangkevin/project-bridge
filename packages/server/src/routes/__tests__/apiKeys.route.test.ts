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

const VALID_KEY_A = 'AIzaSyA' + 'a'.repeat(33);
const VALID_KEY_B = 'AIzaSyB' + 'b'.repeat(33);
const VALID_KEY_C = 'AIzaSyC' + 'c'.repeat(33);

beforeEach(async () => {
  _resetAdminTokens();
  dataDir = mkdtempSync(join(tmpdir(), 'ak-'));
  app = createApp({ dataDir });
  token = await setupAdmin(app);
});

afterEach(() => {
  (app.locals as Record<string, unknown> & { db?: { close(): void } }).db?.close();
  rmSync(dataDir, { recursive: true, force: true });
  _resetAdminTokens();
});

const auth = () => asAdmin(token);

describe('GET /api/settings/api-keys', () => {
  it('returns empty list when no keys are configured', async () => {
    const r = await request(app).get('/api/settings/api-keys').set(auth());
    expect(r.status).toBe(200);
    expect(r.body.keys).toEqual([]);
  });

  it('lists keys with stats after adding one', async () => {
    await request(app).post('/api/settings/api-keys').set(auth()).send({ apiKey: VALID_KEY_A });
    const r = await request(app).get('/api/settings/api-keys').set(auth());
    expect(r.status).toBe(200);
    expect(r.body.keys).toHaveLength(1);
    expect(r.body.keys[0].suffix).toBe(VALID_KEY_A.slice(-8));
    expect(r.body.keys[0].fromEnv).toBe(false);
    expect(r.body.keys[0].today).toEqual({ calls: 0, tokens: 0 });
    expect(r.body.keys[0].total).toEqual({ calls: 0, tokens: 0 });
  });
});

describe('POST /api/settings/api-keys (single)', () => {
  it('adds a valid key', async () => {
    const r = await request(app).post('/api/settings/api-keys').set(auth()).send({ apiKey: VALID_KEY_A });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
  });

  it('400 on bad format', async () => {
    const r = await request(app).post('/api/settings/api-keys').set(auth()).send({ apiKey: 'not-a-key' });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('409 on duplicate', async () => {
    await request(app).post('/api/settings/api-keys').set(auth()).send({ apiKey: VALID_KEY_A });
    const r = await request(app).post('/api/settings/api-keys').set(auth()).send({ apiKey: VALID_KEY_A });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('DUPLICATE');
  });

});

describe('POST /api/settings/api-keys/batch', () => {
  it('adds multiple valid keys, skipping malformed lines', async () => {
    const text = [VALID_KEY_A, 'not-a-key', VALID_KEY_B, '', '  '].join('\n');
    const r = await request(app).post('/api/settings/api-keys/batch').set(auth()).send({ text });
    expect(r.status).toBe(200);
    expect(r.body.added).toBe(2);
    expect(r.body.skipped).toBe(1);
  });

  it('400 when no valid keys are found', async () => {
    const r = await request(app).post('/api/settings/api-keys/batch').set(auth()).send({ text: 'foo\nbar' });
    expect(r.status).toBe(400);
  });

  it('reports zero added when all keys already exist', async () => {
    await request(app).post('/api/settings/api-keys').set(auth()).send({ apiKey: VALID_KEY_A });
    const r = await request(app).post('/api/settings/api-keys/batch').set(auth()).send({ text: VALID_KEY_A });
    expect(r.status).toBe(200);
    expect(r.body.added).toBe(0);
  });
});

describe('DELETE /api/settings/api-keys/:suffix', () => {
  it('removes an existing key', async () => {
    await request(app).post('/api/settings/api-keys').set(auth()).send({ apiKey: VALID_KEY_C });
    const d = await request(app).delete(`/api/settings/api-keys/${VALID_KEY_C.slice(-8)}`).set(auth());
    expect(d.status).toBe(200);
    const list = await request(app).get('/api/settings/api-keys').set(auth());
    expect(list.body.keys).toHaveLength(0);
  });

  it('404 for unknown suffix', async () => {
    const r = await request(app).delete('/api/settings/api-keys/zzzzzzzz').set(auth());
    expect(r.status).toBe(404);
  });
});
