import { describe, it, expect, beforeEach, vi } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeMirrorFiles, saveMirrorMeta } from '../../storage/mirrorStore';
import { createMirrorsRouter } from '../mirrors';

function buildApp(baseDir: string): Express {
  const app = express();
  app.use('/api/projects', createMirrorsRouter({ baseDir }));
  return app;
}

describe('mirrors route', () => {
  let baseDir: string;
  let app: Express;

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), 'mirrors-route-'));
    app = buildApp(baseDir);
  });

  it('serves page.html with injected <base href>', async () => {
    writeMirrorFiles('p1', 'ar_1', {
      html: '<html><body><p>hi</p></body></html>', css: '', screenshot: Buffer.from(''), assets: [],
    }, { baseDir });
    saveMirrorMeta('p1', {
      kind: 'mirror', id: 'ar_1', sourceUrl: 'https://e.com', sourceType: 'url', crawledAt: '',
      files: { html: 'page.html', css: 'styles.css', screenshot: 'screenshot.png' },
      warnings: [], editable: false,
    }, { baseDir });
    const r = await request(app).get('/api/projects/p1/mirrors/ar_1/page.html');
    expect(r.status).toBe(200);
    expect(r.text).toContain('<base href="/api/projects/p1/mirrors/ar_1/"');
    expect(r.text).toContain('<p>hi</p>');
  });

  it('serves styles.css raw', async () => {
    writeMirrorFiles('p1', 'ar_1', {
      html: '', css: 'body{color:red}', screenshot: Buffer.from(''), assets: [],
    }, { baseDir });
    const r = await request(app).get('/api/projects/p1/mirrors/ar_1/styles.css');
    expect(r.status).toBe(200);
    expect(r.text).toBe('body{color:red}');
  });

  it('serves an asset by filename', async () => {
    writeMirrorFiles('p1', 'ar_1', {
      html: '', css: '', screenshot: Buffer.from(''),
      assets: [{ filename: 'abc.png', bytes: Buffer.from([1, 2, 3]) }],
    }, { baseDir });
    const r = await request(app).get('/api/projects/p1/mirrors/ar_1/assets/abc.png');
    expect(r.status).toBe(200);
    expect(Buffer.compare(r.body, Buffer.from([1, 2, 3]))).toBe(0);
  });

  it('serves screenshot.png', async () => {
    writeMirrorFiles('p1', 'ar_1', {
      html: '', css: '', screenshot: Buffer.from([10, 20, 30]), assets: [],
    }, { baseDir });
    const r = await request(app).get('/api/projects/p1/mirrors/ar_1/screenshot.png');
    expect(r.status).toBe(200);
    expect(Buffer.compare(r.body, Buffer.from([10, 20, 30]))).toBe(0);
  });

  it('404 on missing mirror meta', async () => {
    const r = await request(app).get('/api/projects/p1/mirrors/missing/page.html');
    expect(r.status).toBe(404);
  });

  it('400 on traversal attempt for asset path', async () => {
    writeMirrorFiles('p1', 'ar_1', {
      html: '', css: '', screenshot: Buffer.from(''), assets: [],
    }, { baseDir });
    saveMirrorMeta('p1', {
      kind: 'mirror', id: 'ar_1', sourceUrl: '', sourceType: 'url', crawledAt: '',
      files: { html: 'page.html', css: 'styles.css', screenshot: 'screenshot.png' },
      warnings: [], editable: false,
    }, { baseDir });
    const r = await request(app).get('/api/projects/p1/mirrors/ar_1/assets/' + encodeURIComponent('../page.html'));
    expect([400, 404]).toContain(r.status);
  });

  it('POST upgrade-to-ast reuses cached ingestion and produces an AST', async () => {
    saveMirrorMeta('p1', {
      kind: 'mirror', id: 'ar_m', sourceUrl: 'https://e.com', sourceType: 'url', crawledAt: 'x',
      files: { html: 'page.html', css: 'styles.css', screenshot: 'screenshot.png' },
      warnings: [], editable: false,
    }, { baseDir });

    const cache = await import('../../services/ingestionCache');
    cache.ingestionCache.clear();
    cache.ingestionCache.set('p1', 'https://e.com', { type: 'webpage', url: 'https://e.com', dom: '<html><body><h1>x</h1></body></html>' }, { assets: [] });

    const compileMod = await import('../../services/compile');
    const fakeResult = {
      ast: { schemaVersion: 1, artifactId: 'ar_m_ast', kind: 'page', root: { id: 'n_root', type: 'Container', props: {}, layout: { kind: 'flow' }, style: {}, bindings: [], events: [], constraints: [], children: [] } },
      violations: [],
      vue: { filename: 'X.vue', code: '<template></template>' },
    };
    const spy = vi.spyOn(compileMod, 'compileFromIngestion').mockResolvedValue(fakeResult as never);

    const r = await request(app).post('/api/projects/p1/mirrors/ar_m/upgrade-to-ast').send({});
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.ast).toBeDefined();
    expect(r.body.themeProposal).toBeDefined();
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'webpage', url: 'https://e.com' }),
      expect.objectContaining({ projectId: 'p1', artifactId: 'ar_m_ast' }),
    );
    // Mirror still on disk
    expect(require('node:fs').existsSync(require('node:path').join(baseDir, 'projects', 'p1', 'artifacts', 'ar_m.mirror.json'))).toBe(true);
  });

  it('POST upgrade-to-ast 404s when mirror does not exist', async () => {
    const r = await request(app).post('/api/projects/p1/mirrors/missing/upgrade-to-ast').send({});
    expect(r.status).toBe(404);
  });
});
