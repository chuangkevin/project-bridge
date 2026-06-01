import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../index';

let dataDir: string;
let app: ReturnType<typeof createApp>;
let token: string;
let projectId: string;

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'sk-'));
  // seed a global skill on disk BEFORE app boots so registry sees it
  mkdirSync(join(dataDir, 'skills', 'global'), { recursive: true });
  writeFileSync(join(dataDir, 'skills', 'global', 'g.md'), `---
name: my-global
description: a global skill
---
body`);
  app = createApp({ dataDir });
  const r = await request(app).post('/api/auth/setup').send({ name: 'A', email: 'a@x.com', password: 'pw12345678' });
  token = r.body.token;
  const p = await request(app).post('/api/projects').set('Authorization', `Bearer ${token}`).send({ name: 'P' });
  projectId = p.body.id;
});
afterEach(() => { app.locals.db?.close(); rmSync(dataDir, { recursive: true, force: true }); });
const auth = () => ({ Authorization: `Bearer ${token}` });

describe('GET /api/skills', () => {
  it('lists all visible skills (built-in + global)', async () => {
    const r = await request(app).get('/api/skills').set(auth());
    expect(r.body.skills.map((s: { name: string }) => s.name)).toContain('my-global');
    expect(r.body.skills.map((s: { name: string }) => s.name)).toContain('consult-clarify-first');
  });

  it('with ?projectId= includes project skills', async () => {
    await request(app).post(`/api/projects/${projectId}/skills`).set(auth())
      .send({ name: 'p-only', description: 'd', body: 'b' });
    const r = await request(app).get(`/api/skills?projectId=${projectId}`).set(auth());
    expect(r.body.skills.map((s: { name: string }) => s.name)).toContain('p-only');
  });

  it('GET /api/skills/:name returns body', async () => {
    const r = await request(app).get('/api/skills/my-global').set(auth());
    expect(r.body.body).toContain('body');
  });

  it('GET /api/skills/:name 404 if missing', async () => {
    const r = await request(app).get('/api/skills/nope').set(auth());
    expect(r.status).toBe(404);
  });

  it('POST /api/projects/:id/skills creates project skill', async () => {
    const r = await request(app).post(`/api/projects/${projectId}/skills`).set(auth())
      .send({ name: 'p1', description: 'd', body: 'b' });
    expect(r.status).toBe(201);
  });

  it('POST validates name/description/body required', async () => {
    const r = await request(app).post(`/api/projects/${projectId}/skills`).set(auth())
      .send({ name: '', description: 'd', body: 'b' });
    expect(r.status).toBe(400);
  });

  it('PUT /api/projects/:id/skills/:name updates content', async () => {
    await request(app).post(`/api/projects/${projectId}/skills`).set(auth())
      .send({ name: 'p1', description: 'd', body: 'old' });
    const r = await request(app).put(`/api/projects/${projectId}/skills/p1`).set(auth())
      .send({ description: 'd2', body: 'new' });
    expect(r.status).toBe(200);
  });

  it('DELETE /api/projects/:id/skills/:name removes', async () => {
    await request(app).post(`/api/projects/${projectId}/skills`).set(auth())
      .send({ name: 'p1', description: 'd', body: 'b' });
    const r = await request(app).delete(`/api/projects/${projectId}/skills/p1`).set(auth());
    expect(r.status).toBe(200);
    const list = await request(app).get(`/api/skills?projectId=${projectId}`).set(auth());
    expect(list.body.skills.find((s: { name: string }) => s.name === 'p1')).toBeUndefined();
  });

  it('global skill POST/PUT/DELETE work', async () => {
    const c = await request(app).post('/api/skills/global').set(auth())
      .send({ name: 'newg', description: 'd', body: 'b' });
    expect(c.status).toBe(201);
    const u = await request(app).put('/api/skills/global/newg').set(auth())
      .send({ description: 'd2', body: 'b2' });
    expect(u.status).toBe(200);
    const d = await request(app).delete('/api/skills/global/newg').set(auth());
    expect(d.status).toBe(200);
  });

  it('401 without auth', async () => {
    const r = await request(app).get('/api/skills');
    expect(r.status).toBe(401);
  });
});
