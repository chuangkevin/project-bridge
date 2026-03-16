import { Router, Request, Response } from 'express';
import db from '../db/connection';

const router = Router();

const SENSITIVE_KEYS = ['openai_api_key'];

function maskValue(key: string, value: string): string {
  if (SENSITIVE_KEYS.includes(key) && value.length > 4) {
    return '*'.repeat(value.length - 4) + value.slice(-4);
  }
  return value;
}

// GET /api/settings — return all settings (with masked sensitive values)
router.get('/', (_req: Request, res: Response) => {
  try {
    const settings = db.prepare('SELECT * FROM settings').all() as any[];

    const masked = settings.map(s => ({
      ...s,
      value: maskValue(s.key, s.value),
    }));

    // Also indicate if env-based API key is set
    const result: any = {
      settings: masked,
      envKeys: {
        OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
      },
    };

    return res.json(result);
  } catch (err: any) {
    console.error('Error getting settings:', err);
    return res.status(500).json({ error: 'Failed to get settings' });
  }
});

// PUT /api/settings — upsert a setting
router.put('/', (req: Request, res: Response) => {
  try {
    const { key, value } = req.body;

    if (!key || typeof key !== 'string') {
      return res.status(400).json({ error: 'Setting key is required' });
    }

    if (value === undefined || value === null) {
      return res.status(400).json({ error: 'Setting value is required' });
    }

    db.prepare(`
      INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
    `).run(key, String(value));

    return res.json({ key, value: maskValue(key, String(value)) });
  } catch (err: any) {
    console.error('Error updating setting:', err);
    return res.status(500).json({ error: 'Failed to update setting' });
  }
});

export default router;
