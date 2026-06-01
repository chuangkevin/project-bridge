import { Router, type Request, type Response } from 'express';
import type Database from 'better-sqlite3';
import { createUser, login as loginService, logout as logoutService } from '../services/authService.js';
import { requireAuth } from '../middleware/auth.js';

export function buildAuthRouter(db: Database.Database): Router {
  const r = Router();

  r.post('/setup', async (req: Request, res: Response) => {
    const { name, email, password } = req.body ?? {};
    if (!name || !email || !password || password.length < 8) {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: '需要 name / email / password (>= 8)' } });
      return;
    }
    const existing = db.prepare('SELECT 1 FROM users LIMIT 1').get();
    if (existing) {
      res.status(409).json({ error: { code: 'SETUP_ALREADY_DONE', message: '系統已初始化過' } });
      return;
    }
    const user = await createUser(db, { name, email, password });
    const result = await loginService(db, email, password);
    if (!result.ok) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'setup login failed' } });
      return;
    }
    res.json({ token: result.token, user });
  });

  r.post('/login', async (req: Request, res: Response) => {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: '需要 email + password' } });
      return;
    }
    const result = await loginService(db, email, password);
    if (!result.ok) {
      res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: '帳號或密碼錯誤' } });
      return;
    }
    res.json({ token: result.token, user: result.user });
  });

  r.post('/logout', requireAuth, (req: Request, res: Response) => {
    if (req.sessionToken) logoutService(db, req.sessionToken);
    res.json({ ok: true });
  });

  r.get('/me', requireAuth, (req: Request, res: Response) => {
    res.json(req.user);
  });

  return r;
}
