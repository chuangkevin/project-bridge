import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extract } from 'tar-stream';
import { createGunzip } from 'node:zlib';
import { createApp } from '../../index';
import { createUser, login as loginService } from '../../services/authService';

let dataDir: string;
let app: ReturnType<typeof createApp>;
let token: string;
let projectId: string;

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'bkr-'));
  app = createApp({ dataDir });
  const r = await request(app).post('/api/auth/setup').send({ name: 'A', email: 'a@x.com', password: 'pw12345678' });
  token = r.body.token;
  const p = await request(app).post('/api/projects').set('Authorization', `Bearer ${token}`).send({ name: 'TestProject' });
  projectId = p.body.id;
});
afterEach(() => { app.locals.db?.close(); rmSync(dataDir, { recursive: true, force: true }); });

const auth = () => ({ Authorization: `Bearer ${token}` });

describe('GET /api/projects/:id/backup', () => {
  it('200 as owner — streams gzip with correct headers', async () => {
    const r = await request(app)
      .get(`/api/projects/${projectId}/backup`)
      .set(auth())
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
      .set(auth())
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

  it('401 without auth', async () => {
    const r = await request(app).get(`/api/projects/${projectId}/backup`);
    expect(r.status).toBe(401);
  });

  it('404 cross-user project', async () => {
    await createUser(app.locals.db, { name: 'B', email: 'b@x.com', password: 'pw12345678' });
    const login2 = await loginService(app.locals.db, 'b@x.com', 'pw12345678');
    const token2 = login2.ok ? login2.token : '';
    const r = await request(app)
      .get(`/api/projects/${projectId}/backup`)
      .set({ Authorization: `Bearer ${token2}` });
    expect(r.status).toBe(404);
  });

  it('404 unknown project', async () => {
    const r = await request(app)
      .get('/api/projects/does-not-exist/backup')
      .set(auth());
    expect(r.status).toBe(404);
  });
});
