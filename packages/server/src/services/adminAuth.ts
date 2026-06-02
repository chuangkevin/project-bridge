/**
 * Admin password / admin-session service.
 *
 * M1 anonymous mode: only Settings admin operations (API keys, MCP CRUD,
 * OpenCode config, Users management) require auth. Auth is a single shared
 * admin password, hash stored in `settings.admin_password_hash`. On successful
 * verify we mint a random session token kept in memory (admin_token sent back
 * to the browser in sessionStorage). Tokens are cleared on server restart by
 * design — Settings is a low-traffic admin surface and re-prompting on restart
 * is fine.
 */

import type Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { readSetting, writeSetting } from './settings.js';

const BCRYPT_ROUNDS = 10;
const ADMIN_PASSWORD_KEY = 'admin_password_hash';
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h sliding window in-memory only

const activeAdminTokens = new Map<string, number>(); // token → expiresAt epoch ms

export function hasAdminPassword(db: Database.Database): boolean {
  const v = readSetting(db, ADMIN_PASSWORD_KEY);
  return typeof v === 'string' && v.length > 0;
}

export async function setupAdminPassword(db: Database.Database, password: string): Promise<void> {
  if (typeof password !== 'string' || password.length < 8) {
    throw new Error('密碼至少 8 字');
  }
  if (hasAdminPassword(db)) {
    throw new Error('已設定過管理員密碼');
  }
  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  writeSetting(db, ADMIN_PASSWORD_KEY, hash);
}

export async function changeAdminPassword(
  db: Database.Database,
  oldPassword: string,
  newPassword: string,
): Promise<void> {
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    throw new Error('新密碼至少 8 字');
  }
  const stored = readSetting(db, ADMIN_PASSWORD_KEY);
  if (!stored) throw new Error('尚未設定管理員密碼');
  const ok = await bcrypt.compare(oldPassword ?? '', stored);
  if (!ok) throw new Error('舊密碼錯誤');
  const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  writeSetting(db, ADMIN_PASSWORD_KEY, hash);
  // Any previously-minted tokens stay valid until expiry — operator can manually
  // clear by restarting the server.
}

export async function verifyAdminPassword(
  db: Database.Database,
  password: string,
): Promise<string | null> {
  const stored = readSetting(db, ADMIN_PASSWORD_KEY);
  if (!stored) return null;
  const ok = await bcrypt.compare(password ?? '', stored);
  if (!ok) return null;
  return mintAdminToken();
}

export function mintAdminToken(): string {
  const token = `admin_${randomBytes(24).toString('hex')}`;
  activeAdminTokens.set(token, Date.now() + TOKEN_TTL_MS);
  return token;
}

export function verifyAdminToken(token: string): boolean {
  if (!token || !token.startsWith('admin_')) return false;
  const exp = activeAdminTokens.get(token);
  if (!exp) return false;
  if (exp < Date.now()) {
    activeAdminTokens.delete(token);
    return false;
  }
  return true;
}

export function revokeAdminToken(token: string): void {
  activeAdminTokens.delete(token);
}

/** Test helper — wipes the in-memory token store. */
export function _resetAdminTokens(): void {
  activeAdminTokens.clear();
}
