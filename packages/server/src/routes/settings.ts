import { Router, Request, Response, NextFunction } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import db from '../db/connection';
import {
  getKeyList, addApiKey, removeApiKey, getUsageStats,
  getGeminiModel, invalidateKeyCache,
} from '../services/geminiKeys';

const router = Router();

// ─── Auth middleware for settings routes ────────────
function requireAuth(req: Request, res: Response, next: NextFunction): void {
  // If no password is set, allow access (first-time setup)
  const hash = db.prepare('SELECT value FROM settings WHERE key = ?').get('admin_password_hash') as { value: string } | undefined;
  if (!hash) {
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: '未授權，請先登入' });
    return;
  }

  const token = authHeader.slice(7);
  const storedToken = db.prepare('SELECT value FROM settings WHERE key = ?').get('admin_session_token') as { value: string } | undefined;
  const expiry = db.prepare('SELECT value FROM settings WHERE key = ?').get('admin_session_expiry') as { value: string } | undefined;

  if (!storedToken || token !== storedToken.value) {
    res.status(401).json({ error: '無效的 Token，請重新登入' });
    return;
  }

  if (expiry && new Date(expiry.value) < new Date()) {
    res.status(401).json({ error: 'Token 已過期，請重新登入' });
    return;
  }

  next();
}

// Apply auth middleware to all settings routes
router.use(requireAuth);

const SENSITIVE_KEYS = ['gemini_api_key', 'gemini_api_keys', 'openai_api_key'];

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

    const result: any = {
      settings: masked,
      envKeys: {
        GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
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
    if (!key || typeof key !== 'string') return res.status(400).json({ error: 'Setting key is required' });
    if (value === undefined || value === null) return res.status(400).json({ error: 'Setting value is required' });

    db.prepare(`
      INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
    `).run(key, String(value));

    // Invalidate key cache when API key settings change
    if (key === 'gemini_api_key' || key === 'gemini_api_keys' || key === 'gemini_model') {
      invalidateKeyCache();
    }

    return res.json({ key, value: maskValue(key, String(value)) });
  } catch (err: any) {
    console.error('Error updating setting:', err);
    return res.status(500).json({ error: 'Failed to update setting' });
  }
});

// ─── API Key Management ─────────────────────────────

// GET /api/settings/api-keys — list all keys with usage stats
router.get('/api-keys', (_req: Request, res: Response) => {
  try {
    const keys = getKeyList();
    const model = getGeminiModel();
    return res.json({ keys, model });
  } catch (err: any) {
    console.error('Error listing API keys:', err);
    return res.status(500).json({ error: 'Failed to list API keys' });
  }
});

// POST /api/settings/api-keys — add a new key (validates first)
router.post('/api-keys', async (req: Request, res: Response) => {
  try {
    const { apiKey } = req.body;
    if (!apiKey || typeof apiKey !== 'string' || !apiKey.startsWith('AIza')) {
      return res.status(400).json({ error: 'Invalid API key format. Must start with AIza.' });
    }

    // Validate key by making a test call
    try {
      const genai = new GoogleGenerativeAI(apiKey);
      const model = genai.getGenerativeModel({
        model: getGeminiModel(),
        generationConfig: { maxOutputTokens: 10 },
      });
      await model.generateContent('Say OK');
    } catch (testErr: any) {
      const msg = testErr?.message || '';
      if (msg.includes('401') || msg.includes('API_KEY_INVALID')) {
        return res.status(400).json({ error: 'API key is invalid.' });
      }
      if (msg.includes('429')) {
        // 429 means the key IS valid, just rate limited — allow it
      } else if (msg.includes('403')) {
        return res.status(400).json({ error: 'API key does not have permission. Check if the Generative Language API is enabled.' });
      } else {
        return res.status(400).json({ error: `Key validation failed: ${msg.slice(0, 100)}` });
      }
    }

    addApiKey(apiKey.trim());
    const keys = getKeyList();
    return res.status(201).json({ keys, added: apiKey.slice(-4) });
  } catch (err: any) {
    console.error('Error adding API key:', err);
    return res.status(500).json({ error: 'Failed to add API key' });
  }
});

// DELETE /api/settings/api-keys/:suffix — remove a key by suffix
router.delete('/api-keys/:suffix', (req: Request, res: Response) => {
  try {
    const suffix = req.params.suffix as string;
    const removed = removeApiKey(suffix);
    if (!removed) return res.status(404).json({ error: 'Key not found' });
    const keys = getKeyList();
    return res.json({ keys, removed: suffix });
  } catch (err: any) {
    console.error('Error removing API key:', err);
    return res.status(500).json({ error: 'Failed to remove API key' });
  }
});

// ─── Token Usage Stats ──────────────────────────────

// GET /api/settings/token-usage — aggregated usage stats
router.get('/token-usage', (_req: Request, res: Response) => {
  try {
    const stats = getUsageStats();
    return res.json(stats);
  } catch (err: any) {
    console.error('Error getting usage stats:', err);
    return res.status(500).json({ error: 'Failed to get usage stats' });
  }
});

export default router;
