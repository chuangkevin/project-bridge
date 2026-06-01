import type Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { v4 as uuid } from 'uuid';

const SESSION_TTL_DAYS = 30;
const BCRYPT_ROUNDS = 10;
const DUMMY_BCRYPT_HASH = '$2b$10$1234567890123456789012abcdefghijklmnopqrstuvwxyz0123456789AB';

export interface User { id: string; name: string; email: string; }

export interface CreateUserInput { name: string; email: string; password: string; }

export async function createUser(db: Database.Database, input: CreateUserInput): Promise<User> {
  const email = input.email.toLowerCase().trim();
  const hash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const id = uuid();
  db.prepare('INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)')
    .run(id, input.name, email, hash);
  return { id, name: input.name, email };
}

export type LoginResult = { ok: true; token: string; user: User } | { ok: false; reason: 'no_user' | 'bad_password' };

export async function login(db: Database.Database, email: string, password: string): Promise<LoginResult> {
  const normalisedEmail = email.toLowerCase().trim();
  const row = db.prepare('SELECT id, name, email, password_hash FROM users WHERE email = ?').get(normalisedEmail) as
    | { id: string; name: string; email: string; password_hash: string }
    | undefined;
  if (!row) {
    await bcrypt.compare(password, DUMMY_BCRYPT_HASH); // consume ~same time as a real bcrypt to prevent email enumeration
    return { ok: false, reason: 'no_user' };
  }
  const match = await bcrypt.compare(password, row.password_hash);
  if (!match) return { ok: false, reason: 'bad_password' };

  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
    .run(token, row.id, expires);
  return { ok: true, token, user: { id: row.id, name: row.name, email: row.email } };
}

export function logout(db: Database.Database, token: string): void {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function getSessionUser(db: Database.Database, token: string): User | null {
  const row = db.prepare(`
    SELECT u.id, u.name, u.email FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND datetime(s.expires_at) > datetime('now')
  `).get(token) as User | undefined;
  return row ?? null;
}
