import { Router, type Request, type Response } from 'express';
import express from 'express';
import { renderMirror } from '@designbridge/codegen';
import { readMirrorFile, loadMirrorMeta } from '../storage/mirrorStore';
import { ingestionCache } from '../services/ingestionCache';
import { parseWebpage } from '../ingestion/parseWebpage';
import { compileFromIngestion } from '../services/compile';
import { extractTheme } from '../services/themeExtractor';

export interface MirrorsRouterOpts { baseDir?: string; }

function contentType(filename: string): string {
  if (filename.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filename.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filename.endsWith('.png')) return 'image/png';
  if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) return 'image/jpeg';
  if (filename.endsWith('.svg')) return 'image/svg+xml';
  if (filename.endsWith('.gif')) return 'image/gif';
  if (filename.endsWith('.webp')) return 'image/webp';
  if (filename.endsWith('.woff')) return 'font/woff';
  if (filename.endsWith('.woff2')) return 'font/woff2';
  return 'application/octet-stream';
}

export function createMirrorsRouter(opts: MirrorsRouterOpts = {}): Router {
  const router = Router();

  router.get('/:id/mirrors/:artifactId/page.html', (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const artifactId = req.params.artifactId as string;
    if (!loadMirrorMeta(projectId, artifactId, { baseDir: opts.baseDir })) {
      res.status(404).end();
      return;
    }
    try {
      const buf = readMirrorFile(projectId, artifactId, 'page.html', { baseDir: opts.baseDir });
      const html = renderMirror({
        html: buf.toString('utf8'),
        baseHref: `/api/projects/${projectId}/mirrors/${artifactId}/`,
      });
      res.type('text/html; charset=utf-8').send(html);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.get('/:id/mirrors/:artifactId/styles.css', (req, res) => {
    try {
      res.type(contentType('styles.css'))
        .send(readMirrorFile(req.params.id as string, req.params.artifactId as string, 'styles.css', { baseDir: opts.baseDir }));
    } catch {
      res.status(404).end();
    }
  });

  router.get('/:id/mirrors/:artifactId/screenshot.png', (req, res) => {
    try {
      res.type('image/png')
        .send(readMirrorFile(req.params.id as string, req.params.artifactId as string, 'screenshot.png', { baseDir: opts.baseDir }));
    } catch {
      res.status(404).end();
    }
  });

  router.get('/:id/mirrors/:artifactId/assets/:filename', (req, res) => {
    const filename = req.params.filename as string;
    try {
      res.type(contentType(filename))
        .send(readMirrorFile(req.params.id as string, req.params.artifactId as string, `assets/${filename}`, { baseDir: opts.baseDir }));
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.post('/:id/mirrors/:artifactId/upgrade-to-ast', express.json(), async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const mirrorId = req.params.artifactId as string;
    const newArtifactId = typeof req.body?.artifactId === 'string' && req.body.artifactId.trim()
      ? req.body.artifactId.trim() : `${mirrorId}_ast`;

    const meta = loadMirrorMeta(projectId, mirrorId, { baseDir: opts.baseDir });
    if (!meta) { res.status(404).json({ error: 'mirror not found' }); return; }

    let cached = ingestionCache.get(projectId, meta.sourceUrl);
    if (!cached) {
      const parsed = await parseWebpage(meta.sourceUrl);
      if (!parsed.ok) { res.json({ ok: false, reason: parsed.reason, detail: parsed.detail }); return; }
      ingestionCache.set(projectId, meta.sourceUrl, parsed.ingestion, { assets: parsed.assets });
      cached = { ingestion: parsed.ingestion, assets: parsed.assets };
    }
    try {
      const result = await compileFromIngestion(cached.ingestion, { artifactId: newArtifactId, projectId });
      const themeProposal = extractTheme({ dom: cached.ingestion.dom, css: '', sourceUrl: meta.sourceUrl });
      res.json({ ok: true, ...result, themeProposal });
    } catch (err) {
      res.json({ ok: false, reason: 'ast_repair_exhausted', detail: (err as Error).message });
    }
  });

  return router;
}

/** Default-mount router (uses default data dir). */
export default createMirrorsRouter();
