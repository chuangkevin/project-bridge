import { Router, type Request, type Response } from 'express';
import type Database from 'better-sqlite3';
import { requireAuth } from '../middleware/auth.js';
import { listMcpServers } from '../services/mcpRegistry.js';
import {
  listMcpHttpServers,
  getMcpHttpServer,
  upsertMcpHttpServer,
  deleteMcpHttpServer,
} from '../services/mcpHttpRegistry.js';
import { testMcpHttpServer, listMcpHttpTools } from '../services/mcpHttpClient.js';

function fail(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message } });
}

export function buildMcpRouter(db?: Database.Database): Router {
  const r = Router();
  r.use(requireAuth);

  // GET /api/mcp — connected stdio MCPs from plugins (existing behaviour)
  r.get('/', (_req: Request, res: Response) => {
    res.json({ servers: listMcpServers() });
  });

  // The HTTP MCP CRUD only exists when we have a db handle. createApp always
  // passes one in; the older zero-arg call path is kept for back-compat in tests.
  if (db) {
    // GET /api/mcp/servers — list user-configured HTTP MCPs
    r.get('/servers', (_req: Request, res: Response) => {
      res.json({ servers: listMcpHttpServers(db) });
    });

    // POST /api/mcp/servers — create
    r.post('/servers', (req: Request, res: Response) => {
      const { name, endpoint, enabled, useRecommendedTools, allowedTools, timeoutMs } = (req.body ?? {}) as Record<string, unknown>;
      if (typeof name !== 'string' || !name.trim()) { fail(res, 400, 'VALIDATION_FAILED', '需要 name'); return; }
      if (typeof endpoint !== 'string' || !endpoint.trim()) { fail(res, 400, 'VALIDATION_FAILED', '需要 endpoint'); return; }
      if (!/^https?:\/\//i.test(endpoint)) { fail(res, 400, 'VALIDATION_FAILED', 'endpoint 必須以 http(s):// 開頭'); return; }
      const record = upsertMcpHttpServer(db, {
        name,
        endpoint,
        enabled: enabled !== false,
        useRecommendedTools: useRecommendedTools === true,
        allowedTools: Array.isArray(allowedTools) ? allowedTools.filter((t): t is string => typeof t === 'string') : [],
        timeoutMs: typeof timeoutMs === 'number' ? timeoutMs : undefined,
      });
      res.status(201).json(record);
    });

    // PUT /api/mcp/servers/:id — update
    r.put('/servers/:id', (req: Request, res: Response) => {
      const id = String(req.params.id);
      const existing = getMcpHttpServer(db, id);
      if (!existing) { fail(res, 404, 'NOT_FOUND', 'MCP server 不存在'); return; }
      const { name, endpoint, enabled, useRecommendedTools, allowedTools, timeoutMs } = (req.body ?? {}) as Record<string, unknown>;
      if (typeof name !== 'string' || !name.trim()) { fail(res, 400, 'VALIDATION_FAILED', '需要 name'); return; }
      if (typeof endpoint !== 'string' || !endpoint.trim()) { fail(res, 400, 'VALIDATION_FAILED', '需要 endpoint'); return; }
      if (!/^https?:\/\//i.test(endpoint)) { fail(res, 400, 'VALIDATION_FAILED', 'endpoint 必須以 http(s):// 開頭'); return; }
      const record = upsertMcpHttpServer(db, {
        id,
        name,
        endpoint,
        enabled: enabled !== false,
        useRecommendedTools: useRecommendedTools === true,
        allowedTools: Array.isArray(allowedTools) ? allowedTools.filter((t): t is string => typeof t === 'string') : [],
        timeoutMs: typeof timeoutMs === 'number' ? timeoutMs : undefined,
      });
      res.json(record);
    });

    // DELETE /api/mcp/servers/:id
    r.delete('/servers/:id', (req: Request, res: Response) => {
      const id = String(req.params.id);
      const ok = deleteMcpHttpServer(db, id);
      if (!ok) { fail(res, 404, 'NOT_FOUND', 'MCP server 不存在'); return; }
      res.json({ ok: true });
    });

    // POST /api/mcp/servers/:id/test — JSON-RPC initialize handshake
    r.post('/servers/:id/test', async (req: Request, res: Response) => {
      const id = String(req.params.id);
      const server = getMcpHttpServer(db, id);
      if (!server) { fail(res, 404, 'NOT_FOUND', 'MCP server 不存在'); return; }
      const result = await testMcpHttpServer(server);
      res.json(result);
    });

    // GET /api/mcp/servers/:id/tools
    r.get('/servers/:id/tools', async (req: Request, res: Response) => {
      const id = String(req.params.id);
      const server = getMcpHttpServer(db, id);
      if (!server) { fail(res, 404, 'NOT_FOUND', 'MCP server 不存在'); return; }
      try {
        const tools = await listMcpHttpTools(server);
        res.json({ tools });
      } catch (err) {
        fail(res, 502, 'UPSTREAM_FAILED', (err as Error).message);
      }
    });
  }

  return r;
}
