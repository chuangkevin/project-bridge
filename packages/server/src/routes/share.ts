import { Router, type Request, type Response } from 'express';
import type Database from 'better-sqlite3';
import { getProject, rotateShareToken } from '../services/projectService.js';
import { listArtifacts } from '../services/artifactService.js';

export function buildShareRouter(db: Database.Database): Router {
  const r = Router();

  /**
   * GET /api/share/:shareToken
   * Public — no auth required.
   * Returns project info + all vue-sfc artifacts for the project associated with this token.
   */
  r.get('/:shareToken', (req: Request, res: Response) => {
    const { shareToken } = req.params;
    const row = db.prepare('SELECT * FROM projects WHERE share_token = ?').get(shareToken) as
      | { id: string; name: string; share_token: string; owner_id: string | null; created_at: string; updated_at: string }
      | undefined;

    if (!row) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '分享連結不存在或已過期' } });
      return;
    }

    const artifacts = listArtifacts(db, row.id, { kind: 'vue-sfc', includeSuperseded: false });

    res.json({
      project: { id: row.id, name: row.name },
      artifacts: artifacts.map(a => ({
        id: a.id,
        name: a.name,
        kind: a.kind,
        payloadPath: a.payloadPath,
        createdAt: a.createdAt,
      })),
    });
  });

  return r;
}

/**
 * POST /api/projects/:id/share-token
 * Generates or refreshes the share_token for the given project.
 * Returns { shareToken, shareUrl }.
 */
export function buildShareTokenRouter(db: Database.Database): Router {
  const r = Router({ mergeParams: true });

  r.post('/', (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const project = getProject(db, projectId);
    if (!project) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } });
      return;
    }

    const rotated = rotateShareToken(db, projectId);
    if (!rotated) {
      res.status(500).json({ error: { code: 'INTERNAL', message: '無法產生分享 token' } });
      return;
    }

    // Build absolute share URL — use PUBLIC_BASE_URL env if set, otherwise derive from request
    const base =
      process.env.PUBLIC_BASE_URL ??
      `${req.protocol}://${req.get('host')}`;

    res.json({
      shareToken: rotated.shareToken,
      shareUrl: `${base}/share/${rotated.shareToken}`,
    });
  });

  return r;
}
