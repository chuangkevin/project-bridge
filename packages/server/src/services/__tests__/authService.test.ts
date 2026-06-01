import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../../db/connection';
import { runMigrations, defaultMigrationsDir } from '../../db/migrator';
import { createUser, login, getSessionUser } from '../authService';

let dataDir: string;
let db: ReturnType<typeof openDb>;
beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'auth-'));
  db = openDb(dataDir);
  runMigrations(db, defaultMigrationsDir());
});
afterEach(() => { db.close(); rmSync(dataDir, { recursive: true, force: true }); });

describe('authService', () => {
  it('createUser hashes the password and returns id+email', async () => {
    const u = await createUser(db, { name: 'A', email: 'a@x.com', password: 'pw12345678' });
    expect(u.id).toBeDefined();
    expect(u.email).toBe('a@x.com');
    const row = db.prepare('SELECT password_hash FROM users WHERE id=?').get(u.id) as { password_hash: string };
    expect(row.password_hash).not.toBe('pw12345678');
    expect(row.password_hash.length).toBeGreaterThan(20);
  });

  it('login returns a session token on correct password', async () => {
    await createUser(db, { name: 'A', email: 'a@x.com', password: 'pw12345678' });
    const r = await login(db, 'a@x.com', 'pw12345678');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.token.length).toBeGreaterThan(20);
  });

  it('login fails on wrong password', async () => {
    await createUser(db, { name: 'A', email: 'a@x.com', password: 'pw12345678' });
    const r = await login(db, 'a@x.com', 'wrong');
    expect(r.ok).toBe(false);
  });

  it('getSessionUser returns user for a valid token', async () => {
    const u = await createUser(db, { name: 'A', email: 'a@x.com', password: 'pw12345678' });
    const r = await login(db, 'a@x.com', 'pw12345678');
    if (!r.ok) throw new Error('login failed');
    const user = getSessionUser(db, r.token);
    expect(user?.id).toBe(u.id);
    expect(user?.email).toBe('a@x.com');
  });

  it('getSessionUser returns null for an unknown token', () => {
    expect(getSessionUser(db, 'nope')).toBeNull();
  });

  it('getSessionUser returns null for an expired session (same calendar day)', async () => {
    const u = await createUser(db, { name: 'A', email: 'a@x.com', password: 'pw12345678' });
    // Manually insert a session that expired 1 second ago
    const expiredAt = new Date(Date.now() - 1000).toISOString();
    db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run('expired-token', u.id, expiredAt);
    expect(getSessionUser(db, 'expired-token')).toBeNull();
  });
});
