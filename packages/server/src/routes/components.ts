import { Router, type Request, type Response } from 'express';
import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { getProject } from '../services/projectService.js';
import { getArtifact, readArtifactPayload } from '../services/artifactService.js';
import { locateByPath, relatedStyles } from '../services/sfcSurgeon.js';
import { snapshotComponentVersion, listComponentVersions } from '../services/componentLibrary.js';

const VALID_CATEGORIES = ['layout', 'navigation', 'form', 'data-display', 'feedback', 'other'] as const;

function formatComponent(row: Record<string, unknown>) {
  return {
    id: row.id,
    projectId: (row.project_id as string | null) ?? null,
    name: row.name,
    category: row.category,
    description: (row.description as string) ?? '',
    html: row.html,
    css: row.css,
    tags: (() => { try { return JSON.parse(row.tags as string); } catch { return []; } })(),
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Same-scope same-name lookup (spec: 不靜默覆蓋). */
function findSameScopeByName(db: Database.Database, name: string, projectId: string | null): Record<string, unknown> | undefined {
  return projectId
    ? db.prepare('SELECT * FROM components WHERE name = ? AND project_id = ?').get(name, projectId) as Record<string, unknown> | undefined
    : db.prepare('SELECT * FROM components WHERE name = ? AND project_id IS NULL').get(name) as Record<string, unknown> | undefined;
}

export function buildComponentsRouter(db: Database.Database): Router {
  const r = Router({ mergeParams: true });

  // GET /api/components — list all components (optionally filter by project_id or category)
  r.get('/', (req: Request, res: Response) => {
    const projectId = typeof req.query.project_id === 'string' ? req.query.project_id : undefined;
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;

    let sql = 'SELECT * FROM components WHERE 1=1';
    const params: unknown[] = [];

    if (projectId) { sql += ' AND project_id = ?'; params.push(projectId); }
    if (category) { sql += ' AND category = ?'; params.push(category); }

    sql += ' ORDER BY updated_at DESC';

    const components = (db.prepare(sql).all(...params) as Record<string, unknown>[]).map(formatComponent);
    res.json({ components });
  });

  // POST /api/components — create (409 on same-scope name conflict unless overwrite)
  r.post('/', (req: Request, res: Response) => {
    const { name, category, html, css, tags, projectId, description, overwrite } = req.body ?? {};

    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'name 為必填字串' } });
      return;
    }
    if (!html || typeof html !== 'string') {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'html 為必填字串' } });
      return;
    }

    const cat = category && (VALID_CATEGORIES as readonly string[]).includes(category) ? category : 'other';
    const tagsJson = typeof tags === 'string' ? tags : JSON.stringify(Array.isArray(tags) ? tags : []);

    // Validate projectId if provided
    if (projectId) {
      const project = getProject(db, projectId as string);
      if (!project) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } });
        return;
      }
    }

    const now = new Date().toISOString();
    const existing = findSameScopeByName(db, name, (projectId as string | undefined) ?? null);
    if (existing) {
      if (overwrite !== true) {
        res.status(409).json({ error: { code: 'NAME_CONFLICT', message: `同範圍已存在元件「${name}」，請改名或選擇覆蓋`, existingId: existing.id } });
        return;
      }
      snapshotComponentVersion(db, existing.id as string);
      db.prepare(
        `UPDATE components SET category = ?, description = ?, html = ?, css = ?, tags = ?, version = version + 1, updated_at = ? WHERE id = ?`,
      ).run(cat, typeof description === 'string' ? description : (existing.description ?? ''), html, css ?? '', tagsJson, now, existing.id);
      const row = db.prepare('SELECT * FROM components WHERE id = ?').get(existing.id) as Record<string, unknown>;
      res.status(200).json(formatComponent(row));
      return;
    }

    const id = randomUUID();
    db.prepare(
      `INSERT INTO components (id, project_id, name, category, description, html, css, tags, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    ).run(id, projectId ?? null, name, cat, typeof description === 'string' ? description : '', html, css ?? '', tagsJson, now, now);

    const row = db.prepare('SELECT * FROM components WHERE id = ?').get(id) as Record<string, unknown>;
    res.status(201).json(formatComponent(row));
  });

  // GET /api/components/:componentId/versions — refinement history
  r.get('/:componentId/versions', (req: Request, res: Response) => {
    const existing = db.prepare('SELECT id FROM components WHERE id = ?').get(req.params.componentId);
    if (!existing) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '元件不存在' } });
      return;
    }
    res.json({ versions: listComponentVersions(db, req.params.componentId as string) });
  });

  // GET /api/components/:componentId — get one
  r.get('/:componentId', (req: Request, res: Response) => {
    const row = db.prepare('SELECT * FROM components WHERE id = ?').get(req.params.componentId) as Record<string, unknown> | undefined;
    if (!row) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '元件不存在' } });
      return;
    }
    res.json(formatComponent(row));
  });

  // PUT /api/components/:componentId — update
  r.put('/:componentId', (req: Request, res: Response) => {
    const existing = db.prepare('SELECT * FROM components WHERE id = ?').get(req.params.componentId) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '元件不存在' } });
      return;
    }

    const { name, category, html, css, tags, description } = req.body ?? {};
    const now = new Date().toISOString();

    const newName = name !== undefined ? name : existing.name;
    const newHtml = html !== undefined ? html : existing.html;
    if (!newName || typeof newName !== 'string') {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'name 必須為非空字串' } });
      return;
    }
    if (!newHtml || typeof newHtml !== 'string') {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'html 必須為非空字串' } });
      return;
    }

    const cat = category && (VALID_CATEGORIES as readonly string[]).includes(category) ? category : existing.category;
    const tagsJson = tags !== undefined
      ? (typeof tags === 'string' ? tags : JSON.stringify(Array.isArray(tags) ? tags : []))
      : existing.tags;

    // Keep refinement history queryable before mutating (component-library spec)
    snapshotComponentVersion(db, req.params.componentId as string);

    db.prepare(
      `UPDATE components
       SET name = ?, category = ?, description = ?, html = ?, css = ?, tags = ?, version = version + 1, updated_at = ?
       WHERE id = ?`,
    ).run(newName, cat, description !== undefined ? description : (existing.description ?? ''), newHtml, css !== undefined ? css : existing.css, tagsJson, now, req.params.componentId);

    const row = db.prepare('SELECT * FROM components WHERE id = ?').get(req.params.componentId) as Record<string, unknown>;
    res.json(formatComponent(row));
  });

  // DELETE /api/components/:componentId — delete
  r.delete('/:componentId', (req: Request, res: Response) => {
    const existing = db.prepare('SELECT id FROM components WHERE id = ?').get(req.params.componentId);
    if (!existing) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '元件不存在' } });
      return;
    }
    db.prepare('DELETE FROM components WHERE id = ?').run(req.params.componentId);
    res.status(204).send();
  });

  return r;
}

/**
 * Mounted at /api/projects/:id — provides the save-from-artifact route.
 * Separated so it can use the project :id param correctly.
 */
export function buildComponentsSaveRouter(db: Database.Database, dataDir: string): Router {
  const r = Router({ mergeParams: true });

  // POST /api/projects/:id/components/save-from-artifact — save the whole
  // artifact OR (with elementPath) a single subtree as a reusable component.
  r.post('/components/save-from-artifact', (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const project = getProject(db, projectId);
    if (!project) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } });
      return;
    }

    const { artifactId, name, category, tags, description, elementPath, scope, overwrite } = req.body ?? {};

    if (!artifactId || typeof artifactId !== 'string') {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'artifactId 為必填字串' } });
      return;
    }

    const artifact = getArtifact(db, artifactId);
    if (!artifact || artifact.projectId !== projectId) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '產物不存在' } });
      return;
    }

    let payload: string;
    try {
      payload = readArtifactPayload(dataDir, artifact);
    } catch {
      res.status(500).json({ error: { code: 'READ_FAILED', message: '無法讀取產物內容' } });
      return;
    }

    // Element-level extraction (component-library spec: 選取元素存為元件)
    let html = payload;
    let css = '';
    const path: number[] | null = Array.isArray(elementPath)
      && elementPath.length > 0
      && elementPath.every((n: unknown) => Number.isInteger(n) && (n as number) >= 0)
      ? elementPath
      : null;
    if (path) {
      const located = locateByPath(payload, path);
      if (!located) {
        res.status(400).json({ error: { code: 'ELEMENT_NOT_FOUND', message: `路徑 [${path.join('/')}] 在 artifact 中定位失敗` } });
        return;
      }
      html = located.source;
      css = relatedStyles(payload, located.source);
    }

    const componentName = (name && typeof name === 'string') ? name.trim() : artifact.name;
    if (!componentName) {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: '元件名稱不能為空' } });
      return;
    }

    const cat = category && (VALID_CATEGORIES as readonly string[]).includes(category)
      ? category
      : 'other';

    const tagsJson = tags !== undefined
      ? (typeof tags === 'string' ? tags : JSON.stringify(Array.isArray(tags) ? tags : []))
      : '[]';

    const scopeProjectId = scope === 'global' ? null : projectId;
    const now = new Date().toISOString();

    const existing = findSameScopeByName(db, componentName, scopeProjectId);
    if (existing) {
      if (overwrite !== true) {
        res.status(409).json({ error: { code: 'NAME_CONFLICT', message: `同範圍已存在元件「${componentName}」，請改名或選擇覆蓋`, existingId: existing.id } });
        return;
      }
      snapshotComponentVersion(db, existing.id as string);
      db.prepare(
        `UPDATE components SET category = ?, description = ?, html = ?, css = ?, tags = ?, version = version + 1, updated_at = ? WHERE id = ?`,
      ).run(cat, typeof description === 'string' ? description : (existing.description ?? ''), html, css, tagsJson, now, existing.id);
      const row = db.prepare('SELECT * FROM components WHERE id = ?').get(existing.id) as Record<string, unknown>;
      res.status(200).json(formatComponent(row));
      return;
    }

    const id = randomUUID();
    db.prepare(
      `INSERT INTO components (id, project_id, name, category, description, html, css, tags, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    ).run(id, scopeProjectId, componentName, cat, typeof description === 'string' ? description : '', html, css, tagsJson, now, now);

    const row = db.prepare('SELECT * FROM components WHERE id = ?').get(id) as Record<string, unknown>;
    res.status(201).json(formatComponent(row));
  });

  return r;
}
