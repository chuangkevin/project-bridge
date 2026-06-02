import { Router, type Request, type Response } from 'express';
import type Database from 'better-sqlite3';
import { requireAuth } from '../middleware/auth.js';
import { readSetting, writeSetting } from '../services/settings.js';
import { invalidateProvider } from '../services/provider.js';

const TEST_TIMEOUT_MS = 8000;
const MODELS_TIMEOUT_MS = 10000;

function fail(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message } });
}

function getServers(db: Database.Database): string[] {
  const stored = readSetting(db, 'opencode_servers');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch { /* fall through */ }
    return stored.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
  }
  const single = readSetting(db, 'opencode_url');
  if (single) return [single];
  const envServers = process.env.OPENCODE_SERVERS;
  if (envServers) return envServers.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
  const envSingle = process.env.OPENCODE_URL;
  if (envSingle) return [envSingle];
  return [];
}

function buildAuthHeader(db: Database.Database): Record<string, string> {
  const password = readSetting(db, 'opencode_server_password') ?? process.env.OPENCODE_SERVER_PASSWORD ?? '';
  if (!password) return {};
  return { Authorization: `Basic ${Buffer.from(`opencode:${password}`).toString('base64')}` };
}

export function buildOpencodeAdminRouter(db: Database.Database): Router {
  const r = Router();
  r.use(requireAuth);

  // GET /api/settings/opencode — current servers + selected models
  r.get('/', (_req: Request, res: Response) => {
    res.json({
      servers: getServers(db),
      textModel: readSetting(db, 'opencode_text_model') ?? '',
      visionModel: readSetting(db, 'opencode_vision_model') ?? '',
      hasPassword: Boolean(readSetting(db, 'opencode_server_password') ?? process.env.OPENCODE_SERVER_PASSWORD),
    });
  });

  // POST /api/settings/opencode — save server list + selected models
  r.post('/', (req: Request, res: Response) => {
    const { servers, textModel, visionModel } = (req.body ?? {}) as {
      servers?: unknown;
      textModel?: unknown;
      visionModel?: unknown;
    };
    if (servers !== undefined) {
      if (!Array.isArray(servers)) {
        fail(res, 400, 'VALIDATION_FAILED', 'servers 必須是字串陣列');
        return;
      }
      const cleaned = servers.map(String).map(s => s.trim()).filter(Boolean);
      writeSetting(db, 'opencode_servers', JSON.stringify(cleaned));
    }
    if (textModel !== undefined) {
      if (typeof textModel !== 'string') {
        fail(res, 400, 'VALIDATION_FAILED', 'textModel 必須是字串');
        return;
      }
      writeSetting(db, 'opencode_text_model', textModel);
    }
    if (visionModel !== undefined) {
      if (typeof visionModel !== 'string') {
        fail(res, 400, 'VALIDATION_FAILED', 'visionModel 必須是字串');
        return;
      }
      writeSetting(db, 'opencode_vision_model', visionModel);
    }
    invalidateProvider();
    res.json({ ok: true });
  });

  // POST /api/settings/opencode/test — per-server connectivity probe
  r.post('/test', async (_req: Request, res: Response) => {
    const servers = getServers(db);
    if (servers.length === 0) {
      res.json({ ok: false, results: [], error: '尚未設定任何 OpenCode server' });
      return;
    }
    const authHeader = buildAuthHeader(db);
    const results = await Promise.all(servers.map(async (url, i) => {
      const label = `server-${i + 1}`;
      const t0 = Date.now();
      try {
        const resp = await fetch(`${url.replace(/\/+$/, '')}/v1/models`, {
          method: 'GET',
          headers: { ...authHeader },
          signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
        });
        const ok = resp.ok;
        return {
          label,
          url,
          ok,
          status: resp.status,
          elapsedMs: Date.now() - t0,
          error: ok ? null : `HTTP ${resp.status}`,
        };
      } catch (err) {
        return {
          label,
          url,
          ok: false,
          status: 0,
          elapsedMs: Date.now() - t0,
          error: (err as Error).message,
        };
      }
    }));
    const allOk = results.length > 0 && results.every(r => r.ok);
    res.json({ ok: allOk, results });
  });

  // GET /api/settings/opencode/models — proxy /v1/models from first server
  r.get('/models', async (_req: Request, res: Response) => {
    const servers = getServers(db);
    if (servers.length === 0) {
      res.json({ models: [] });
      return;
    }
    const authHeader = buildAuthHeader(db);
    try {
      const resp = await fetch(`${servers[0].replace(/\/+$/, '')}/v1/models`, {
        method: 'GET',
        headers: { ...authHeader },
        signal: AbortSignal.timeout(MODELS_TIMEOUT_MS),
      });
      if (!resp.ok) {
        fail(res, 502, 'UPSTREAM_FAILED', `OpenCode HTTP ${resp.status}`);
        return;
      }
      const data = (await resp.json()) as { data?: Array<{ id: string }> };
      const models = (data.data ?? []).map(m => ({ id: m.id, name: m.id, provider: 'opencode' as const }));
      res.json({ models });
    } catch (err) {
      fail(res, 502, 'UPSTREAM_FAILED', (err as Error).message);
    }
  });

  return r;
}
