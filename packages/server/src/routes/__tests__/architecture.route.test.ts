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
  dataDir = mkdtempSync(join(tmpdir(), 'arch-'));
  app = createApp({ dataDir });
  const p = await request(app).post('/api/projects').send({ name: 'ArchTest' });
  projectId = p.body.id as string;
});

afterEach(() => {
  app.locals.db?.close();
  rmSync(dataDir, { recursive: true, force: true });
});

const sampleGraph = {
  nodes: [
    { id: 'p1', label: '首頁' },
    { id: 'p2', label: '產品頁' },
  ],
  edges: [
    { source: 'p1', target: 'p2', label: '進入' },
  ],
};

describe('architecture routes (M1)', () => {
  // ── GET ──────────────────────────────────────────────────────────────────
  it('GET returns null arch_data when project has none', async () => {
    const r = await request(app).get(`/api/projects/${projectId}/architecture`);
    expect(r.status).toBe(200);
    expect(r.body.arch_data).toBeNull();
  });

  it('GET returns 404 for unknown project', async () => {
    const r = await request(app).get('/api/projects/no-such-project/architecture');
    expect(r.status).toBe(404);
  });

  // ── PATCH ────────────────────────────────────────────────────────────────
  it('PATCH saves arch_data successfully', async () => {
    const r = await request(app)
      .patch(`/api/projects/${projectId}/architecture`)
      .send({ arch_data: sampleGraph });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
  });

  it('PATCH returns 400 when arch_data is missing', async () => {
    const r = await request(app)
      .patch(`/api/projects/${projectId}/architecture`)
      .send({});
    expect(r.status).toBe(400);
  });

  it('PATCH returns 404 for unknown project', async () => {
    const r = await request(app)
      .patch('/api/projects/no-such-project/architecture')
      .send({ arch_data: sampleGraph });
    expect(r.status).toBe(404);
  });

  it('GET returns saved arch_data after PATCH', async () => {
    await request(app)
      .patch(`/api/projects/${projectId}/architecture`)
      .send({ arch_data: sampleGraph });

    const r = await request(app).get(`/api/projects/${projectId}/architecture`);
    expect(r.status).toBe(200);
    expect(r.body.arch_data).toMatchObject(sampleGraph);
  });

  // ── versions ─────────────────────────────────────────────────────────────
  it('GET /versions returns empty list initially', async () => {
    const r = await request(app).get(`/api/projects/${projectId}/architecture/versions`);
    expect(r.status).toBe(200);
    expect(r.body.versions).toEqual([]);
  });

  it('POST /versions returns 400 when no arch_data exists', async () => {
    const r = await request(app)
      .post(`/api/projects/${projectId}/architecture/versions`)
      .send({ description: '測試版本' });
    expect(r.status).toBe(400);
  });

  it('POST /versions creates a version after arch_data is saved', async () => {
    await request(app)
      .patch(`/api/projects/${projectId}/architecture`)
      .send({ arch_data: sampleGraph });

    const r = await request(app)
      .post(`/api/projects/${projectId}/architecture/versions`)
      .send({ description: '版本一' });
    expect(r.status).toBe(201);
    expect(r.body.version).toBe(1);
    expect(r.body.id).toBeDefined();
  });

  it('POST /versions increments version number', async () => {
    await request(app)
      .patch(`/api/projects/${projectId}/architecture`)
      .send({ arch_data: sampleGraph });
    await request(app).post(`/api/projects/${projectId}/architecture/versions`).send({});
    const r2 = await request(app).post(`/api/projects/${projectId}/architecture/versions`).send({});
    expect(r2.body.version).toBe(2);
  });

  it('GET /versions lists created version', async () => {
    await request(app)
      .patch(`/api/projects/${projectId}/architecture`)
      .send({ arch_data: sampleGraph });
    await request(app)
      .post(`/api/projects/${projectId}/architecture/versions`)
      .send({ description: '版本一' });

    const r = await request(app).get(`/api/projects/${projectId}/architecture/versions`);
    expect(r.status).toBe(200);
    expect(r.body.versions).toHaveLength(1);
    expect(r.body.versions[0].description).toBe('版本一');
  });

  // ── restore ───────────────────────────────────────────────────────────────
  it('POST /versions/:id/restore restores arch_data and creates safety snapshot', async () => {
    const v1Graph = { nodes: [{ id: 'n1', label: 'A' }], edges: [] };
    const v2Graph = { nodes: [{ id: 'n2', label: 'B' }], edges: [] };

    // Save v1 and snapshot it
    await request(app).patch(`/api/projects/${projectId}/architecture`).send({ arch_data: v1Graph });
    const snap1 = await request(app).post(`/api/projects/${projectId}/architecture/versions`).send({ description: 'v1' });
    const versionId = snap1.body.id as string;

    // Now overwrite with v2
    await request(app).patch(`/api/projects/${projectId}/architecture`).send({ arch_data: v2Graph });

    // Restore v1
    const r = await request(app)
      .post(`/api/projects/${projectId}/architecture/versions/${versionId}/restore`)
      .send({});
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.arch_data).toMatchObject(v1Graph);

    // Safety snapshot should have been created (now 3 versions: v1, v2 safety, auto-backup)
    const list = await request(app).get(`/api/projects/${projectId}/architecture/versions`);
    expect(list.body.versions.length).toBeGreaterThanOrEqual(2);
  });

  it('POST /versions/:id/restore returns 404 for unknown version', async () => {
    const r = await request(app)
      .post(`/api/projects/${projectId}/architecture/versions/no-such-version/restore`)
      .send({});
    expect(r.status).toBe(404);
  });

  // ── analyze-html ─────────────────────────────────────────────────────────
  it('POST /analyze-html extracts navigation edges', async () => {
    const pages = ['home', 'about'];
    const html = `<!-- PAGE: home -->
<button onclick="showPage('about')">About</button>
<!-- PAGE: about -->
<p>About page</p>`;

    const r = await request(app)
      .post(`/api/projects/${projectId}/architecture/analyze-html`)
      .send({ html, pages });
    expect(r.status).toBe(200);
    expect(r.body.edges).toHaveLength(1);
    expect(r.body.edges[0].source).toBe('page-imported-0');
    expect(r.body.edges[0].target).toBe('page-imported-1');
  });

  it('POST /analyze-html returns 400 when html or pages missing', async () => {
    const r = await request(app)
      .post(`/api/projects/${projectId}/architecture/analyze-html`)
      .send({ html: '<div/>' });
    expect(r.status).toBe(400);
  });
});
