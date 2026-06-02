import { Router, type Request, type Response } from 'express';
import type Database from 'better-sqlite3';
import { getProject } from '../services/projectService.js';
import { listArtifacts, getArtifact, readArtifactPayload, type ArtifactKind, type Artifact } from '../services/artifactService.js';

const VALID_KINDS: ArtifactKind[] = ['vue-sfc', 'page-graph', 'design-tokens'];

export function buildArtifactsRouter(db: Database.Database, dataDir: string): Router {
  const r = Router({ mergeParams: true });

  r.get('/', (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const project = getProject(db, projectId);
    if (!project) {
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
    if (!project) {
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

  /**
   * GET /api/projects/:id/artifacts/:artifactId/versions
   * Returns the full supersede chain for this artifact, ordered oldest → newest.
   * Walks backwards from the current artifact through its superseded ancestors.
   */
  r.get('/:artifactId/versions', (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const project = getProject(db, projectId);
    if (!project) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } });
      return;
    }
    const current = getArtifact(db, req.params.artifactId as string);
    if (!current || current.projectId !== projectId) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '產物不存在' } });
      return;
    }

    // Walk backwards: find all artifacts of same kind+name that were superseded
    // by this one (or by an ancestor in the chain).
    const chain: Artifact[] = [current];
    let targetId = current.id;

    // Traverse ancestors: find which artifact was superseded_by → targetId
    const MAX_DEPTH = 100; // guard against cycles
    for (let depth = 0; depth < MAX_DEPTH; depth++) {
      const ancestor = db.prepare(
        'SELECT * FROM artifacts WHERE project_id = ? AND superseded_by = ?'
      ).get(projectId, targetId) as Record<string, unknown> | undefined;
      if (!ancestor) break;
      // toArtifact is not exported, so map manually
      const a: Artifact = {
        id: ancestor.id as string,
        projectId: ancestor.project_id as string,
        createdByTurn: ancestor.created_by_turn as string,
        kind: ancestor.kind as ArtifactKind,
        name: ancestor.name as string,
        payloadPath: ancestor.payload_path as string,
        metadata: ancestor.metadata ? JSON.parse(ancestor.metadata as string) : null,
        supersededBy: (ancestor.superseded_by as string | null) ?? null,
        createdAt: ancestor.created_at as string,
      };
      chain.unshift(a); // prepend so oldest is first
      targetId = a.id;
    }

    res.json({ versions: chain });
  });

  r.get('/:artifactId/payload', (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const project = getProject(db, projectId);
    if (!project) {
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
