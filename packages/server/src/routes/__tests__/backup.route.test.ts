import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extract } from 'tar-stream';
import { createGunzip } from 'node:zlib';
import { createApp } from '../../index';

let dataDir: string;
let app: ReturnType<typeof createApp>;
let projectId: string;

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'bkr-'));
  app = createApp({ dataDir });
  const p = await request(app).post('/api/projects').send({ name: 'TestProject' });
  projectId = p.body.id;
});
afterEach(() => { app.locals.db?.close(); rmSync(dataDir, { recursive: true, force: true }); });

describe('GET /api/projects/:id/backup (M1 anonymous)', () => {
  it('200 — streams gzip with correct headers', async () => {
    const r = await request(app)
      .get(`/api/projects/${projectId}/backup`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('application/gzip');
    expect(r.headers['content-disposition']).toMatch(/attachment/);
    expect(r.headers['content-disposition']).toMatch(/designbridge-TestProject/);
    expect(r.headers['content-disposition']).toMatch(/\.tar\.gz/);
  });

  it('response is a valid tar.gz containing manifest.json', async () => {
    const r = await request(app)
      .get(`/api/projects/${projectId}/backup`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(r.status).toBe(200);

    const buf = r.body as Buffer;
    const names: string[] = [];
    await new Promise<void>((resolve, reject) => {
      const { Readable } = require('node:stream');
      const readable = Readable.from([buf]);
      const ex = extract();
      ex.on('entry', (header: { name: string }, body: NodeJS.ReadableStream, next: () => void) => {
        names.push(header.name);
        body.resume();
        body.on('end', next);
      });
      ex.on('finish', resolve);
      ex.on('error', reject);
      readable.pipe(createGunzip()).pipe(ex);
    });

    expect(names).toContain('manifest.json');
  });

  it('404 unknown project', async () => {
    const r = await request(app).get('/api/projects/does-not-exist/backup');
    expect(r.status).toBe(404);
  });
});
