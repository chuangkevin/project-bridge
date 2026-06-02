import { Router, type Request, type Response } from 'express';
import type Database from 'better-sqlite3';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
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

  // Public-ish: only active users, only id + name. For picker modals etc.
  r.get('/public', requireAuth, (_req: Request, res: Response) => {
    const users = db.prepare(`SELECT id, name FROM users WHERE is_active = 1 ORDER BY created_at ASC`).all();
    res.json({ users });
  });

  // Admin-only below
  r.get('/', requireAuth, requireAdmin(db), (_req: Request, res: Response) => {
    res.json({ users: listUsers(db) });
  });

  r.post('/', requireAuth, requireAdmin(db), async (req: Request, res: Response) => {
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

  r.patch('/:id/disable', requireAuth, requireAdmin(db), (req: Request, res: Response) => {
    if (String(req.params.id) === req.user!.id) {
      fail(res, 400, 'VALIDATION_FAILED', '不能停用自己');
      return;
    }
    const row = db.prepare('SELECT role FROM users WHERE id = ?').get(String(req.params.id)) as { role: string } | undefined;
    if (!row) { fail(res, 404, 'NOT_FOUND', '使用者不存在'); return; }
    if (row.role === 'admin') {
      fail(res, 400, 'VALIDATION_FAILED', '無法停用管理員，請先轉移管理員權限');
      return;
    }
    disableUser(db, String(req.params.id));
    res.json({ ok: true });
  });

  r.patch('/:id/enable', requireAuth, requireAdmin(db), (req: Request, res: Response) => {
    const row = db.prepare('SELECT 1 FROM users WHERE id = ?').get(String(req.params.id));
    if (!row) { fail(res, 404, 'NOT_FOUND', '使用者不存在'); return; }
    enableUser(db, String(req.params.id));
    res.json({ ok: true });
  });

  r.delete('/:id', requireAuth, requireAdmin(db), (req: Request, res: Response) => {
    try {
      deleteUserById(db, String(req.params.id), req.user!.id);
      res.json({ ok: true });
    } catch (e) {
      const msg = (e as Error).message;
      const status = msg === 'user not found' ? 404 : 400;
      fail(res, status, status === 404 ? 'NOT_FOUND' : 'VALIDATION_FAILED', msg);
    }
  });

  r.post('/transfer-admin', requireAuth, requireAdmin(db), (req: Request, res: Response) => {
    const { targetUserId } = (req.body ?? {}) as { targetUserId?: string };
    if (!targetUserId) {
      fail(res, 400, 'VALIDATION_FAILED', '需要 targetUserId');
      return;
    }
    try {
      transferAdmin(db, req.user!.id, targetUserId);
      res.json({ ok: true });
    } catch (e) {
      const msg = (e as Error).message;
      const status = msg === 'target user not found' ? 404 : 400;
      fail(res, status, status === 404 ? 'NOT_FOUND' : 'VALIDATION_FAILED', msg);
    }
  });

  return r;
}
