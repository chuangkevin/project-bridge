import type { Request, Response, NextFunction } from 'express';
import type Database from 'better-sqlite3';

/**
 * Gate a route to admin users only. Must be mounted AFTER requireAuth so req.user is populated.
 *
 * Returns a middleware factory so the db handle can be injected (the route's
 * Router doesn't have access to req.app.locals.db at construction time).
 */
export function requireAdmin(db: Database.Database) {
  return function (req: Request, res: Response, next: NextFunction): void {
    if (!req.user) {
      res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: '尚未登入' } });
      return;
    }
    const row = db.prepare('SELECT role, is_active FROM users WHERE id = ?').get(req.user.id) as
      | { role: string; is_active: number }
      | undefined;
    if (!row || row.role !== 'admin' || row.is_active === 0) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: '需要管理員權限' } });
      return;
    }
    next();
  };
}
