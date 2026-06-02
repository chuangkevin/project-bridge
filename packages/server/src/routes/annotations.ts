import { Router, type Request, type Response } from 'express';
import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { getProject } from '../services/projectService.js';

export function buildAnnotationsRouter(db: Database.Database): Router {
  const r = Router({ mergeParams: true });

  // POST /api/projects/:id/annotations — create annotation
  r.post('/', (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const project = getProject(db, projectId);
    if (!project) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } });
      return;
    }

    const { bridgeId, label, content, specData, positionX, positionY } = req.body ?? {};

    if (!bridgeId || typeof bridgeId !== 'string') {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'bridgeId 為必填字串' } });
      return;
    }

    const id = randomUUID();
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO annotations
         (id, project_id, bridge_id, label, position_x, position_y, content, spec_data, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      projectId,
      bridgeId,
      label ?? '',
      positionX ?? null,
      positionY ?? null,
      content ?? '',
      typeof specData === 'object' ? JSON.stringify(specData) : (specData ?? '{}'),
      now,
      now,
    );

    const annotation = db.prepare('SELECT * FROM annotations WHERE id = ?').get(id);
    res.status(201).json(annotation);
  });

  // GET /api/projects/:id/annotations — list annotations for project
  r.get('/', (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const project = getProject(db, projectId);
    if (!project) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } });
      return;
    }

    const annotations = db.prepare(
      'SELECT * FROM annotations WHERE project_id = ? ORDER BY created_at ASC',
    ).all(projectId);

    res.json({ annotations });
  });

  // PUT /api/projects/:id/annotations/:aid — update annotation
  r.put('/:aid', (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const { aid } = req.params;
    const existing = db.prepare(
      'SELECT * FROM annotations WHERE id = ? AND project_id = ?',
    ).get(aid, projectId) as Record<string, unknown> | undefined;

    if (!existing) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '標註不存在' } });
      return;
    }

    const { label, content, specData, positionX, positionY } = req.body ?? {};
    const now = new Date().toISOString();

    db.prepare(
      `UPDATE annotations
       SET label = ?, content = ?, spec_data = ?, position_x = ?, position_y = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      label !== undefined ? label : existing.label,
      content !== undefined ? content : existing.content,
      specData !== undefined
        ? (typeof specData === 'object' ? JSON.stringify(specData) : specData)
        : existing.spec_data,
      positionX !== undefined ? positionX : existing.position_x,
      positionY !== undefined ? positionY : existing.position_y,
      now,
      aid,
    );

    const updated = db.prepare('SELECT * FROM annotations WHERE id = ?').get(aid);
    res.json(updated);
  });

  // DELETE /api/projects/:id/annotations/:aid — delete annotation
  r.delete('/:aid', (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const { aid } = req.params;
    const existing = db.prepare(
      'SELECT id FROM annotations WHERE id = ? AND project_id = ?',
    ).get(aid, projectId);

    if (!existing) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '標註不存在' } });
      return;
    }

    db.prepare('DELETE FROM annotations WHERE id = ?').run(aid);
    res.status(204).send();
  });

  return r;
}
