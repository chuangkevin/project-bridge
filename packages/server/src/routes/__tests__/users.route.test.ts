/**
 * Users router tests (M1 anonymous mode).
 *
 * In M1 the site is anonymous; the users router is preserved for operators
 * who still want to manage the legacy users table from Settings. All endpoints
 * require the admin token. Per-user login no longer exists, so the previous
 * tests around login-after-disable / transfer-admin-then-403 are obsolete.
 */

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
  dataDir = mkdtempSync(join(tmpdir(), 'us-'));
  app = createApp({ dataDir });
  token = await setupAdmin(app);
});

afterEach(() => {
  (app.locals as Record<string, unknown> & { db?: { close(): void } }).db?.close();
  rmSync(dataDir, { recursive: true, force: true });
  _resetAdminTokens();
});

const headers = () => asAdmin(token);

async function createUser(role: 'admin' | 'user' = 'user', email = 'bob@x.com') {
  const r = await request(app).post('/api/users').set(headers())
    .send({ name: 'Bob', email, password: 'pw12345678', role });
  return r.body.user as { id: string; name: string; email: string; role: string };
}

describe('GET /api/users (admin)', () => {
  it('starts empty (M1 has no auto-seeded user)', async () => {
    const r = await request(app).get('/api/users').set(headers());
    expect(r.status).toBe(200);
    expect(r.body.users).toEqual([]);
  });

  it('401 without admin token', async () => {
    const r = await request(app).get('/api/users');
    expect(r.status).toBe(401);
  });

  it('lists users after admin creates them', async () => {
    await createUser('user');
    const r = await request(app).get('/api/users').set(headers());
    expect(r.body.users).toHaveLength(1);
    expect(r.body.users[0].email).toBe('bob@x.com');
  });
});

describe('POST /api/users (admin creates)', () => {
  it('creates a new user', async () => {
    const r = await request(app).post('/api/users').set(headers())
      .send({ name: 'Bob', email: 'bob@x.com', password: 'pw12345678' });
    expect(r.status).toBe(201);
    expect(r.body.user.email).toBe('bob@x.com');
    expect(r.body.user.role).toBe('user');
  });

  it('400 when password is too short', async () => {
    const r = await request(app).post('/api/users').set(headers())
      .send({ name: 'Bob', email: 'bob@x.com', password: 'short' });
    expect(r.status).toBe(400);
  });

  it('400 when email already exists', async () => {
    await createUser();
    const r = await request(app).post('/api/users').set(headers())
      .send({ name: 'Bob2', email: 'bob@x.com', password: 'pw12345678' });
    expect(r.status).toBe(400);
  });

  it('401 without admin token', async () => {
    const r = await request(app).post('/api/users')
      .send({ name: 'X', email: 'x@x.com', password: 'pw12345678' });
    expect(r.status).toBe(401);
  });
});

describe('PATCH /api/users/:id/disable + enable', () => {
  it('disables a user (is_active flipped to 0)', async () => {
    const bob = await createUser('user');
    const d = await request(app).patch(`/api/users/${bob.id}/disable`).set(headers());
    expect(d.status).toBe(200);
    const list = await request(app).get('/api/users').set(headers());
    const row = list.body.users.find((u: { id: string }) => u.id === bob.id);
    expect(row.is_active).toBe(0);
  });

  it('re-enables a disabled user', async () => {
    const bob = await createUser('user');
    await request(app).patch(`/api/users/${bob.id}/disable`).set(headers());
    const e = await request(app).patch(`/api/users/${bob.id}/enable`).set(headers());
    expect(e.status).toBe(200);
    const list = await request(app).get('/api/users').set(headers());
    const row = list.body.users.find((u: { id: string }) => u.id === bob.id);
    expect(row.is_active).toBe(1);
  });

  it('400 when trying to disable an admin user', async () => {
    const adm = await createUser('admin', 'admin@x.com');
    const r = await request(app).patch(`/api/users/${adm.id}/disable`).set(headers());
    expect(r.status).toBe(400);
  });
});

describe('DELETE /api/users/:id', () => {
  it('deletes a non-admin user', async () => {
    const bob = await createUser('user');
    const r = await request(app).delete(`/api/users/${bob.id}`).set(headers());
    expect(r.status).toBe(200);
    const list = await request(app).get('/api/users').set(headers());
    expect(list.body.users.find((u: { id: string }) => u.id === bob.id)).toBeUndefined();
  });

  it('400 when trying to delete an admin user (must transfer admin role first)', async () => {
    const adm = await createUser('admin', 'admin@x.com');
    const r = await request(app).delete(`/api/users/${adm.id}`).set(headers());
    expect(r.status).toBe(400);
  });
});

describe('POST /api/users/transfer-admin', () => {
  it('transfers admin role from one user to another', async () => {
    const a = await createUser('admin', 'a@x.com');
    const b = await createUser('user', 'b@x.com');
    const r = await request(app).post('/api/users/transfer-admin').set(headers())
      .send({ fromUserId: a.id, targetUserId: b.id });
    expect(r.status).toBe(200);
    const list = await request(app).get('/api/users').set(headers());
    const aRow = list.body.users.find((u: { id: string }) => u.id === a.id);
    const bRow = list.body.users.find((u: { id: string }) => u.id === b.id);
    expect(aRow.role).toBe('user');
    expect(bRow.role).toBe('admin');
  });

  it('400 when fromUserId/targetUserId are missing', async () => {
    const r = await request(app).post('/api/users/transfer-admin').set(headers()).send({});
    expect(r.status).toBe(400);
  });
});
