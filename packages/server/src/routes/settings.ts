import { Router, Request, Response, NextFunction } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import db from '../db/connection';
import {
  getKeyList, addApiKey, removeApiKey, getUsageStats,
  getGeminiModel, invalidateKeyCache,
} from '../services/geminiKeys';
import { deleteMcpServer, getMcpServer, listMcpServers, upsertMcpServer } from '../services/mcpRegistry';
import { listMcpTools, testMcpServer } from '../services/mcpHttpClient';

const router = Router();

// ─── Auth middleware for settings routes ────────────
function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  // 1. Check admin password token
  if (token) {
    const stored = db.prepare("SELECT value FROM settings WHERE key = 'admin_session_token'").get() as { value: string } | undefined;
    const expiry = db.prepare("SELECT value FROM settings WHERE key = 'admin_session_expiry'").get() as { value: string } | undefined;
    if (stored?.value === token && expiry?.value && new Date(expiry.value) > new Date()) {
      next();
      return;
    }
  }

  // 2. Check X-Admin-Token header (client sends admin token separately)
  const adminToken = req.headers['x-admin-token'] as string | undefined;
  if (adminToken) {
    const stored = db.prepare("SELECT value FROM settings WHERE key = 'admin_session_token'").get() as { value: string } | undefined;
    const expiry = db.prepare("SELECT value FROM settings WHERE key = 'admin_session_expiry'").get() as { value: string } | undefined;
    if (stored?.value === adminToken && expiry?.value && new Date(expiry.value) > new Date()) {
      next();
      return;
    }
  }

  // 3. Session-based auth: admin role (from authMiddleware)
  const user = (req as any).user;
  if (user?.role === 'admin') {
    next();
    return;
  }

  // 4. Fallback: fresh install (no users), allow access
  const userCount = (db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number } | undefined)?.count ?? 0;
  if (userCount === 0) {
    next();
    return;
  }

  res.status(401).json({ error: '未授權，需要管理員權限' });
}

// Apply auth middleware to all settings routes
router.use(requireAuth);

const SENSITIVE_KEYS = ['gemini_api_key', 'gemini_api_keys', 'openai_api_key', 'code_to_design_api_key'];

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

// POST /api/settings/api-keys/batch — bulk import keys from multi-line text
router.post('/api-keys/batch', (req: Request, res: Response) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Missing text field' });
    }
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const added: string[] = [];
    const skipped: string[] = [];
    for (const line of lines) {
      // Skip label lines (start with -)
      if (line.startsWith('-')) continue;
      // Only accept lines that look like Gemini keys
      if (line.startsWith('AIza') && line.length >= 30) {
        try {
          addApiKey(line);
          added.push('...' + line.slice(-4));
        } catch {
          skipped.push('...' + line.slice(-4));
        }
      }
    }
    const keys = getKeyList();
    return res.json({ keys, added, skipped, totalAdded: added.length });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to batch import keys' });
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

// POST /api/settings/validate-key — test if a key works without saving it
router.post('/validate-key', async (req: Request, res: Response) => {
  const { apiKey } = req.body;
  if (!apiKey || typeof apiKey !== 'string') {
    return res.status(400).json({ valid: false, error: 'Missing apiKey' });
  }
  try {
    const genai = new GoogleGenerativeAI(apiKey);
    const model = genai.getGenerativeModel({
      model: getGeminiModel(),
      generationConfig: { maxOutputTokens: 1 },
    });
    await model.generateContent('Hi');
    return res.json({ valid: true });
  } catch (err: any) {
    const msg = err?.message || '';
    if (msg.includes('429')) {
      return res.json({ valid: true, warning: 'Key is valid but currently rate-limited' });
    }
    if (msg.includes('401') || msg.includes('API_KEY_INVALID')) {
      return res.json({ valid: false, error: 'Invalid API key' });
    }
    if (msg.includes('403')) {
      return res.json({ valid: false, error: 'No permission — check if Generative Language API is enabled' });
    }
    return res.json({ valid: false, error: msg.slice(0, 150) });
  }
});

// POST /api/settings/api-keys/batch-validate — validate multiple keys without saving
router.post('/api-keys/batch-validate', async (req: Request, res: Response) => {
  const { keys } = req.body;
  if (!Array.isArray(keys) || keys.length === 0) {
    return res.status(400).json({ error: 'Missing keys array' });
  }
  if (keys.length > 20) {
    return res.status(400).json({ error: 'Maximum 20 keys per batch' });
  }

  const results: { suffix: string; valid: boolean; error?: string; warning?: string }[] = [];

  for (const key of keys) {
    if (typeof key !== 'string' || !key.trim()) {
      results.push({ suffix: '????', valid: false, error: 'Empty or invalid key' });
      continue;
    }
    const suffix = key.slice(-4);
    try {
      const genai = new GoogleGenerativeAI(key);
      const model = genai.getGenerativeModel({
        model: getGeminiModel(),
        generationConfig: { maxOutputTokens: 1 },
      });
      await model.generateContent('Hi');
      results.push({ suffix, valid: true });
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg.includes('429')) {
        results.push({ suffix, valid: true, warning: 'Key is valid but currently rate-limited' });
      } else if (msg.includes('401') || msg.includes('API_KEY_INVALID')) {
        results.push({ suffix, valid: false, error: 'Invalid API key' });
      } else if (msg.includes('403')) {
        results.push({ suffix, valid: false, error: 'No permission — check if Generative Language API is enabled' });
      } else {
        results.push({ suffix, valid: false, error: msg.slice(0, 150) });
      }
    }
  }

  const validCount = results.filter(r => r.valid).length;
  return res.json({ results, total: results.length, valid: validCount, invalid: results.length - validCount });
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

// ─── MCP Server Management ──────────────────────────

router.get('/mcp-servers', (_req: Request, res: Response) => {
  try {
    return res.json({ servers: listMcpServers() });
  } catch (err: any) {
    console.error('Error listing MCP servers:', err);
    return res.status(500).json({ error: 'Failed to list MCP servers' });
  }
});

router.post('/mcp-servers', (req: Request, res: Response) => {
  try {
    const { name, endpoint, enabled, allowedTools, timeoutMs } = req.body || {};
    if (!name || typeof name !== 'string') return res.status(400).json({ error: 'Server name is required' });
    if (!endpoint || typeof endpoint !== 'string') return res.status(400).json({ error: 'Endpoint is required' });
    if (!/^https?:\/\//i.test(endpoint)) return res.status(400).json({ error: 'Endpoint must start with http:// or https://' });

    const server = upsertMcpServer({
      name,
      endpoint,
      enabled: enabled !== false,
      allowedTools: Array.isArray(allowedTools) ? allowedTools : [],
      timeoutMs: typeof timeoutMs === 'number' ? timeoutMs : undefined,
    });
    return res.status(201).json(server);
  } catch (err: any) {
    console.error('Error creating MCP server:', err);
    return res.status(500).json({ error: 'Failed to create MCP server' });
  }
});

router.put('/mcp-servers/:id', (req: Request, res: Response) => {
  try {
    const serverId = String(req.params.id);
    const existing = getMcpServer(serverId);
    if (!existing) return res.status(404).json({ error: 'MCP server not found' });

    const { name, endpoint, enabled, allowedTools, timeoutMs } = req.body || {};
    if (!name || typeof name !== 'string') return res.status(400).json({ error: 'Server name is required' });
    if (!endpoint || typeof endpoint !== 'string') return res.status(400).json({ error: 'Endpoint is required' });
    if (!/^https?:\/\//i.test(endpoint)) return res.status(400).json({ error: 'Endpoint must start with http:// or https://' });

    const server = upsertMcpServer({
      id: serverId,
      name,
      endpoint,
      enabled: enabled !== false,
      allowedTools: Array.isArray(allowedTools) ? allowedTools : [],
      timeoutMs: typeof timeoutMs === 'number' ? timeoutMs : undefined,
    });
    return res.json(server);
  } catch (err: any) {
    console.error('Error updating MCP server:', err);
    return res.status(500).json({ error: 'Failed to update MCP server' });
  }
});

router.delete('/mcp-servers/:id', (req: Request, res: Response) => {
  try {
    const deleted = deleteMcpServer(String(req.params.id));
    if (!deleted) return res.status(404).json({ error: 'MCP server not found' });
    return res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting MCP server:', err);
    return res.status(500).json({ error: 'Failed to delete MCP server' });
  }
});

router.post('/mcp-servers/:id/test', async (req: Request, res: Response) => {
  try {
    const server = getMcpServer(String(req.params.id));
    if (!server) return res.status(404).json({ error: 'MCP server not found' });
    const result = await testMcpServer(server);
    return res.json(result);
  } catch (err: any) {
    console.error('Error testing MCP server:', err);
    return res.status(500).json({ error: 'Failed to test MCP server' });
  }
});

router.get('/mcp-servers/:id/tools', async (req: Request, res: Response) => {
  try {
    const server = getMcpServer(String(req.params.id));
    if (!server) return res.status(404).json({ error: 'MCP server not found' });
    const tools = await listMcpTools(server);
    return res.json({ tools });
  } catch (err: any) {
    console.error('Error listing MCP tools:', err);
    return res.status(500).json({ error: err?.message || 'Failed to list MCP tools' });
  }
});

export default router;
