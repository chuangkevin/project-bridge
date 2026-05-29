import { describe, it, expect, beforeEach } from 'vitest';
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
});
