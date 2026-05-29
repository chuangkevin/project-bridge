import { Router, type Request, type Response } from 'express';
import { renderMirror } from '@designbridge/codegen';
import { readMirrorFile, loadMirrorMeta } from '../storage/mirrorStore';

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

  return router;
}

/** Default-mount router (uses default data dir). */
export default createMirrorsRouter();
