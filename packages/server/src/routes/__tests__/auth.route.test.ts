import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../index';
import { _resetAdminTokens } from '../../services/adminAuth';

let dataDir: string;
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'rt-'));
  app = createApp({ dataDir });
  _resetAdminTokens();
});
afterEach(() => {
  (app.locals as Record<string, unknown> & { db?: { close(): void } }).db?.close();
  rmSync(dataDir, { recursive: true, force: true });
  _resetAdminTokens();
});

describe('GET /api/auth/status', () => {
  it('hasAdminPassword=false before setup', async () => {
    const r = await request(app).get('/api/auth/status');
    expect(r.status).toBe(200);
    expect(r.body.hasAdminPassword).toBe(false);
  });
  it('hasAdminPassword=true after setup', async () => {
    await request(app).post('/api/auth/setup').send({ password: 'pw12345678' });
    const r = await request(app).get('/api/auth/status');
    expect(r.body.hasAdminPassword).toBe(true);
  });
});

describe('POST /api/auth/setup', () => {
  it('sets the admin password and returns an admin token', async () => {
    const r = await request(app).post('/api/auth/setup').send({ password: 'pw12345678' });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(typeof r.body.token).toBe('string');
    expect(r.body.token).toMatch(/^admin_/);
  });
  it('rejects passwords shorter than 8 chars', async () => {
    const r = await request(app).post('/api/auth/setup').send({ password: 'short' });
    expect(r.status).toBe(400);
  });
  it('refuses second setup once admin password exists', async () => {
    await request(app).post('/api/auth/setup').send({ password: 'pw12345678' });
    const r = await request(app).post('/api/auth/setup').send({ password: 'another88' });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('SETUP_ALREADY_DONE');
  });
});

describe('POST /api/auth/verify', () => {
  it('returns a token for the correct password', async () => {
    await request(app).post('/api/auth/setup').send({ password: 'pw12345678' });
    const r = await request(app).post('/api/auth/verify').send({ password: 'pw12345678' });
    expect(r.status).toBe(200);
    expect(typeof r.body.token).toBe('string');
  });
  it('returns 401 for a wrong password', async () => {
    await request(app).post('/api/auth/setup').send({ password: 'pw12345678' });
    const r = await request(app).post('/api/auth/verify').send({ password: 'wrong' });
    expect(r.status).toBe(401);
  });
  it('returns 409 if setup has not run', async () => {
    const r = await request(app).post('/api/auth/verify').send({ password: 'whatever1' });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('SETUP_REQUIRED');
  });
});

describe('POST /api/auth/change', () => {
  it('changes the admin password', async () => {
    await request(app).post('/api/auth/setup').send({ password: 'pw12345678' });
    const ok = await request(app).post('/api/auth/change').send({ oldPassword: 'pw12345678', newPassword: 'new87654321' });
    expect(ok.status).toBe(200);
    // verify old now fails
    const oldR = await request(app).post('/api/auth/verify').send({ password: 'pw12345678' });
    expect(oldR.status).toBe(401);
    // verify new works
    const newR = await request(app).post('/api/auth/verify').send({ password: 'new87654321' });
    expect(newR.status).toBe(200);
  });
  it('rejects wrong old password with 401', async () => {
    await request(app).post('/api/auth/setup').send({ password: 'pw12345678' });
    const r = await request(app).post('/api/auth/change').send({ oldPassword: 'wrong___', newPassword: 'new87654321' });
    expect(r.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  it('always returns { user: null } in M1', async () => {
    const r = await request(app).get('/api/auth/me');
    expect(r.status).toBe(200);
    expect(r.body.user).toBeNull();
  });
});
