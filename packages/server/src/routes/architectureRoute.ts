/**
 * architectureRoute.ts — M1 architecture data persistence + versioning
 *
 * Routes:
 *   GET    /api/projects/:id/architecture                — get arch_data
 *   PATCH  /api/projects/:id/architecture                — save arch_data
 *   POST   /api/projects/:id/architecture/analyze-html   — extract nav edges from HTML
 *   GET    /api/projects/:id/architecture/versions       — list saved versions
 *   POST   /api/projects/:id/architecture/versions       — save current version
 *   POST   /api/projects/:id/architecture/versions/:versionId/restore — restore version
 *
 * M1 adaptations vs legacy:
 *   - No multer upload / OCR / thumbnail routes (those belong to legacy's design flow)
 *   - No documentAnalysisAgent / geminiKeys — AI calls use M1's getProvider()
 *   - Uses getProject() from projectService for validation
 */

import { Router, type Request, type Response } from 'express';
import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import { getProject } from '../services/projectService.js';

export function buildArchitectureRouter(db: Database.Database): Router {
  const r = Router({ mergeParams: true });

  // ── GET — return current arch_data ──────────────────────────────────────
  r.get('/', (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const project = getProject(db, projectId);
    if (!project) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } });
      return;
    }
    const row = db.prepare('SELECT arch_data FROM projects WHERE id = ?').get(projectId) as
      | { arch_data: string | null }
      | undefined;
    const raw = row?.arch_data ?? null;
    res.json({ arch_data: raw ? (JSON.parse(raw) as unknown) : null });
  });

  // ── PATCH — save arch_data ───────────────────────────────────────────────
  r.patch('/', (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const project = getProject(db, projectId);
    if (!project) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } });
      return;
    }
    const { arch_data } = req.body as { arch_data?: unknown };
    if (arch_data === undefined || arch_data === null) {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'arch_data 必填' } });
      return;
    }
    db.prepare("UPDATE projects SET arch_data = ?, updated_at = datetime('now') WHERE id = ?")
      .run(JSON.stringify(arch_data), projectId);
    res.json({ ok: true });
  });

  // ── POST /analyze-html — parse navigation edges from multi-page HTML ─────
  r.post('/analyze-html', (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const project = getProject(db, projectId);
    if (!project) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } });
      return;
    }

    const { html, pages } = req.body as { html?: string; pages?: unknown };
    if (!html || !Array.isArray(pages) || pages.length === 0) {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'html 和 pages 必填' } });
      return;
    }

    // Parse showPage('pageName') calls from HTML to find navigation edges.
    // Identical logic to the legacy route but ported to explicit types.
    const typedPages = pages as string[];
    const edges: Array<{ id: string; source: string; target: string }> = [];

    // Split HTML by <!-- PAGE: name --> or data-page="name" markers
    const pageMarkerRegex = /<!--\s*PAGE:\s*(.+?)\s*-->|data-page="([^"]+)"/g;
    const markers: { name: string; index: number }[] = [];
    let match: RegExpExecArray | null;
    while ((match = pageMarkerRegex.exec(html)) !== null) {
      markers.push({ name: (match[1] ?? match[2]) as string, index: match.index });
    }

    const pageSections: { name: string; html: string }[] =
      markers.length > 0
        ? markers.map((m, i) => ({
            name: m.name,
            html: html.slice(m.index, markers[i + 1]?.index ?? html.length),
          }))
        : [{ name: typedPages[0] ?? '', html }];

    const edgeSet = new Set<string>();
    for (const section of pageSections) {
      const sourceIdx = typedPages.indexOf(section.name);
      if (sourceIdx === -1) continue;
      const sourceId = `page-imported-${sourceIdx}`;
      const sectionRegex = /showPage\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
      let spMatch: RegExpExecArray | null;
      while ((spMatch = sectionRegex.exec(section.html)) !== null) {
        const targetPage = spMatch[1] as string;
        const targetIdx = typedPages.indexOf(targetPage);
        if (targetIdx !== -1 && targetIdx !== sourceIdx) {
          const targetId = `page-imported-${targetIdx}`;
          const key = `${sourceId}->${targetId}`;
          if (!edgeSet.has(key)) {
            edgeSet.add(key);
            edges.push({ id: `edge-${sourceId}-${targetId}`, source: sourceId, target: targetId });
          }
        }
      }
    }

    res.json({ edges });
  });

  // ── GET /versions — list saved versions (newest first, max 50) ───────────
  r.get('/versions', (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const project = getProject(db, projectId);
    if (!project) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } });
      return;
    }
    const versions = db
      .prepare(
        'SELECT id, version, description, created_at FROM architecture_versions WHERE project_id = ? ORDER BY version DESC LIMIT 50',
      )
      .all(projectId);
    res.json({ versions });
  });

  // ── POST /versions — snapshot current arch_data as a named version ───────
  r.post('/versions', (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const project = getProject(db, projectId);
    if (!project) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } });
      return;
    }

    const row = db.prepare('SELECT arch_data FROM projects WHERE id = ?').get(projectId) as
      | { arch_data: string | null }
      | undefined;
    if (!row?.arch_data) {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: '尚無架構資料可儲存' } });
      return;
    }

    const { description } = req.body as { description?: string };
    const maxRow = db
      .prepare('SELECT MAX(version) as maxV FROM architecture_versions WHERE project_id = ?')
      .get(projectId) as { maxV: number | null };
    const newVersion = (maxRow.maxV ?? 0) + 1;
    const id = uuid();
    db.prepare(
      'INSERT INTO architecture_versions (id, project_id, version, arch_data, description) VALUES (?, ?, ?, ?, ?)',
    ).run(id, projectId, newVersion, row.arch_data, description ?? `Version ${newVersion}`);

    // Auto-prune: keep only last 50 per project
    db.prepare(
      'DELETE FROM architecture_versions WHERE project_id = ? AND version NOT IN (SELECT version FROM architecture_versions WHERE project_id = ? ORDER BY version DESC LIMIT 50)',
    ).run(projectId, projectId);

    res.status(201).json({ id, version: newVersion });
  });

  // ── POST /versions/:versionId/restore — restore a saved version ──────────
  r.post('/versions/:versionId/restore', (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const versionId = req.params.versionId as string;

    const project = getProject(db, projectId);
    if (!project) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } });
      return;
    }

    const version = db
      .prepare('SELECT arch_data FROM architecture_versions WHERE id = ? AND project_id = ?')
      .get(versionId, projectId) as { arch_data: string } | undefined;
    if (!version) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '版本不存在' } });
      return;
    }

    // Safety snapshot: auto-save current state before restoring
    const current = db.prepare('SELECT arch_data FROM projects WHERE id = ?').get(projectId) as
      | { arch_data: string | null }
      | undefined;
    if (current?.arch_data) {
      const maxRow = db
        .prepare('SELECT MAX(version) as maxV FROM architecture_versions WHERE project_id = ?')
        .get(projectId) as { maxV: number | null };
      const safetyVersion = (maxRow.maxV ?? 0) + 1;
      db.prepare(
        'INSERT INTO architecture_versions (id, project_id, version, arch_data, description) VALUES (?, ?, ?, ?, ?)',
      ).run(uuid(), projectId, safetyVersion, current.arch_data, '還原前自動備份');
    }

    db.prepare("UPDATE projects SET arch_data = ?, updated_at = datetime('now') WHERE id = ?")
      .run(version.arch_data, projectId);

    res.json({ ok: true, arch_data: JSON.parse(version.arch_data) as unknown });
  });

  return r;
}
