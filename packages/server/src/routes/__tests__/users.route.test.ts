import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../index';

let dataDir: string;
let app: ReturnType<typeof createApp>;
let adminToken: string;
let adminId: string;

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'us-'));
  app = createApp({ dataDir });
  // First user is auto-promoted to admin during setup.
  const r = await request(app).post('/api/auth/setup').send({ name: 'Admin', email: 'admin@x.com', password: 'pw12345678' });
  adminToken = r.body.token as string;
  adminId = r.body.user.id as string;
});

afterEach(() => {
  (app.locals as Record<string, unknown> & { db?: { close(): void } }).db?.close();
  rmSync(dataDir, { recursive: true, force: true });
});

const asAdmin = () => ({ Authorization: `Bearer ${adminToken}` });

async function createSecondUser(role: 'admin' | 'user' = 'user') {
  const r = await request(app).post('/api/users').set(asAdmin())
    .send({ name: 'Bob', email: 'bob@x.com', password: 'pw12345678', role });
  return r.body.user as { id: string; name: string; email: string; role: string };
}

async function loginAs(email: string, password: string): Promise<string> {
  const r = await request(app).post('/api/auth/login').send({ email, password });
  return r.body.token as string;
}

describe('GET /api/users (admin)', () => {
  it('returns the seeded admin user', async () => {
    const r = await request(app).get('/api/users').set(asAdmin());
    expect(r.status).toBe(200);
    expect(r.body.users).toHaveLength(1);
    expect(r.body.users[0].role).toBe('admin');
  });

  it('401 without auth', async () => {
    const r = await request(app).get('/api/users');
    expect(r.status).toBe(401);
  });

  it('403 for non-admin user', async () => {
    await createSecondUser('user');
    const userToken = await loginAs('bob@x.com', 'pw12345678');
    const r = await request(app).get('/api/users').set({ Authorization: `Bearer ${userToken}` });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('FORBIDDEN');
  });
});

describe('POST /api/users (admin creates)', () => {
  it('creates a new user', async () => {
    const r = await request(app).post('/api/users').set(asAdmin())
      .send({ name: 'Bob', email: 'bob@x.com', password: 'pw12345678' });
    expect(r.status).toBe(201);
    expect(r.body.user.email).toBe('bob@x.com');
    expect(r.body.user.role).toBe('user');
  });

  it('400 when password is too short', async () => {
    const r = await request(app).post('/api/users').set(asAdmin())
      .send({ name: 'Bob', email: 'bob@x.com', password: 'short' });
    expect(r.status).toBe(400);
  });

  it('400 when email already exists', async () => {
    await createSecondUser();
    const r = await request(app).post('/api/users').set(asAdmin())
      .send({ name: 'Bob2', email: 'bob@x.com', password: 'pw12345678' });
    expect(r.status).toBe(400);
  });
});

describe('PATCH /api/users/:id/disable + enable', () => {
  it('disables a user and prevents login', async () => {
    const bob = await createSecondUser('user');
    const d = await request(app).patch(`/api/users/${bob.id}/disable`).set(asAdmin());
    expect(d.status).toBe(200);
    const loginAttempt = await request(app).post('/api/auth/login').send({ email: 'bob@x.com', password: 'pw12345678' });
    expect(loginAttempt.status).toBe(401);
  });

  it('re-enables a disabled user', async () => {
    const bob = await createSecondUser('user');
    await request(app).patch(`/api/users/${bob.id}/disable`).set(asAdmin());
    await request(app).patch(`/api/users/${bob.id}/enable`).set(asAdmin());
    const loginAttempt = await request(app).post('/api/auth/login').send({ email: 'bob@x.com', password: 'pw12345678' });
    expect(loginAttempt.status).toBe(200);
  });

  it('400 when admin tries to disable themselves', async () => {
    const r = await request(app).patch(`/api/users/${adminId}/disable`).set(asAdmin());
    expect(r.status).toBe(400);
  });
});

describe('DELETE /api/users/:id', () => {
  it('deletes a non-admin user', async () => {
    const bob = await createSecondUser('user');
    const r = await request(app).delete(`/api/users/${bob.id}`).set(asAdmin());
    expect(r.status).toBe(200);
    const list = await request(app).get('/api/users').set(asAdmin());
    expect(list.body.users.find((u: { id: string }) => u.id === bob.id)).toBeUndefined();
  });

  it('400 when deleting self', async () => {
    const r = await request(app).delete(`/api/users/${adminId}`).set(asAdmin());
    expect(r.status).toBe(400);
  });
});

describe('POST /api/users/transfer-admin', () => {
  it('transfers admin role to another user', async () => {
    const bob = await createSecondUser('user');
    const r = await request(app).post('/api/users/transfer-admin').set(asAdmin())
      .send({ targetUserId: bob.id });
    expect(r.status).toBe(200);
    // Old admin can no longer reach the admin endpoint
    const after = await request(app).get('/api/users').set(asAdmin());
    expect(after.status).toBe(403);
  });

  it('400 when targetUserId is missing', async () => {
    const r = await request(app).post('/api/users/transfer-admin').set(asAdmin()).send({});
    expect(r.status).toBe(400);
  });
});
