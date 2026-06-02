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
  dataDir = mkdtempSync(join(tmpdir(), 'ann-'));
  app = createApp({ dataDir });
  const p = await request(app).post('/api/projects').send({ name: 'P' });
  projectId = p.body.id;
});
afterEach(() => { app.locals.db?.close(); rmSync(dataDir, { recursive: true, force: true }); });

describe('annotations routes (M1 anonymous)', () => {
  it('GET /annotations returns empty list initially', async () => {
    const r = await request(app).get(`/api/projects/${projectId}/annotations`);
    expect(r.status).toBe(200);
    expect(r.body.annotations).toEqual([]);
  });

  it('POST /annotations creates an annotation', async () => {
    const r = await request(app)
      .post(`/api/projects/${projectId}/annotations`)
      .send({ bridgeId: 'btn-1', label: '按鈕說明', content: 'Primary CTA', positionX: 10, positionY: 20 });
    expect(r.status).toBe(201);
    expect(r.body.id).toBeDefined();
    expect(r.body.bridge_id).toBe('btn-1');
    expect(r.body.label).toBe('按鈕說明');
    expect(r.body.position_x).toBe(10);
    expect(r.body.position_y).toBe(20);
  });

  it('POST /annotations returns 400 when bridgeId is missing', async () => {
    const r = await request(app)
      .post(`/api/projects/${projectId}/annotations`)
      .send({ label: 'no bridge' });
    expect(r.status).toBe(400);
  });

  it('GET /annotations lists created annotations', async () => {
    await request(app).post(`/api/projects/${projectId}/annotations`).send({ bridgeId: 'a1', label: 'first' });
    await request(app).post(`/api/projects/${projectId}/annotations`).send({ bridgeId: 'a2', label: 'second' });
    const r = await request(app).get(`/api/projects/${projectId}/annotations`);
    expect(r.status).toBe(200);
    expect(r.body.annotations).toHaveLength(2);
  });

  it('PUT /annotations/:aid updates annotation', async () => {
    const created = (await request(app)
      .post(`/api/projects/${projectId}/annotations`)
      .send({ bridgeId: 'b1', label: 'original' })).body;
    const r = await request(app)
      .put(`/api/projects/${projectId}/annotations/${created.id}`)
      .send({ label: 'updated', content: 'new content' });
    expect(r.status).toBe(200);
    expect(r.body.label).toBe('updated');
    expect(r.body.content).toBe('new content');
  });

  it('PUT /annotations/:aid returns 404 for unknown annotation', async () => {
    const r = await request(app)
      .put(`/api/projects/${projectId}/annotations/no-such-id`)
      .send({ label: 'x' });
    expect(r.status).toBe(404);
  });

  it('DELETE /annotations/:aid removes the annotation', async () => {
    const created = (await request(app)
      .post(`/api/projects/${projectId}/annotations`)
      .send({ bridgeId: 'c1' })).body;
    const del = await request(app).delete(`/api/projects/${projectId}/annotations/${created.id}`);
    expect(del.status).toBe(204);
    const list = (await request(app).get(`/api/projects/${projectId}/annotations`)).body.annotations;
    expect(list).toHaveLength(0);
  });

  it('GET /annotations returns 404 for non-existent project', async () => {
    const r = await request(app).get('/api/projects/does-not-exist/annotations');
    expect(r.status).toBe(404);
  });

  it('POST /annotations returns 404 for non-existent project', async () => {
    const r = await request(app)
      .post('/api/projects/does-not-exist/annotations')
      .send({ bridgeId: 'x' });
    expect(r.status).toBe(404);
  });

  it('POST /annotations stores specData as JSON', async () => {
    const r = await request(app)
      .post(`/api/projects/${projectId}/annotations`)
      .send({ bridgeId: 'd1', specData: { required: true, type: 'button' } });
    expect(r.status).toBe(201);
    expect(JSON.parse(r.body.spec_data)).toEqual({ required: true, type: 'button' });
  });
});
