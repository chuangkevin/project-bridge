import type Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import { v4 as uuid } from 'uuid';

const BCRYPT_ROUNDS = 10;

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  is_active: number;
  created_at: string;
}

export interface CreateUserByAdminInput {
  name: string;
  email: string;
  password: string;
  role?: 'admin' | 'user';
}

export async function createUserByAdmin(db: Database.Database, input: CreateUserByAdminInput): Promise<AdminUserRow> {
  if (!input.name?.trim()) throw new Error('name required');
  if (!input.email?.trim()) throw new Error('email required');
  if (!input.password || input.password.length < 8) throw new Error('password must be at least 8 characters');
  const role = input.role === 'admin' ? 'admin' : 'user';
  const email = input.email.toLowerCase().trim();
  const existing = db.prepare('SELECT 1 FROM users WHERE email = ?').get(email);
  if (existing) throw new Error('email already exists');
  const hash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const id = uuid();
  db.prepare('INSERT INTO users (id, name, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?, 1)')
    .run(id, input.name, email, hash, role);
  return {
    id, name: input.name, email, role, is_active: 1,
    created_at: (db.prepare('SELECT created_at FROM users WHERE id = ?').get(id) as { created_at: string }).created_at,
  };
}

export function listUsers(db: Database.Database): AdminUserRow[] {
  return db.prepare(`
    SELECT id, name, email, role, is_active, created_at
    FROM users
    ORDER BY created_at ASC, id ASC
  `).all() as AdminUserRow[];
}

export function disableUser(db: Database.Database, userId: string): void {
  db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(userId);
  // Revoke all active sessions for the disabled user
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

export function enableUser(db: Database.Database, userId: string): void {
  db.prepare('UPDATE users SET is_active = 1 WHERE id = ?').run(userId);
}

export function deleteUserById(db: Database.Database, userId: string, requesterId: string): void {
  if (userId === requesterId) throw new Error('cannot delete self');
  const row = db.prepare('SELECT role FROM users WHERE id = ?').get(userId) as { role: string } | undefined;
  if (!row) throw new Error('user not found');
  if (row.role === 'admin') throw new Error('cannot delete an admin; transfer admin role first');
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
}

export function transferAdmin(db: Database.Database, fromUserId: string, toUserId: string): void {
  if (fromUserId === toUserId) throw new Error('cannot transfer to self');
  const target = db.prepare('SELECT id, is_active FROM users WHERE id = ?').get(toUserId) as
    | { id: string; is_active: number }
    | undefined;
  if (!target) throw new Error('target user not found');
  if (target.is_active === 0) throw new Error('target user is disabled');
  const txn = db.transaction(() => {
    db.prepare("UPDATE users SET role = 'user' WHERE id = ?").run(fromUserId);
    db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(toUserId);
  });
  txn();
}
