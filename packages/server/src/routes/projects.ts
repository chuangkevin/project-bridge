import { Router, type Request, type Response } from 'express';
import type Database from 'better-sqlite3';
import {
  createProject, listProjects, getProject, updateProject, deleteProject, rotateShareToken,
} from '../services/projectService.js';

/**
 * Projects router. M1 anonymous mode — no auth, no owner check. Anyone can
 * list / create / update / delete any project. This is the explicit M1
 * contract; see CLAUDE.md "anonymous-first" notes.
 */
export function buildProjectsRouter(db: Database.Database): Router {
  const r = Router();

  r.get('/', (_req: Request, res: Response) => {
    res.json({ projects: listProjects(db) });
  });

  r.post('/', (req: Request, res: Response) => {
    const name = String(req.body?.name ?? '').trim();
    if (!name) { res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: '需要 name' } }); return; }
    // M1 anonymous: prefer the legacy user session id if present (for back-compat
    // with old per-user projects), otherwise NULL.
    const p = createProject(db, req.user?.id ?? null, name);
    res.status(201).json(p);
  });

  r.get('/:id', (req: Request, res: Response) => {
    const p = getProject(db, req.params.id as string);
    if (!p) { res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } }); return; }
    res.json(p);
  });

  r.patch('/:id', (req: Request, res: Response) => {
    const existing = getProject(db, req.params.id as string);
    if (!existing) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } });
      return;
    }
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
    let inheritGlobalStyle: boolean | undefined;
    if (req.body?.inheritGlobalStyle !== undefined) {
      if (typeof req.body.inheritGlobalStyle !== 'boolean') {
        res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'inheritGlobalStyle 必須是布林值' } });
        return;
      }
      inheritGlobalStyle = req.body.inheritGlobalStyle;
    }
    const updated = updateProject(db, req.params.id as string, { name, inheritGlobalStyle });
    res.json(updated);
  });

  r.delete('/:id', (req: Request, res: Response) => {
    const existing = getProject(db, req.params.id as string);
    if (!existing) { res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } }); return; }
    deleteProject(db, req.params.id as string);
    res.json({ ok: true });
  });

  r.post('/:id/share/rotate', (req: Request, res: Response) => {
    const existing = getProject(db, req.params.id as string);
    if (!existing) { res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } }); return; }
    const rotated = rotateShareToken(db, req.params.id as string);
    res.json(rotated);
  });

  return r;
}
