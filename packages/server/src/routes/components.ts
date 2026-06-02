import { Router, type Request, type Response } from 'express';
import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { getProject } from '../services/projectService.js';
import { getArtifact, readArtifactPayload } from '../services/artifactService.js';

const VALID_CATEGORIES = ['layout', 'navigation', 'form', 'data-display', 'feedback', 'other'] as const;

function formatComponent(row: Record<string, unknown>) {
  return {
    id: row.id,
    projectId: (row.project_id as string | null) ?? null,
    name: row.name,
    category: row.category,
    html: row.html,
    css: row.css,
    tags: (() => { try { return JSON.parse(row.tags as string); } catch { return []; } })(),
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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

  // POST /api/components — create
  r.post('/', (req: Request, res: Response) => {
    const { name, category, html, css, tags, projectId } = req.body ?? {};

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

    const id = randomUUID();
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO components (id, project_id, name, category, html, css, tags, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    ).run(id, projectId ?? null, name, cat, html, css ?? '', tagsJson, now, now);

    const row = db.prepare('SELECT * FROM components WHERE id = ?').get(id) as Record<string, unknown>;
    res.status(201).json(formatComponent(row));
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

    const { name, category, html, css, tags } = req.body ?? {};
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

    db.prepare(
      `UPDATE components
       SET name = ?, category = ?, html = ?, css = ?, tags = ?, version = version + 1, updated_at = ?
       WHERE id = ?`,
    ).run(newName, cat, newHtml, css !== undefined ? css : existing.css, tagsJson, now, req.params.componentId);

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

  // POST /api/projects/:id/components/save-from-artifact — save artifact as a reusable component
  r.post('/components/save-from-artifact', (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const project = getProject(db, projectId);
    if (!project) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } });
      return;
    }

    const { artifactId, name, category, tags } = req.body ?? {};

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

    const componentName = (name && typeof name === 'string') ? name.trim() : artifact.name;
    if (!componentName) {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: '元件名稱不能為空' } });
      return;
    }

    const cat = category && (['layout', 'navigation', 'form', 'data-display', 'feedback', 'other'] as string[]).includes(category)
      ? category
      : 'other';

    const tagsJson = tags !== undefined
      ? (typeof tags === 'string' ? tags : JSON.stringify(Array.isArray(tags) ? tags : []))
      : '[]';

    const id = randomUUID();
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO components (id, project_id, name, category, html, css, tags, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    ).run(id, projectId, componentName, cat, payload, '', tagsJson, now, now);

    const row = db.prepare('SELECT * FROM components WHERE id = ?').get(id) as Record<string, unknown>;
    const comp = {
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      category: row.category,
      html: row.html,
      css: row.css,
      tags: (() => { try { return JSON.parse(row.tags as string); } catch { return []; } })(),
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    res.status(201).json(comp);
  });

  return r;
}
