import type { Request, Response, NextFunction } from 'express';
import type Database from 'better-sqlite3';
import { getSessionUser, type User } from '../services/authService.js';
import { verifyAdminToken } from '../services/adminAuth.js';

declare global {
  namespace Express {
    interface Request {
      user?: User;
      sessionToken?: string;
      /** Set when the request carries a valid admin token (sessionStorage admin_token). */
      isAdmin?: boolean;
    }
  }
}

/**
 * Permissive auth middleware (M1 anonymous mode).
 *
 * - Anonymous requests pass through with req.user = undefined; that's fine,
 *   because routes no longer call requireAuth.
 * - If a Bearer token / db_session cookie matches a legacy per-user session,
 *   we still populate req.user for back-compat (some debug code, e2e specs).
 * - If a Bearer token matches the current admin session token, we set
 *   req.isAdmin = true so the requireAdmin middleware below can gate
 *   Settings/admin operations.
 */
export function authMiddleware(db: Database.Database) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const token = extractToken(req);
    if (token) {
      req.sessionToken = token;
      const user = getSessionUser(db, token);
      if (user) req.user = user;
      if (verifyAdminToken(token)) req.isAdmin = true;
    }
    next();
  };
}

/**
 * requireAdmin — gate admin-only Settings operations.
 *
 * Requires a valid admin token (issued by POST /api/auth/verify). Anonymous
 * users get 401. Legacy per-user sessions DO NOT grant admin: only the shared
 * admin token does. This is intentional — M1's admin-password setup is a
 * separate posture from any leftover user accounts.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.isAdmin) {
    res.status(401).json({
      error: {
        code: 'ADMIN_REQUIRED',
        message: '需要管理員密碼',
        requestId: req.header('X-Request-Id') ?? '',
      },
    });
    return;
  }
  next();
}

/**
 * Deprecated alias kept for callers that still import `requireAuth`. In M1
 * anonymous mode this is a no-op pass-through — every route is open. Do not
 * use for new routes; new admin operations should use `requireAdmin`.
 */
export function requireAuth(_req: Request, _res: Response, next: NextFunction): void {
  next();
}

function extractToken(req: Request): string | null {
  const header = req.header('Authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7);
  const cookie = req.header('Cookie') ?? '';
  const m = cookie.match(/db_session=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}
