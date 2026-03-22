import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/connection';
import { requireAuth, requireAdmin } from '../middleware/auth';

const router = Router();

// All user management routes require auth
router.use(requireAuth);

// 3.2 POST /api/users/setup — first user becomes admin (no auth required override)
// This is handled separately before the requireAuth middleware
// We'll handle it via a special route in auth.ts instead

// 3.1 POST /api/users — admin creates a new user
router.post('/', requireAdmin, (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: '使用者名稱為必填' });
    }

    // Check duplicate name
    const existing = db.prepare('SELECT id FROM users WHERE name = ?').get(name.trim());
    if (existing) {
      return res.status(409).json({ error: '使用者名稱已存在' });
    }

    const id = uuidv4();
    db.prepare('INSERT INTO users (id, name, role) VALUES (?, ?, ?)').run(id, name.trim(), 'user');

    const user = db.prepare('SELECT id, name, role, is_active, created_at FROM users WHERE id = ?').get(id);
    return res.status(201).json(user);
  } catch (err: any) {
    console.error('Error creating user:', err);
    return res.status(500).json({ error: 'Failed to create user' });
  }
});

// GET /api/users/all — admin lists all users (including disabled)
router.get('/all', requireAdmin, (_req: Request, res: Response) => {
  try {
    const users = db.prepare('SELECT id, name, role, is_active, created_at FROM users ORDER BY created_at ASC').all();
    return res.json(users);
  } catch (err: any) {
    console.error('Error listing all users:', err);
    return res.status(500).json({ error: 'Failed to list users' });
  }
});

// 3.3 PATCH /api/users/:id/disable — admin disables a user
router.patch('/:id/disable', requireAdmin, (req: Request, res: Response) => {
  try {
    const userId = req.params.id;

    // Cannot disable yourself
    if (req.user!.id === userId) {
      return res.status(400).json({ error: '無法停用自己的帳號' });
    }

    const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(userId) as any;
    if (!user) return res.status(404).json({ error: '使用者不存在' });

    // Cannot disable admin
    if (user.role === 'admin') {
      return res.status(400).json({ error: '無法停用管理員帳號' });
    }

    db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(userId);
    // Clear sessions
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);

    return res.json({ success: true });
  } catch (err: any) {
    console.error('Error disabling user:', err);
    return res.status(500).json({ error: 'Failed to disable user' });
  }
});

// 3.4 PATCH /api/users/:id/enable — admin enables a user
router.patch('/:id/enable', requireAdmin, (req: Request, res: Response) => {
  try {
    const userId = req.params.id;
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!user) return res.status(404).json({ error: '使用者不存在' });

    db.prepare('UPDATE users SET is_active = 1 WHERE id = ?').run(userId);
    return res.json({ success: true });
  } catch (err: any) {
    console.error('Error enabling user:', err);
    return res.status(500).json({ error: 'Failed to enable user' });
  }
});

// 3.5 DELETE /api/users/:id — admin deletes user (projects reassigned to admin)
router.delete('/:id', requireAdmin, (req: Request, res: Response) => {
  try {
    const userId = req.params.id;

    // Cannot delete yourself
    if (req.user!.id === userId) {
      return res.status(400).json({ error: '無法刪除自己的帳號' });
    }

    const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(userId) as any;
    if (!user) return res.status(404).json({ error: '使用者不存在' });

    if (user.role === 'admin') {
      return res.status(400).json({ error: '無法刪除管理員帳號' });
    }

    // Reassign projects to admin
    db.prepare('UPDATE projects SET owner_id = ? WHERE owner_id = ?').run(req.user!.id, userId);
    // Reassign annotations
    db.prepare('UPDATE annotations SET user_id = ? WHERE user_id = ?').run(req.user!.id, userId);
    // Delete sessions
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    // Delete user
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);

    return res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting user:', err);
    return res.status(500).json({ error: 'Failed to delete user' });
  }
});

// 3.6 POST /api/users/transfer-admin — transfer admin role
router.post('/transfer-admin', requireAdmin, (req: Request, res: Response) => {
  try {
    const { targetUserId } = req.body;
    if (!targetUserId) {
      return res.status(400).json({ error: 'targetUserId is required' });
    }

    const target = db.prepare('SELECT id, role, is_active FROM users WHERE id = ?').get(targetUserId) as any;
    if (!target) return res.status(404).json({ error: '目標使用者不存在' });
    if (!target.is_active) return res.status(400).json({ error: '目標使用者已停用' });
    if (target.role === 'admin') return res.status(400).json({ error: '目標使用者已經是管理員' });

    // Transfer: current admin → user, target → admin
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run('user', req.user!.id);
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run('admin', targetUserId);

    return res.json({ success: true });
  } catch (err: any) {
    console.error('Error transferring admin:', err);
    return res.status(500).json({ error: 'Failed to transfer admin role' });
  }
});

export default router;
