import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../index';
import { appendTurn } from '../../services/turnService';
import { createArtifact } from '../../services/artifactService';

let dataDir: string;
let app: ReturnType<typeof createApp>;
let projectId: string;

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'comp-'));
  app = createApp({ dataDir });
  const p = await request(app).post('/api/projects').send({ name: 'P' });
  projectId = p.body.id;
});
afterEach(() => { app.locals.db?.close(); rmSync(dataDir, { recursive: true, force: true }); });

describe('components routes (M1 anonymous)', () => {
  it('GET /components returns empty list initially', async () => {
    const r = await request(app).get('/api/components');
    expect(r.status).toBe(200);
    expect(r.body.components).toEqual([]);
  });

  it('POST /components creates a component', async () => {
    const r = await request(app).post('/api/components').send({
      name: 'PrimaryButton',
      category: 'form',
      html: '<button class="btn">Click</button>',
      css: '.btn { color: red; }',
      tags: ['button', 'cta'],
    });
    expect(r.status).toBe(201);
    expect(r.body.id).toBeDefined();
    expect(r.body.name).toBe('PrimaryButton');
    expect(r.body.category).toBe('form');
    expect(r.body.tags).toEqual(['button', 'cta']);
    expect(r.body.version).toBe(1);
  });

  it('POST /components returns 400 when name is missing', async () => {
    const r = await request(app).post('/api/components').send({
      html: '<div></div>',
    });
    expect(r.status).toBe(400);
  });

  it('POST /components returns 400 when html is missing', async () => {
    const r = await request(app).post('/api/components').send({
      name: 'NoHtml',
    });
    expect(r.status).toBe(400);
  });

  it('GET /components filters by project_id', async () => {
    await request(app).post('/api/components').send({ name: 'A', html: '<a/>', projectId });
    await request(app).post('/api/components').send({ name: 'B', html: '<b/>' }); // no project
    const r = await request(app).get(`/api/components?project_id=${projectId}`);
    expect(r.status).toBe(200);
    expect(r.body.components).toHaveLength(1);
    expect(r.body.components[0].name).toBe('A');
  });

  it('GET /components filters by category', async () => {
    await request(app).post('/api/components').send({ name: 'Nav', html: '<nav/>', category: 'navigation' });
    await request(app).post('/api/components').send({ name: 'Frm', html: '<form/>', category: 'form' });
    const r = await request(app).get('/api/components?category=navigation');
    expect(r.status).toBe(200);
    expect(r.body.components).toHaveLength(1);
    expect(r.body.components[0].category).toBe('navigation');
  });

  it('GET /components/:id returns the component', async () => {
    const created = (await request(app).post('/api/components').send({ name: 'C', html: '<c/>' })).body;
    const r = await request(app).get(`/api/components/${created.id}`);
    expect(r.status).toBe(200);
    expect(r.body.id).toBe(created.id);
  });

  it('GET /components/:id returns 404 for unknown component', async () => {
    const r = await request(app).get('/api/components/no-such-id');
    expect(r.status).toBe(404);
  });

  it('PUT /components/:id updates component and bumps version', async () => {
    const created = (await request(app).post('/api/components').send({ name: 'V', html: '<v1/>' })).body;
    expect(created.version).toBe(1);
    const r = await request(app)
      .put(`/api/components/${created.id}`)
      .send({ name: 'V', html: '<v2/>', css: '.new {}' });
    expect(r.status).toBe(200);
    expect(r.body.html).toBe('<v2/>');
    expect(r.body.version).toBe(2);
  });

  it('DELETE /components/:id removes the component', async () => {
    const created = (await request(app).post('/api/components').send({ name: 'D', html: '<d/>' })).body;
    const del = await request(app).delete(`/api/components/${created.id}`);
    expect(del.status).toBe(204);
    const r = await request(app).get(`/api/components/${created.id}`);
    expect(r.status).toBe(404);
  });

  it('POST /projects/:id/components/save-from-artifact saves artifact as component', async () => {
    const db = app.locals.db;
    const turnId = appendTurn(db, { projectId, mode: 'design', userText: 'x', aiResponse: { text: '' } }).id;
    const artifact = createArtifact(db, {
      projectId,
      createdByTurn: turnId,
      kind: 'vue-sfc',
      name: 'HomePage',
      payload: '<template><div>Hello</div></template>',
      payloadExt: 'vue',
      artifactsRoot: join(dataDir, 'projects', projectId, 'artifacts'),
    });

    const r = await request(app)
      .post(`/api/projects/${projectId}/components/save-from-artifact`)
      .send({ artifactId: artifact.id, name: 'HomeComponent', category: 'layout' });
    expect(r.status).toBe(201);
    expect(r.body.id).toBeDefined();
    expect(r.body.name).toBe('HomeComponent');
    expect(r.body.category).toBe('layout');
    expect(r.body.html).toContain('Hello');
    expect(r.body.projectId).toBe(projectId);
  });

  it('POST /projects/:id/components/save-from-artifact returns 404 for missing artifact', async () => {
    const r = await request(app)
      .post(`/api/projects/${projectId}/components/save-from-artifact`)
      .send({ artifactId: 'no-such-artifact' });
    expect(r.status).toBe(404);
  });

  it('POST /projects/:id/components/save-from-artifact returns 404 for missing project', async () => {
    const r = await request(app)
      .post('/api/projects/no-such-project/components/save-from-artifact')
      .send({ artifactId: 'some-id' });
    expect(r.status).toBe(404);
  });

  it('POST /projects/:id/components/save-from-artifact returns 400 without artifactId', async () => {
    const r = await request(app)
      .post(`/api/projects/${projectId}/components/save-from-artifact`)
      .send({ name: 'SomeName' });
    expect(r.status).toBe(400);
  });
});
