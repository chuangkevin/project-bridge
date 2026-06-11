import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../index';

let dataDir: string;
let app: ReturnType<typeof createApp>;
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
  const p = await request(app).post('/api/projects').send({ name: 'P' });
  projectId = p.body.id;
});
afterEach(() => { app.locals.db?.close(); rmSync(dataDir, { recursive: true, force: true }); });

describe('GET /api/skills (M1 anonymous)', () => {
  it('lists all visible skills (built-in + global)', async () => {
    const r = await request(app).get('/api/skills');
    expect(r.body.skills.map((s: { name: string }) => s.name)).toContain('my-global');
    expect(r.body.skills.map((s: { name: string }) => s.name)).toContain('consult-clarify-first');
  });

  it('with ?projectId= includes project skills', async () => {
    await request(app).post(`/api/projects/${projectId}/skills`)
      .send({ name: 'p-only', description: 'd', body: 'b' });
    const r = await request(app).get(`/api/skills?projectId=${projectId}`);
    expect(r.body.skills.map((s: { name: string }) => s.name)).toContain('p-only');
  });

  it('GET /api/skills/:name returns body', async () => {
    const r = await request(app).get('/api/skills/my-global');
    expect(r.body.body).toContain('body');
  });

  it('GET /api/skills/:name 404 if missing', async () => {
    const r = await request(app).get('/api/skills/nope');
    expect(r.status).toBe(404);
  });

  it('POST /api/projects/:id/skills creates project skill', async () => {
    const r = await request(app).post(`/api/projects/${projectId}/skills`)
      .send({ name: 'p1', description: 'd', body: 'b' });
    expect(r.status).toBe(201);
  });

  it('POST validates name/description/body required', async () => {
    const r = await request(app).post(`/api/projects/${projectId}/skills`)
      .send({ name: '', description: 'd', body: 'b' });
    expect(r.status).toBe(400);
  });

  it('PUT /api/projects/:id/skills/:name updates content', async () => {
    await request(app).post(`/api/projects/${projectId}/skills`)
      .send({ name: 'p1', description: 'd', body: 'old' });
    const r = await request(app).put(`/api/projects/${projectId}/skills/p1`)
      .send({ description: 'd2', body: 'new' });
    expect(r.status).toBe(200);
  });

  it('DELETE /api/projects/:id/skills/:name removes', async () => {
    await request(app).post(`/api/projects/${projectId}/skills`)
      .send({ name: 'p1', description: 'd', body: 'b' });
    const r = await request(app).delete(`/api/projects/${projectId}/skills/p1`);
    expect(r.status).toBe(200);
    const list = await request(app).get(`/api/skills?projectId=${projectId}`);
    expect(list.body.skills.find((s: { name: string }) => s.name === 'p1')).toBeUndefined();
  });

  it('global skill POST/PUT/DELETE work', async () => {
    const c = await request(app).post('/api/skills/global')
      .send({ name: 'newg', description: 'd', body: 'b' });
    expect(c.status).toBe(201);
    const u = await request(app).put('/api/skills/global/newg')
      .send({ description: 'd2', body: 'b2' });
    expect(u.status).toBe(200);
    const d = await request(app).delete('/api/skills/global/newg');
    expect(d.status).toBe(200);
  });
});

describe('GET /api/projects/:id/skills (rail list — was 404)', () => {
  it('lists skills visible to the project', async () => {
    const p = await request(app).post('/api/projects').send({ name: 'SkillRail' });
    const r = await request(app).get(`/api/projects/${p.body.id}/skills`);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.skills)).toBe(true);
    expect(r.body.skills.length).toBeGreaterThan(0);
    expect(r.body.skills[0]).toHaveProperty('name');
    expect(r.body.skills[0]).toHaveProperty('description');
  });

  it('404 for unknown project', async () => {
    const r = await request(app).get('/api/projects/no-such/skills');
    expect(r.status).toBe(404);
  });
});
