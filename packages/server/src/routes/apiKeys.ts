import { Router, type Request, type Response } from 'express';
import type Database from 'better-sqlite3';
import { requireAdmin } from '../middleware/auth.js';
import { readSetting, writeSetting } from '../services/settings.js';
import { getApiKeyStats } from '../services/apiKeyStats.js';
import { invalidateProvider } from '../services/provider.js';

const KEY_REGEX = /^AIza[A-Za-z0-9_-]{30,}$/;

function fail(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message } });
}

function readEnvKeys(): string[] {
  return (process.env.GEMINI_API_KEY ?? '').split(',').map(s => s.trim()).filter(Boolean);
}

function readStoredKeys(db: Database.Database): string[] {
  const raw = readSetting(db, 'gemini_api_keys') ?? '';
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

export function buildApiKeysRouter(db: Database.Database): Router {
  const r = Router();
  r.use(requireAdmin);

  // GET /api/settings/api-keys
  r.get('/', (_req: Request, res: Response) => {
    const envKeys = readEnvKeys();
    const storedKeys = readStoredKeys(db);
    const seen = new Set<string>();
    const out: Array<{ suffix: string; fromEnv: boolean; today: { calls: number; tokens: number }; total: { calls: number; tokens: number } }> = [];
    for (const key of [...envKeys, ...storedKeys]) {
      const suffix = key.slice(-8);
      if (seen.has(suffix)) continue;
      seen.add(suffix);
      const fromEnv = envKeys.includes(key);
      const stats = getApiKeyStats(db, suffix);
      out.push({ suffix, fromEnv, today: stats.today, total: stats.total });
    }
    res.json({ keys: out });
  });

  // POST /api/settings/api-keys — single key
  r.post('/', (req: Request, res: Response) => {
    const { apiKey } = (req.body ?? {}) as { apiKey?: string };
    if (typeof apiKey !== 'string' || !KEY_REGEX.test(apiKey)) {
      fail(res, 400, 'VALIDATION_FAILED', 'API key 格式錯誤');
      return;
    }
    const existing = new Set(readStoredKeys(db));
    if (existing.has(apiKey)) {
      fail(res, 409, 'DUPLICATE', 'key 已存在');
      return;
    }
    existing.add(apiKey);
    writeSetting(db, 'gemini_api_keys', Array.from(existing).join(','));
    invalidateProvider();
    res.json({ ok: true });
  });

  // POST /api/settings/api-keys/batch — paste multiple keys, one per line
  r.post('/batch', (req: Request, res: Response) => {
    const { text } = (req.body ?? {}) as { text?: string };
    if (typeof text !== 'string') {
      fail(res, 400, 'VALIDATION_FAILED', '需要 text 欄位');
      return;
    }
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const valid = lines.filter(l => KEY_REGEX.test(l));
    const skipped = lines.length - valid.length;
    if (valid.length === 0) {
      fail(res, 400, 'VALIDATION_FAILED', '沒有偵測到有效的 AIza 開頭 key');
      return;
    }
    const existing = new Set(readStoredKeys(db));
    let added = 0;
    for (const k of valid) {
      if (!existing.has(k)) { existing.add(k); added++; }
    }
    writeSetting(db, 'gemini_api_keys', Array.from(existing).join(','));
    invalidateProvider();
    res.json({ ok: true, added, skipped, totalLines: lines.length });
  });

  // DELETE /api/settings/api-keys/:suffix
  r.delete('/:suffix', (req: Request, res: Response) => {
    const suffix = req.params.suffix;
    const envKeys = readEnvKeys();
    if (envKeys.some(k => k.slice(-8) === suffix)) {
      fail(res, 400, 'ENV_KEY_PROTECTED', '此 key 來自環境變數，無法從 UI 刪除');
      return;
    }
    const stored = readStoredKeys(db);
    const filtered = stored.filter(k => k.slice(-8) !== suffix);
    if (filtered.length === stored.length) {
      fail(res, 404, 'NOT_FOUND', 'key 不存在');
      return;
    }
    writeSetting(db, 'gemini_api_keys', filtered.join(','));
    invalidateProvider();
    res.json({ ok: true });
  });

  return r;
}
