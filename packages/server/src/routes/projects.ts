import { Router, type Request, type Response } from 'express';
import type Database from 'better-sqlite3';
import { requireAuth } from '../middleware/auth.js';
import {
  createProject, listProjects, getProject, updateProject, deleteProject, rotateShareToken,
} from '../services/projectService.js';

export function buildProjectsRouter(db: Database.Database): Router {
  const r = Router();
  r.use(requireAuth);

  r.get('/', (req: Request, res: Response) => {
    res.json({ projects: listProjects(db, req.user!.id) });
  });

  r.post('/', (req: Request, res: Response) => {
    const name = String(req.body?.name ?? '').trim();
    if (!name) { res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: '需要 name' } }); return; }
    const p = createProject(db, req.user!.id, name);
    res.status(201).json(p);
  });

  r.get('/:id', (req: Request, res: Response) => {
    const p = getProject(db, req.params.id as string);
    if (!p || p.ownerId !== req.user!.id) { res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } }); return; }
    res.json(p);
  });

  r.patch('/:id', (req: Request, res: Response) => {
    const existing = getProject(db, req.params.id as string);
    if (!existing || existing.ownerId !== req.user!.id) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } });
      return;
    }
    // Validate name if present
    let name: string | undefined;
    if (req.body?.name !== undefined) {
      if (typeof req.body.name !== 'string') {
        res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'name 必須是字串' } });
        return;
      }
      name = req.body.name.trim();
      if (!name) {
        res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: '需要 name' } });
        return;
      }
    }
    const updated = updateProject(db, req.params.id as string, { name });
    res.json(updated);
  });

  r.delete('/:id', (req: Request, res: Response) => {
    const existing = getProject(db, req.params.id as string);
    if (!existing || existing.ownerId !== req.user!.id) { res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } }); return; }
    deleteProject(db, req.params.id as string);
    res.json({ ok: true });
  });

  r.post('/:id/share/rotate', (req: Request, res: Response) => {
    const existing = getProject(db, req.params.id as string);
    if (!existing || existing.ownerId !== req.user!.id) { res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } }); return; }
    const rotated = rotateShareToken(db, req.params.id as string);
    res.json(rotated);
  });

  return r;
}
