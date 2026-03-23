import { Request, Response, NextFunction } from 'express';
import db from '../db/connection';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        name: string;
        role: 'admin' | 'user';
      };
    }
  }
}

/**
 * 2.1 authMiddleware: Parse Bearer token → lookup session → set req.user
 * If no token or invalid, req.user remains undefined.
 * Use requireAuth after this to enforce authentication.
 */
export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next();
    return;
  }

  const token = authHeader.slice(7);
  const session = db.prepare(`
    SELECT s.user_id, u.name, u.role
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > datetime('now') AND u.is_active = 1
  `).get(token) as { user_id: string; name: string; role: string } | undefined;

  if (session) {
    req.user = {
      id: session.user_id,
      name: session.name,
      role: session.role as 'admin' | 'user',
    };
  }

  next();
}

/**
 * Require authenticated user. Returns 401 if not logged in.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: '未授權，請先登入' });
    return;
  }
  next();
}

/**
 * 2.2 requireAdmin: Check req.user.role === 'admin', else 403.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: '未授權，請先登入' });
    return;
  }
  if (req.user.role !== 'admin') {
    res.status(403).json({ error: '需要管理員權限' });
    return;
  }
  next();
}

/**
 * 2.3 requireOwnerOrAdmin: Check project owner_id === req.user.id or admin role.
 * Expects :id param to be the project ID.
 */
export function requireOwnerOrAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: '未授權，請先登入' });
    return;
  }
  if (req.user.role === 'admin') {
    next();
    return;
  }

  const projectId = req.params.id;
  const project = db.prepare('SELECT owner_id FROM projects WHERE id = ?').get(projectId) as { owner_id: string | null } | undefined;

  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  if (project.owner_id !== req.user.id) {
    res.status(403).json({ error: '只有專案擁有者或管理員可以執行此操作' });
    return;
  }

  next();
}
