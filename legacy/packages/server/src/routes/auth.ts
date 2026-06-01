import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/connection';

const router = Router();

// Helper: get a setting value
function getSetting(key: string): string | undefined {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value;
}

// Helper: upsert a setting
function setSetting(key: string, value: string): void {
  db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(key, value);
}

// GET /api/auth/status — check auth state
router.get('/status', (_req: Request, res: Response) => {
  try {
    const hash = getSetting('admin_password_hash');
    const userCount = (db.prepare('SELECT COUNT(*) as c FROM users').get() as any)?.c ?? 0;
    return res.json({ hasPassword: !!hash, hasUsers: userCount > 0 });
  } catch (err: any) {
    console.error('Error checking auth status:', err);
    return res.status(500).json({ error: 'Failed to check auth status' });
  }
});

// POST /api/auth/login — user login (creates session, returns bearer token)
router.post('/login', (req: Request, res: Response) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    const user = db.prepare('SELECT id, name, role, is_active FROM users WHERE id = ?').get(userId) as any;
    if (!user) return res.status(404).json({ error: '使用者不存在' });
    if (!user.is_active) return res.status(403).json({ error: '帳號已停用' });

    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days
    db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expiresAt);

    return res.json({ token, user: { id: user.id, name: user.name, role: user.role } });
  } catch (err: any) {
    console.error('Error logging in:', err);
    return res.status(500).json({ error: 'Failed to login' });
  }
});

// GET /api/auth/me — get current user from bearer token
router.get('/me', (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.json({ user: null });
    }
    const token = authHeader.slice(7);
    const session = db.prepare(`
      SELECT s.user_id, u.name, u.role
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token = ? AND s.expires_at > datetime('now') AND u.is_active = 1
    `).get(token) as { user_id: string; name: string; role: string } | undefined;

    if (!session) return res.json({ user: null });
    return res.json({ user: { id: session.user_id, name: session.name, role: session.role } });
  } catch (err: any) {
    console.error('Error getting current user:', err);
    return res.status(500).json({ error: 'Failed to get current user' });
  }
});

// POST /api/auth/logout — invalidate session
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

// POST /api/auth/setup — first-time password setup
router.post('/setup', async (req: Request, res: Response) => {
  try {
    const existing = getSetting('admin_password_hash');
    if (existing) {
      return res.status(400).json({ error: '管理員密碼已設定，無法重新設定。請使用變更密碼功能。' });
    }

    const { password } = req.body;
    if (!password || typeof password !== 'string' || password.length < 4) {
      return res.status(400).json({ error: '密碼至少需要 4 個字元' });
    }

    const hash = await bcrypt.hash(password, 10);
    setSetting('admin_password_hash', hash);

    const token = crypto.randomUUID();
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    setSetting('admin_session_token', token);
    setSetting('admin_session_expiry', expiry);

    return res.json({ success: true, token });
  } catch (err: any) {
    console.error('Error setting up password:', err);
    return res.status(500).json({ error: 'Failed to set up password' });
  }
});

// POST /api/auth/verify — verify password
router.post('/verify', async (req: Request, res: Response) => {
  try {
    const hash = getSetting('admin_password_hash');
    if (!hash) {
      return res.status(400).json({ error: '尚未設定管理員密碼' });
    }

    const { password } = req.body;
    if (!password || typeof password !== 'string') {
      return res.status(400).json({ error: '請輸入密碼' });
    }

    const match = await bcrypt.compare(password, hash);
    if (!match) {
      return res.status(401).json({ error: '密碼錯誤' });
    }

    const token = crypto.randomUUID();
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    setSetting('admin_session_token', token);
    setSetting('admin_session_expiry', expiry);

    return res.json({ success: true, token });
  } catch (err: any) {
    console.error('Error verifying password:', err);
    return res.status(500).json({ error: 'Failed to verify password' });
  }
});

// POST /api/auth/change — change password (requires valid token)
router.post('/change', async (req: Request, res: Response) => {
  try {
    // Check authorization
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: '未授權' });
    }
    const token = authHeader.slice(7);
    const storedToken = getSetting('admin_session_token');
    const expiry = getSetting('admin_session_expiry');

    if (!storedToken || token !== storedToken) {
      return res.status(401).json({ error: '無效的 Token' });
    }
    if (expiry && new Date(expiry) < new Date()) {
      return res.status(401).json({ error: 'Token 已過期，請重新登入' });
    }

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: '請提供目前密碼和新密碼' });
    }
    if (typeof newPassword !== 'string' || newPassword.length < 4) {
      return res.status(400).json({ error: '新密碼至少需要 4 個字元' });
    }

    const hash = getSetting('admin_password_hash');
    if (!hash) {
      return res.status(400).json({ error: '尚未設定管理員密碼' });
    }

    const match = await bcrypt.compare(currentPassword, hash);
    if (!match) {
      return res.status(401).json({ error: '目前密碼錯誤' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    setSetting('admin_password_hash', newHash);

    // Issue new token
    const newToken = crypto.randomUUID();
    const newExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    setSetting('admin_session_token', newToken);
    setSetting('admin_session_expiry', newExpiry);

    return res.json({ success: true, token: newToken });
  } catch (err: any) {
    console.error('Error changing password:', err);
    return res.status(500).json({ error: 'Failed to change password' });
  }
});

export default router;
