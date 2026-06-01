import { Router, type Request, type Response } from 'express';
import type Database from 'better-sqlite3';
import { requireAuth } from '../middleware/auth.js';
import { readSetting, writeSetting, deleteSetting } from '../services/settings.js';
import { invalidateProvider } from '../services/provider.js';

const WRITABLE_KEYS = new Set([
  'gemini_api_keys',          // comma-separated
  'gemini_model',
  'opencode_url',              // legacy single
  'opencode_servers',          // JSON array
  'opencode_server_password',
  'openai_api_key',
  'openai_oauth_client_id',
  'public_base_url',
]);

const SECRET_KEYS = new Set([
  'gemini_api_keys',
  'opencode_server_password',
  'openai_api_key',
  'openai_oauth_access_token',
  'openai_oauth_refresh_token',
]);

export function maskValue(key: string, value: string | null): string | null {
  if (!value) return null;
  if (!SECRET_KEYS.has(key)) return value;
  if (value.length <= 8) return '••••••••';
  return value.slice(0, 4) + '••••' + value.slice(-4);
}

export function buildSettingsAdminRouter(db: Database.Database): Router {
  const r = Router();
  r.use(requireAuth);

  r.get('/:key', (req: Request, res: Response) => {
    const key = req.params.key as string;
    if (!WRITABLE_KEYS.has(key) && !SECRET_KEYS.has(key)) {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'key 不允許讀取' } });
      return;
    }
    const value = readSetting(db, key);
    res.json({ key, value: maskValue(key, value), present: value !== null });
  });

  r.put('/:key', (req: Request, res: Response) => {
    const key = req.params.key as string;
    if (!WRITABLE_KEYS.has(key)) {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'key 不允許寫入' } });
      return;
    }
    const value = req.body?.value;
    if (typeof value !== 'string') {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: '需要 value 字串' } });
      return;
    }
    writeSetting(db, key, value);
    invalidateProvider();
    res.json({ ok: true });
  });

  r.delete('/:key', (req: Request, res: Response) => {
    const key = req.params.key as string;
    if (!WRITABLE_KEYS.has(key)) {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'key 不允許刪除' } });
      return;
    }
    deleteSetting(db, key);
    invalidateProvider();
    res.json({ ok: true });
  });

  r.post('/_reload-provider', (_req: Request, res: Response) => {
    invalidateProvider();
    res.json({ ok: true });
  });

  return r;
}
