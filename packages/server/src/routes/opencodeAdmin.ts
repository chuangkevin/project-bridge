import { Router, type Request, type Response } from 'express';
import type Database from 'better-sqlite3';
import { requireAdmin } from '../middleware/auth.js';
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
      if (Array.isArray(parsed)) {
        // Accept both the new {baseUrl} object shape (what provider.ts also
        // expects) and the old plain-string shape. Always return URL strings
        // for our own /test and /models handlers.
        const urls = parsed
          .map((item: unknown) => {
            if (typeof item === 'string') return item;
            if (item && typeof item === 'object') {
              const o = item as { baseUrl?: unknown; url?: unknown };
              if (typeof o.baseUrl === 'string') return o.baseUrl;
              if (typeof o.url === 'string') return o.url;
            }
            return '';
          })
          .filter(Boolean);
        if (urls.length > 0) return urls;
      }
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
  r.use(requireAdmin);

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
      // provider.ts's parseOpenCodeServers expects an array of
      // OpenCodeServerConfig objects with {id, label, baseUrl, enabled}.
      // We accept a plain array of URL strings from the client UI and shape
      // them into the expected format here. Saving as strings used to break
      // ai-core silently — it fell back to http://localhost:4096 and the chat
      // call hit ECONNREFUSED inside the pod.
      const cleaned = servers
        .map(String)
        .map(s => s.trim().replace(/\/+$/, ''))
        .filter(Boolean)
        .map((baseUrl, index) => ({
          id: `opencode-${index + 1}`,
          label: `OpenCode ${index + 1}`,
          baseUrl,
          enabled: true,
        }));
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
  // Uses OpenCode's /provider endpoint (same as legacy v1.5.1). /v1/models
  // doesn't exist on opencode-server; it returns HTML 404 which broke the test.
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
        const resp = await fetch(`${url.replace(/\/+$/, '')}/provider`, {
          method: 'GET',
          headers: { ...authHeader, Accept: 'application/json' },
          signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
        });
        const ok = resp.ok;
        if (!ok) {
          return {
            label, url, ok: false, status: resp.status,
            elapsedMs: Date.now() - t0,
            error: `HTTP ${resp.status}`,
          };
        }
        // Verify it actually returned JSON (not nginx HTML error page)
        const ct = resp.headers.get('content-type') ?? '';
        if (!ct.toLowerCase().includes('json')) {
          return {
            label, url, ok: false, status: resp.status,
            elapsedMs: Date.now() - t0,
            error: 'OpenCode 回應不是 JSON（檢查 URL 是否正確）',
          };
        }
        return {
          label, url, ok: true, status: resp.status,
          elapsedMs: Date.now() - t0, error: null,
        };
      } catch (err) {
        return {
          label, url, ok: false, status: 0,
          elapsedMs: Date.now() - t0,
          error: (err as Error).message,
        };
      }
    }));
    const allOk = results.length > 0 && results.every(r => r.ok);
    res.json({ ok: allOk, results });
  });

  // GET /api/settings/opencode/models — fetch model list from first reachable server.
  // OpenCode exposes models via /provider (NOT /v1/models). Response shape:
  //   { all: [ { id: 'google', models: { 'gemini-2.5-flash': { name: '...' } } } ] }
  // We flatten to [{id: '<provider>/<model>', name, provider}] for the UI.
  r.get('/models', async (_req: Request, res: Response) => {
    const servers = getServers(db);
    if (servers.length === 0) {
      res.json({ models: [], warning: '尚未設定任何 OpenCode server' });
      return;
    }
    const authHeader = buildAuthHeader(db);
    let lastError: string | null = null;
    for (const url of servers) {
      try {
        const resp = await fetch(`${url.replace(/\/+$/, '')}/provider`, {
          method: 'GET',
          headers: { ...authHeader, Accept: 'application/json' },
          signal: AbortSignal.timeout(MODELS_TIMEOUT_MS),
        });
        if (!resp.ok) {
          lastError = `HTTP ${resp.status} (${url})`;
          continue;
        }
        const ct = resp.headers.get('content-type') ?? '';
        if (!ct.toLowerCase().includes('json')) {
          lastError = `OpenCode 回應不是 JSON (${url})`;
          continue;
        }
        const data = await resp.json() as { all?: Array<{ id: string; models?: Record<string, { name?: string }> }> };
        const providers = Array.isArray(data?.all) ? data.all : [];
        const models: Array<{ id: string; name: string; provider: string }> = [];
        for (const p of providers) {
          const modelsMap = p.models ?? {};
          for (const [modelId, m] of Object.entries(modelsMap)) {
            models.push({
              id: `${p.id}/${modelId}`,
              name: m?.name ?? modelId,
              provider: p.id,
            });
          }
        }
        res.json({ models, sourceServer: url });
        return;
      } catch (err) {
        lastError = (err as Error).message;
      }
    }
    fail(res, 502, 'UPSTREAM_FAILED', lastError ?? '無法連接到任何 OpenCode server');
  });

  return r;
}
