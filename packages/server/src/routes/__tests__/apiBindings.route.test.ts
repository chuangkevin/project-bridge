import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../index';

let dataDir: string;
let app: ReturnType<typeof createApp>;
let projectId: string;

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'apib-'));
  app = createApp({ dataDir });
  const p = await request(app).post('/api/projects').send({ name: 'P' });
  projectId = p.body.id;
});
afterEach(() => { app.locals.db?.close(); rmSync(dataDir, { recursive: true, force: true }); });

describe('api-bindings routes (M1 anonymous)', () => {
  it('GET /api-bindings returns empty bindings list initially', async () => {
    const r = await request(app).get(`/api/projects/${projectId}/api-bindings`);
    expect(r.status).toBe(200);
    expect(r.body.bindings).toEqual([]);
  });

  it('POST /api-bindings creates a binding', async () => {
    const r = await request(app)
      .post(`/api/projects/${projectId}/api-bindings`)
      .send({ bridgeId: 'list-1', method: 'GET', url: 'https://api.example.com/items' });
    expect(r.status).toBe(201);
    expect(r.body.id).toBeDefined();
    expect(r.body.bridgeId).toBe('list-1');
    expect(r.body.method).toBe('GET');
    expect(r.body.url).toBe('https://api.example.com/items');
    expect(r.body.params).toEqual([]);
    expect(r.body.responseSchema).toEqual({});
  });

  it('POST /api-bindings returns 400 when bridgeId is missing', async () => {
    const r = await request(app)
      .post(`/api/projects/${projectId}/api-bindings`)
      .send({ method: 'GET', url: 'https://api.example.com' });
    expect(r.status).toBe(400);
  });

  it('POST /api-bindings returns 400 for invalid method', async () => {
    const r = await request(app)
      .post(`/api/projects/${projectId}/api-bindings`)
      .send({ bridgeId: 'x', method: 'INVALID', url: '' });
    expect(r.status).toBe(400);
  });

  it('GET /api-bindings filters by page_name', async () => {
    await request(app).post(`/api/projects/${projectId}/api-bindings`)
      .send({ bridgeId: 'page1-btn', url: '/a', pageName: 'page1' });
    await request(app).post(`/api/projects/${projectId}/api-bindings`)
      .send({ bridgeId: 'page2-btn', url: '/b', pageName: 'page2' });
    const r = await request(app).get(`/api/projects/${projectId}/api-bindings?page_name=page1`);
    expect(r.status).toBe(200);
    expect(r.body.bindings).toHaveLength(1);
    expect(r.body.bindings[0].pageName).toBe('page1');
  });

  it('GET /api-bindings/export returns structured JSON download', async () => {
    await request(app).post(`/api/projects/${projectId}/api-bindings`)
      .send({ bridgeId: 'home-btn', url: '/api/submit', method: 'POST', pageName: 'home' });
    const r = await request(app).get(`/api/projects/${projectId}/api-bindings/export`);
    expect(r.status).toBe(200);
    expect(r.body.projectId).toBe(projectId);
    expect(r.body.pages).toBeDefined();
    expect(r.body.summary.totalBindings).toBe(1);
    expect(r.body.exportedAt).toBeDefined();
  });

  it('PUT /api-bindings/:bindingId updates binding', async () => {
    const created = (await request(app)
      .post(`/api/projects/${projectId}/api-bindings`)
      .send({ bridgeId: 'u1', url: '/old', method: 'GET' })).body;
    const r = await request(app)
      .put(`/api/projects/${projectId}/api-bindings/${created.id}`)
      .send({ url: '/new', method: 'POST' });
    expect(r.status).toBe(200);
    expect(r.body.url).toBe('/new');
    expect(r.body.method).toBe('POST');
  });

  it('PUT /api-bindings/:bindingId returns 404 for unknown binding', async () => {
    const r = await request(app)
      .put(`/api/projects/${projectId}/api-bindings/no-such-id`)
      .send({ url: '/x' });
    expect(r.status).toBe(404);
  });

  it('DELETE /api-bindings/:bindingId removes the binding', async () => {
    const created = (await request(app)
      .post(`/api/projects/${projectId}/api-bindings`)
      .send({ bridgeId: 'd1', url: '/delete-me' })).body;
    const del = await request(app).delete(`/api/projects/${projectId}/api-bindings/${created.id}`);
    expect(del.status).toBe(200);
    expect(del.body.ok).toBe(true);
    const list = (await request(app).get(`/api/projects/${projectId}/api-bindings`)).body.bindings;
    expect(list).toHaveLength(0);
  });

  it('GET /api-bindings returns 404 for non-existent project', async () => {
    const r = await request(app).get('/api/projects/no-such-project/api-bindings');
    expect(r.status).toBe(404);
  });

  it('POST /api-bindings stores params and fieldMappings as parsed arrays', async () => {
    const r = await request(app)
      .post(`/api/projects/${projectId}/api-bindings`)
      .send({
        bridgeId: 'f1',
        url: '/api/search',
        params: [{ name: 'q', value: '' }],
        fieldMappings: [{ from: 'data.items', to: 'list' }],
      });
    expect(r.status).toBe(201);
    expect(r.body.params).toEqual([{ name: 'q', value: '' }]);
    expect(r.body.fieldMappings).toEqual([{ from: 'data.items', to: 'list' }]);
  });
});
