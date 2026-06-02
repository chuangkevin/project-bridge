/**
 * Legacy requireAdmin middleware — DEPRECATED in M1 anonymous mode.
 *
 * M1 admin gating happens via the admin-token-based `requireAdmin` exported
 * from `middleware/auth.ts`. This file is preserved only because external
 * code may still import its old shape; nothing in the current server
 * references it.
 *
 * If you're writing a new admin-only route: import `requireAdmin` from
 * `../middleware/auth.js` and mount it directly (no db handle needed).
 */

import type { Request, Response, NextFunction } from 'express';
import type Database from 'better-sqlite3';
import { requireAdmin as requireAdminFromAuth } from './auth.js';

/**
 * @deprecated Use `requireAdmin` from `./auth.js` directly. The db handle is
 * no longer required because admin gating runs against an in-memory token
 * store, not the users table.
 */
export function requireAdmin(_db: Database.Database) {
  return function (req: Request, res: Response, next: NextFunction): void {
    requireAdminFromAuth(req, res, next);
  };
}
