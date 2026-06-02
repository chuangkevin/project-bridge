import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import type Database from 'better-sqlite3';
import { getProject } from '../services/projectService.js';
import { ingestFile, ingestUrl, listAttachments } from '../services/ingestionService.js';
import { analyzeAndSaveVisualSpec } from '../services/uploadAnalysis.js';
import { join } from 'node:path';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

export function buildIngestRouter(db: Database.Database, dataDir: string): Router {
  const r = Router({ mergeParams: true });

  /** POST /api/projects/:id/ingest — upload files and/or a URL */
  r.post('/', upload.array('files', 5), async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const project = getProject(db, projectId);
    if (!project) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } });
      return;
    }

    const uploadsRoot = join(dataDir, 'projects', projectId, 'uploads');
    const out = [];

    // Process uploaded files
    // multer types may not be available on req directly — cast to avoid TS error
    const files = (req as unknown as { files?: Express.Multer.File[] }).files ?? [];
    for (const f of files) {
      const attachment = await ingestFile(db, {
        projectId,
        uploadsRoot,
        originalName: f.originalname,
        mimeType: f.mimetype,
        buffer: f.buffer,
      });
      out.push(attachment);

      // Fire-and-forget vision analysis for images (handles multimodal limitation gracefully)
      if (attachment.kind === 'image') {
        void analyzeAndSaveVisualSpec(db, attachment, dataDir);
      }
    }

    // Process URL if provided
    const url = typeof req.body?.url === 'string' ? req.body.url.trim() : null;
    if (url) {
      out.push(await ingestUrl(db, { projectId, uploadsRoot, url }));
    }

    if (out.length === 0) {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: '需要 files 或 url' } });
      return;
    }

    res.status(201).json({ attachments: out });
  });

  /** GET /api/projects/:id/ingest — list attachments for project */
  r.get('/', (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const project = getProject(db, projectId);
    if (!project) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } });
      return;
    }
    res.json({ attachments: listAttachments(db, projectId) });
  });

  return r;
}
