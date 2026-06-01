import type { Request, Response, NextFunction } from 'express';
import type Database from 'better-sqlite3';
import { getSessionUser, type User } from '../services/authService.js';

declare global {
  namespace Express {
    interface Request { user?: User; }
  }
}

export function authMiddleware(db: Database.Database) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const token = extractToken(req);
    if (token) {
      const user = getSessionUser(db, token);
      if (user) req.user = user;
    }
    next();
  };
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: '尚未登入', requestId: req.header('X-Request-Id') ?? '' } });
    return;
  }
  next();
}

function extractToken(req: Request): string | null {
  const header = req.header('Authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7);
  const cookie = req.header('Cookie') ?? '';
  const m = cookie.match(/db_session=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}
