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
 * requireAdmin — NO-OP in M1 anonymous mode.
 *
 * Per user instruction: zero auth in this product. Settings is wide open like
 * everything else. The admin-password machinery (services/adminAuth.ts) is
 * kept for future use but NOT enforced by any route. If the operator later
 * decides to gate Settings behind a password, swap this middleware back to
 * checking req.isAdmin.
 */
export function requireAdmin(_req: Request, _res: Response, next: NextFunction): void {
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
