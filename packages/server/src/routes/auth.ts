/**
 * Admin password / admin-session routes (M1 anonymous mode).
 *
 * Endpoints:
 *   GET    /api/auth/status  — { hasAdminPassword: boolean }
 *   POST   /api/auth/setup   — first-time set admin password { password }
 *   POST   /api/auth/verify  — verify admin password { password } → { token }
 *   POST   /api/auth/change  — change admin password { oldPassword, newPassword }
 *   GET    /api/auth/me      — always returns { user: null } in M1
 *
 * There is no per-user login. The whole site is anonymous; only admin-gated
 * Settings operations consume the token from verify (sent as Bearer).
 */

import { Router, type Request, type Response } from 'express';
import type Database from 'better-sqlite3';
import {
  hasAdminPassword,
  setupAdminPassword,
  changeAdminPassword,
  verifyAdminPassword,
  revokeAdminToken,
} from '../services/adminAuth.js';

function fail(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message } });
}

export function buildAuthRouter(db: Database.Database): Router {
  const r = Router();

  r.get('/status', (_req: Request, res: Response) => {
    res.json({ hasAdminPassword: hasAdminPassword(db) });
  });

  r.post('/setup', async (req: Request, res: Response) => {
    const { password } = (req.body ?? {}) as { password?: string };
    if (typeof password !== 'string' || password.length < 8) {
      fail(res, 400, 'VALIDATION_FAILED', '需要 password (>= 8 字)');
      return;
    }
    if (hasAdminPassword(db)) {
      fail(res, 409, 'SETUP_ALREADY_DONE', '已設定過管理員密碼');
      return;
    }
    try {
      await setupAdminPassword(db, password);
      const token = await verifyAdminPassword(db, password);
      res.json({ ok: true, token });
    } catch (e) {
      fail(res, 400, 'VALIDATION_FAILED', (e as Error).message);
    }
  });

  r.post('/verify', async (req: Request, res: Response) => {
    const { password } = (req.body ?? {}) as { password?: string };
    if (typeof password !== 'string' || password.length === 0) {
      fail(res, 400, 'VALIDATION_FAILED', '需要 password');
      return;
    }
    if (!hasAdminPassword(db)) {
      fail(res, 409, 'SETUP_REQUIRED', '尚未設定管理員密碼');
      return;
    }
    const token = await verifyAdminPassword(db, password);
    if (!token) {
      fail(res, 401, 'BAD_PASSWORD', '密碼錯誤');
      return;
    }
    res.json({ ok: true, token });
  });

  r.post('/change', async (req: Request, res: Response) => {
    const { oldPassword, newPassword } = (req.body ?? {}) as { oldPassword?: string; newPassword?: string };
    if (typeof oldPassword !== 'string' || typeof newPassword !== 'string') {
      fail(res, 400, 'VALIDATION_FAILED', '需要 oldPassword + newPassword');
      return;
    }
    try {
      await changeAdminPassword(db, oldPassword, newPassword);
      res.json({ ok: true });
    } catch (e) {
      const msg = (e as Error).message;
      const status = msg === '舊密碼錯誤' ? 401 : 400;
      fail(res, status, status === 401 ? 'BAD_PASSWORD' : 'VALIDATION_FAILED', msg);
    }
  });

  /** Back-compat shim — M1 has no per-user login; always returns null. */
  r.get('/me', (_req: Request, res: Response) => {
    res.json({ user: null });
  });

  /**
   * POST /api/auth/logout — admin logout. Revokes the supplied admin token if
   * it was issued by us; safe to call anonymously (no-op).
   */
  r.post('/logout', (req: Request, res: Response) => {
    if (req.sessionToken) revokeAdminToken(req.sessionToken);
    res.json({ ok: true });
  });

  return r;
}
