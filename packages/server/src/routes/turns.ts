import { Router, type Request, type Response } from 'express';
import type Database from 'better-sqlite3';
import { requireAuth } from '../middleware/auth.js';
import { getProject } from '../services/projectService.js';
import { listTurns, getTurn, type TurnMode } from '../services/turnService.js';

const VALID_MODES: TurnMode[] = ['consult', 'architect', 'design'];

export function buildTurnsRouter(db: Database.Database): Router {
  const r = Router({ mergeParams: true });
  r.use(requireAuth);

  r.get('/', (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const project = getProject(db, projectId);
    if (!project || project.ownerId !== req.user!.id) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } });
      return;
    }
    const mode = typeof req.query.mode === 'string' && (VALID_MODES as string[]).includes(req.query.mode)
      ? (req.query.mode as TurnMode)
      : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const turns = listTurns(db, projectId, { mode, limit });
    res.json({ turns });
  });

  r.get('/:turnId', (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const project = getProject(db, projectId);
    if (!project || project.ownerId !== req.user!.id) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } });
      return;
    }
    const t = getTurn(db, req.params.turnId as string);
    if (!t || t.projectId !== projectId) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Turn 不存在' } });
      return;
    }
    res.json(t);
  });

  return r;
}
