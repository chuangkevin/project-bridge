import { Router, type Request, type Response } from 'express';
import type Database from 'better-sqlite3';
import { getProject } from '../services/projectService.js';
import { buildProjectBackup } from '../services/backupService.js';

export function buildBackupRouter(db: Database.Database, dataDir: string): Router {
  const r = Router({ mergeParams: true });

  r.get('/', (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const project = getProject(db, projectId);
    if (!project) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } });
      return;
    }

    const safeName = project.name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'project';
    const ts = new Date().toISOString().replace(/[:T.]/g, '-').slice(0, 16);
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="designbridge-${safeName}-${ts}.tar.gz"`);

    try {
      buildProjectBackup(db, projectId, dataDir).pipe(res);
    } catch (err) {
      res.status(500).json({ error: { code: 'BACKUP_FAILED', message: (err as Error).message } });
    }
  });

  return r;
}
