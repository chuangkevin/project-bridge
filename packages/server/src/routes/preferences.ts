import { Router, Request, Response } from 'express';
import db from '../db/connection';
import { requireAuth } from '../middleware/auth';

const router = Router();

// GET /api/users/preferences/:key — return preference value for current user
router.get('/preferences/:key', requireAuth, (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const row = db.prepare(
      'SELECT value FROM user_preferences WHERE user_id = ? AND key = ?'
    ).get(req.user!.id, key) as { value: string } | undefined;

    if (!row) {
      return res.json({ value: null });
    }

    // Try to parse as JSON, fall back to raw string
    try {
      return res.json({ value: JSON.parse(row.value) });
    } catch {
      return res.json({ value: row.value });
    }
  } catch (err: any) {
    console.error('Error getting preference:', err);
    return res.status(500).json({ error: 'Failed to get preference' });
  }
});

// PUT /api/users/preferences/:key — upsert preference value
router.put('/preferences/:key', requireAuth, (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    if (value === undefined) {
      return res.status(400).json({ error: 'value is required' });
    }

    const serialized = typeof value === 'string' ? value : JSON.stringify(value);

    db.prepare(`
      INSERT INTO user_preferences (user_id, key, value, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(req.user!.id, key, serialized);

    return res.json({ success: true });
  } catch (err: any) {
    console.error('Error setting preference:', err);
    return res.status(500).json({ error: 'Failed to set preference' });
  }
});

export default router;
