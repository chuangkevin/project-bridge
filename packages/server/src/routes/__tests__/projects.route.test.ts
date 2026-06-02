import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../index';

let dataDir: string;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'proj-'));
  app = createApp({ dataDir });
});
afterEach(() => { app.locals.db?.close(); rmSync(dataDir, { recursive: true, force: true }); });

describe('projects CRUD (M1 anonymous)', () => {
  it('POST /api/projects creates and returns it', async () => {
    const r = await request(app).post('/api/projects').send({ name: '房仲網站' });
    expect(r.status).toBe(201);
    expect(r.body.id).toBeDefined();
    expect(r.body.name).toBe('房仲網站');
    expect(r.body.shareToken).toBeDefined();
    expect(r.body.ownerId).toBeNull(); // anonymous-created projects have no owner
  });
  it('GET /api/projects lists every project (no owner filter)', async () => {
    await request(app).post('/api/projects').send({ name: 'P1' });
    await request(app).post('/api/projects').send({ name: 'P2' });
    const r = await request(app).get('/api/projects');
    expect(r.body.projects).toHaveLength(2);
  });
  it('GET /api/projects/:id returns the project', async () => {
    const c = await request(app).post('/api/projects').send({ name: 'P' });
    const r = await request(app).get(`/api/projects/${c.body.id}`);
    expect(r.status).toBe(200);
    expect(r.body.name).toBe('P');
  });
  it('PATCH /api/projects/:id updates name', async () => {
    const c = await request(app).post('/api/projects').send({ name: 'A' });
    const r = await request(app).patch(`/api/projects/${c.body.id}`).send({ name: 'B' });
    expect(r.status).toBe(200);
    expect(r.body.name).toBe('B');
  });
  it('DELETE /api/projects/:id removes it', async () => {
    const c = await request(app).post('/api/projects').send({ name: 'P' });
    const r = await request(app).delete(`/api/projects/${c.body.id}`);
    expect(r.status).toBe(200);
    const g = await request(app).get(`/api/projects/${c.body.id}`);
    expect(g.status).toBe(404);
  });
  it('POST /api/projects/:id/share/rotate issues a new token', async () => {
    const c = await request(app).post('/api/projects').send({ name: 'P' });
    const old = c.body.shareToken;
    const r = await request(app).post(`/api/projects/${c.body.id}/share/rotate`);
    expect(r.body.shareToken).not.toBe(old);
  });
  it('anonymous list works (no auth, no 401)', async () => {
    const r = await request(app).get('/api/projects');
    expect(r.status).toBe(200);
  });
  it('PATCH /api/projects/:id rejects empty name with 400', async () => {
    const c = await request(app).post('/api/projects').send({ name: 'A' });
    const r = await request(app).patch(`/api/projects/${c.body.id}`).send({ name: '   ' });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_FAILED');
  });
  it('PATCH /api/projects/:id rejects null name with 400', async () => {
    const c = await request(app).post('/api/projects').send({ name: 'A' });
    const r = await request(app).patch(`/api/projects/${c.body.id}`).send({ name: null });
    expect(r.status).toBe(400);
  });
  it('PATCH /api/projects/:id with no name is no-op (returns project unchanged)', async () => {
    const c = await request(app).post('/api/projects').send({ name: 'A' });
    const r = await request(app).patch(`/api/projects/${c.body.id}`).send({});
    expect(r.status).toBe(200);
    expect(r.body.name).toBe('A');
  });
});
