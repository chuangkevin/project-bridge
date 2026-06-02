import { Router, type Request, type Response } from 'express';
import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { getProject } from '../services/projectService.js';

const VALID_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as const;

function safeJson(value: unknown, fallback: string): string {
  if (typeof value === 'string') {
    try { JSON.parse(value); return value; } catch { return fallback; }
  }
  if (value !== undefined && value !== null) {
    try { return JSON.stringify(value); } catch { return fallback; }
  }
  return fallback;
}

function safeParse(value: unknown, fallback: unknown): unknown {
  if (typeof value !== 'string') return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function extractPageFromBridgeId(bridgeId: string): string {
  const match = bridgeId.match(/^(page\d+|home|login|dashboard|settings|profile|about|contact)/i);
  return match ? match[1] : 'default';
}

function formatBinding(row: Record<string, unknown>) {
  return {
    id: row.id,
    projectId: row.project_id,
    bridgeId: row.bridge_id,
    method: row.method,
    url: row.url,
    params: safeParse(row.params as string, []),
    responseSchema: safeParse(row.response_schema as string, {}),
    fieldMappings: safeParse(row.field_mappings as string, []),
    pageName: (row.page_name as string | null) ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function buildApiBindingsRouter(db: Database.Database): Router {
  const r = Router({ mergeParams: true });

  // GET /api/projects/:id/api-bindings — list all bindings for project
  r.get('/', (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const project = getProject(db, projectId);
    if (!project) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } });
      return;
    }

    const pageName = typeof req.query.page_name === 'string' ? req.query.page_name : undefined;
    const pageLevel = req.query.page_level === 'true';

    let bindings: Record<string, unknown>[];
    if (pageLevel) {
      bindings = db.prepare(
        'SELECT * FROM api_bindings WHERE project_id = ? AND page_name IS NOT NULL ORDER BY created_at ASC',
      ).all(projectId) as Record<string, unknown>[];
    } else if (pageName) {
      bindings = db.prepare(
        'SELECT * FROM api_bindings WHERE project_id = ? AND page_name = ? ORDER BY created_at ASC',
      ).all(projectId, pageName) as Record<string, unknown>[];
    } else {
      bindings = db.prepare(
        'SELECT * FROM api_bindings WHERE project_id = ? ORDER BY created_at ASC',
      ).all(projectId) as Record<string, unknown>[];
    }

    res.json({ bindings: bindings.map(formatBinding) });
  });

  // POST /api/projects/:id/api-bindings — create binding
  r.post('/', (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const project = getProject(db, projectId);
    if (!project) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } });
      return;
    }

    const { bridgeId, method, url, params, responseSchema, fieldMappings, pageName } = req.body ?? {};

    if (!bridgeId || typeof bridgeId !== 'string') {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'bridgeId 為必填字串' } });
      return;
    }

    const m = (method ?? 'GET').toUpperCase();
    if (!(VALID_METHODS as readonly string[]).includes(m)) {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: `method 必須為 ${VALID_METHODS.join(', ')}` } });
      return;
    }

    const paramsJson = safeJson(params, '[]');
    const responseSchemaJson = safeJson(responseSchema, '{}');
    const fieldMappingsJson = safeJson(fieldMappings, '[]');
    const pageNameValue = (pageName && typeof pageName === 'string') ? pageName : null;

    const id = randomUUID();
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO api_bindings
         (id, project_id, bridge_id, method, url, params, response_schema, field_mappings, page_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, projectId, bridgeId, m, url ?? '', paramsJson, responseSchemaJson, fieldMappingsJson, pageNameValue, now, now);

    const row = db.prepare('SELECT * FROM api_bindings WHERE id = ?').get(id) as Record<string, unknown>;
    res.status(201).json(formatBinding(row));
  });

  // PUT /api/projects/:id/api-bindings/:bindingId — update binding
  r.put('/:bindingId', (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const { bindingId } = req.params;

    const existing = db.prepare(
      'SELECT * FROM api_bindings WHERE id = ? AND project_id = ?',
    ).get(bindingId, projectId) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API binding 不存在' } });
      return;
    }

    const { method, url, params, responseSchema, fieldMappings, pageName } = req.body ?? {};

    const m = method ? (method as string).toUpperCase() : (existing.method as string);
    if (method && !(VALID_METHODS as readonly string[]).includes(m)) {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: `method 必須為 ${VALID_METHODS.join(', ')}` } });
      return;
    }

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE api_bindings
       SET method = ?, url = ?, params = ?, response_schema = ?, field_mappings = ?, page_name = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      m,
      url !== undefined ? url : existing.url,
      params !== undefined ? safeJson(params, existing.params as string) : existing.params,
      responseSchema !== undefined ? safeJson(responseSchema, existing.response_schema as string) : existing.response_schema,
      fieldMappings !== undefined ? safeJson(fieldMappings, existing.field_mappings as string) : existing.field_mappings,
      pageName !== undefined ? (pageName || null) : existing.page_name,
      now,
      bindingId,
    );

    const row = db.prepare('SELECT * FROM api_bindings WHERE id = ?').get(bindingId) as Record<string, unknown>;
    res.json(formatBinding(row));
  });

  // DELETE /api/projects/:id/api-bindings/:bindingId — delete binding
  r.delete('/:bindingId', (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const { bindingId } = req.params;

    const existing = db.prepare(
      'SELECT * FROM api_bindings WHERE id = ? AND project_id = ?',
    ).get(bindingId, projectId);
    if (!existing) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API binding 不存在' } });
      return;
    }

    db.prepare('DELETE FROM api_bindings WHERE id = ?').run(bindingId);
    res.json({ ok: true });
  });

  // GET /api/projects/:id/api-bindings/export — export all bindings as structured JSON download
  r.get('/export', (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const project = getProject(db, projectId) as (Record<string, unknown> | null);
    if (!project) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } });
      return;
    }

    const bindings = db.prepare(
      'SELECT * FROM api_bindings WHERE project_id = ? ORDER BY created_at ASC',
    ).all(projectId) as Record<string, unknown>[];

    // Group bindings by page
    const pages: Record<string, unknown[]> = {};
    for (const b of bindings) {
      const pageName = (b.page_name as string | null) ?? extractPageFromBridgeId(b.bridge_id as string);
      if (!pages[pageName]) pages[pageName] = [];
      pages[pageName].push({
        bridgeId: b.bridge_id,
        method: b.method,
        url: b.url,
        params: safeParse(b.params as string, []),
        responseSchema: safeParse(b.response_schema as string, {}),
        fieldMappings: safeParse(b.field_mappings as string, []),
        pageName: (b.page_name as string | null) ?? null,
        isPageLevel: !!(b.page_name),
      });
    }

    res.setHeader('Content-Disposition', `attachment; filename="api-bindings-${projectId}.json"`);
    res.json({
      projectId,
      projectName: project.name,
      exportedAt: new Date().toISOString(),
      pages,
      summary: {
        totalBindings: bindings.length,
      },
    });
  });

  return r;
}
