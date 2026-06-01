import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../index';

let dataDir: string;
let app: ReturnType<typeof createApp>;
beforeEach(() => { dataDir = mkdtempSync(join(tmpdir(), 'rt-')); app = createApp({ dataDir }); });
afterEach(() => {
  // Close the DB so Windows releases WAL file locks before rmSync
  (app.locals as Record<string, unknown> & { db?: { close(): void } }).db?.close();
  rmSync(dataDir, { recursive: true, force: true });
});

describe('POST /api/auth/setup', () => {
  it('creates the first admin user and returns a session token', async () => {
    const r = await request(app).post('/api/auth/setup').send({ name: 'A', email: 'a@x.com', password: 'pw12345678' });
    expect(r.status).toBe(200);
    expect(r.body.token).toBeDefined();
    expect(r.body.user.email).toBe('a@x.com');
  });
  it('refuses if a user already exists', async () => {
    await request(app).post('/api/auth/setup').send({ name: 'A', email: 'a@x.com', password: 'pw12345678' });
    const r = await request(app).post('/api/auth/setup').send({ name: 'B', email: 'b@x.com', password: 'pw12345678' });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('SETUP_ALREADY_DONE');
  });
});

describe('POST /api/auth/login + GET /api/auth/me + POST /api/auth/logout', () => {
  it('full session lifecycle', async () => {
    await request(app).post('/api/auth/setup').send({ name: 'A', email: 'a@x.com', password: 'pw12345678' });

    const login = await request(app).post('/api/auth/login').send({ email: 'a@x.com', password: 'pw12345678' });
    expect(login.status).toBe(200);
    const token = login.body.token as string;

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.email).toBe('a@x.com');

    const logout = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`);
    expect(logout.status).toBe(200);

    const meAfter = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(meAfter.status).toBe(401);
  });
  it('login with wrong password returns 401', async () => {
    await request(app).post('/api/auth/setup').send({ name: 'A', email: 'a@x.com', password: 'pw12345678' });
    const r = await request(app).post('/api/auth/login').send({ email: 'a@x.com', password: 'wrong' });
    expect(r.status).toBe(401);
  });
  it('logout via Cookie header also deletes the session', async () => {
    await request(app).post('/api/auth/setup').send({ name: 'A', email: 'a@x.com', password: 'pw12345678' });
    const login = await request(app).post('/api/auth/login').send({ email: 'a@x.com', password: 'pw12345678' });
    const token = login.body.token as string;

    // logout via Cookie
    const logout = await request(app).post('/api/auth/logout').set('Cookie', `db_session=${token}`);
    expect(logout.status).toBe(200);

    // session should no longer work — verify via Bearer too
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(401);
  });
});
