import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import db from '../db/connection';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// GET /api/auth/status — check if any users exist (determines setup vs login)
router.get('/status', (_req: Request, res: Response) => {
  try {
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    return res.json({ hasUsers: userCount.count > 0 });
  } catch (err: any) {
    console.error('Error checking auth status:', err);
    return res.status(500).json({ error: 'Failed to check auth status' });
  }
});

// 3.2 POST /api/auth/setup — first user setup (becomes admin)
router.post('/setup', (req: Request, res: Response) => {
  try {
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    if (userCount.count > 0) {
      return res.status(400).json({ error: '系統已有使用者，無法重新設定' });
    }

    const { name } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: '管理員名稱為必填' });
    }

    // Create admin user
    const userId = uuidv4();
    db.prepare('INSERT INTO users (id, name, role) VALUES (?, ?, ?)').run(userId, name.trim(), 'admin');

    // 4.7 Assign all existing ownerless projects to admin
    db.prepare('UPDATE projects SET owner_id = ? WHERE owner_id IS NULL').run(userId);

    // Create session
    const sessionId = uuidv4();
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    db.prepare('INSERT INTO sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)').run(
      sessionId, userId, token, expiresAt
    );

    return res.json({
      token,
      user: { id: userId, name: name.trim(), role: 'admin' },
    });
  } catch (err: any) {
    console.error('Error setting up admin:', err);
    return res.status(500).json({ error: 'Failed to setup admin' });
  }
});

// 2.4 POST /api/auth/login — select user by ID, create session
router.post('/login', (req: Request, res: Response) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ? AND is_active = 1').get(userId) as any;
    if (!user) {
      return res.status(404).json({ error: '使用者不存在或已停用' });
    }

    // Create session
    const sessionId = uuidv4();
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

    db.prepare('INSERT INTO sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)').run(
      sessionId, userId, token, expiresAt
    );

    return res.json({
      token,
      user: { id: user.id, name: user.name, role: user.role },
    });
  } catch (err: any) {
    console.error('Error logging in:', err);
    return res.status(500).json({ error: 'Failed to login' });
  }
});

// 2.5 POST /api/auth/logout — clear session
router.post('/logout', (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    }
    return res.json({ success: true });
  } catch (err: any) {
    console.error('Error logging out:', err);
    return res.status(500).json({ error: 'Failed to logout' });
  }
});

// 2.6 GET /api/auth/me — return current user info
router.get('/me', (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.json({ user: null });
    }

    const token = authHeader.slice(7);
    const session = db.prepare(`
      SELECT u.id, u.name, u.role
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token = ? AND s.expires_at > datetime('now') AND u.is_active = 1
    `).get(token) as { id: string; name: string; role: string } | undefined;

    if (!session) {
      return res.json({ user: null });
    }

    return res.json({ user: session });
  } catch (err: any) {
    console.error('Error getting current user:', err);
    return res.status(500).json({ error: 'Failed to get user info' });
  }
});

// 2.7 GET /api/users — list all users (public, for login page)
router.get('/users', (_req: Request, res: Response) => {
  try {
    const users = db.prepare('SELECT id, name, role, is_active, created_at FROM users WHERE is_active = 1 ORDER BY created_at ASC').all();
    return res.json(users);
  } catch (err: any) {
    console.error('Error listing users:', err);
    return res.status(500).json({ error: 'Failed to list users' });
  }
});

export default router;
