import { Router, type Request, type Response } from 'express';
import type Database from 'better-sqlite3';
import { requireAuth } from '../middleware/auth.js';
import { getProject } from '../services/projectService.js';
import { listArtifacts, getArtifact, readArtifactPayload, type ArtifactKind } from '../services/artifactService.js';

const VALID_KINDS: ArtifactKind[] = ['vue-sfc', 'page-graph', 'design-tokens'];

export function buildArtifactsRouter(db: Database.Database, dataDir: string): Router {
  const r = Router({ mergeParams: true });
  r.use(requireAuth);

  r.get('/', (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const project = getProject(db, projectId);
    if (!project || project.ownerId !== req.user!.id) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } });
      return;
    }
    const kind = typeof req.query.kind === 'string' ? req.query.kind : undefined;
    if (kind && !(VALID_KINDS as string[]).includes(kind)) {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'kind 無效' } });
      return;
    }
    const includeSuperseded = req.query.includeSuperseded === 'true';
    res.json({ artifacts: listArtifacts(db, projectId, { kind: kind as ArtifactKind | undefined, includeSuperseded }) });
  });

  r.get('/:artifactId', (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const project = getProject(db, projectId);
    if (!project || project.ownerId !== req.user!.id) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } });
      return;
    }
    const a = getArtifact(db, req.params.artifactId as string);
    if (!a || a.projectId !== projectId) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '產物不存在' } });
      return;
    }
    res.json(a);
  });

  r.get('/:artifactId/payload', (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const project = getProject(db, projectId);
    if (!project || project.ownerId !== req.user!.id) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } });
      return;
    }
    const a = getArtifact(db, req.params.artifactId as string);
    if (!a || a.projectId !== projectId) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '產物不存在' } });
      return;
    }
    try {
      const payload = readArtifactPayload(dataDir, a);
      if (a.kind === 'page-graph' || a.kind === 'design-tokens') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
      } else {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      }
      res.send(payload);
    } catch (err) {
      res.status(500).json({ error: { code: 'PAYLOAD_READ_FAILED', message: (err as Error).message } });
    }
  });

  return r;
}
