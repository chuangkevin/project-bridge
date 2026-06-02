/**
 * Users router — admin management of legacy per-user accounts.
 *
 * M1 note: The site itself is anonymous (no per-user login), but this router
 * is preserved for operators who still want to manage the legacy users table
 * (e.g. cleaning up old rows before a future re-enablement of login). All
 * mutating endpoints require the new admin token. Read endpoints (/public,
 * GET /) also require admin since they expose user identity data.
 */

import { Router, type Request, type Response } from 'express';
import type Database from 'better-sqlite3';
import { requireAdmin } from '../middleware/auth.js';
import {
  createUserByAdmin,
  listUsers,
  disableUser,
  enableUser,
  deleteUserById,
  transferAdmin,
} from '../services/userService.js';

function fail(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message } });
}

export function buildUsersRouter(db: Database.Database): Router {
  const r = Router();
  r.use(requireAdmin);

  // Public-ish: only active users, only id + name. Still admin-gated in M1
  // because anonymous visitors should not enumerate operator identities.
  r.get('/public', (_req: Request, res: Response) => {
    const users = db.prepare(`SELECT id, name FROM users WHERE is_active = 1 ORDER BY created_at ASC`).all();
    res.json({ users });
  });

  r.get('/', (_req: Request, res: Response) => {
    res.json({ users: listUsers(db) });
  });

  r.post('/', async (req: Request, res: Response) => {
    const { name, email, password, role } = (req.body ?? {}) as { name?: string; email?: string; password?: string; role?: 'admin' | 'user' };
    if (!name || !email || !password) {
      fail(res, 400, 'VALIDATION_FAILED', '需要 name / email / password');
      return;
    }
    try {
      const user = await createUserByAdmin(db, { name, email, password, role });
      res.status(201).json({ user });
    } catch (e) {
      fail(res, 400, 'VALIDATION_FAILED', (e as Error).message);
    }
  });

  r.patch('/:id/disable', (req: Request, res: Response) => {
    const row = db.prepare('SELECT role FROM users WHERE id = ?').get(String(req.params.id)) as { role: string } | undefined;
    if (!row) { fail(res, 404, 'NOT_FOUND', '使用者不存在'); return; }
    if (row.role === 'admin') {
      fail(res, 400, 'VALIDATION_FAILED', '無法停用管理員，請先轉移管理員權限');
      return;
    }
    disableUser(db, String(req.params.id));
    res.json({ ok: true });
  });

  r.patch('/:id/enable', (req: Request, res: Response) => {
    const row = db.prepare('SELECT 1 FROM users WHERE id = ?').get(String(req.params.id));
    if (!row) { fail(res, 404, 'NOT_FOUND', '使用者不存在'); return; }
    enableUser(db, String(req.params.id));
    res.json({ ok: true });
  });

  r.delete('/:id', (req: Request, res: Response) => {
    try {
      // M1 admin has no user-id; pass the target id itself so the "can't delete self" guard
      // is a no-op for the admin token path. Admin-role rows are still protected by
      // deleteUserById's own role check.
      const targetId = String(req.params.id);
      deleteUserById(db, targetId, '__admin_token__');
      res.json({ ok: true });
    } catch (e) {
      const msg = (e as Error).message;
      const status = msg === 'user not found' ? 404 : 400;
      fail(res, status, status === 404 ? 'NOT_FOUND' : 'VALIDATION_FAILED', msg);
    }
  });

  r.post('/transfer-admin', (req: Request, res: Response) => {
    const { fromUserId, targetUserId } = (req.body ?? {}) as { fromUserId?: string; targetUserId?: string };
    if (!fromUserId || !targetUserId) {
      fail(res, 400, 'VALIDATION_FAILED', '需要 fromUserId + targetUserId');
      return;
    }
    try {
      transferAdmin(db, fromUserId, targetUserId);
      res.json({ ok: true });
    } catch (e) {
      const msg = (e as Error).message;
      const status = msg === 'target user not found' ? 404 : 400;
      fail(res, status, status === 404 ? 'NOT_FOUND' : 'VALIDATION_FAILED', msg);
    }
  });

  return r;
}
