import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../index';
import { appendTurn } from '../../services/turnService';
import { addFact } from '../../services/factService';

let dataDir: string;
let app: ReturnType<typeof createApp>;
let projectId: string;
let turnId: string;

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'fr-'));
  app = createApp({ dataDir });
  const p = await request(app).post('/api/projects').send({ name: 'P' });
  projectId = p.body.id;
  turnId = appendTurn(app.locals.db, { projectId, mode: 'consult', userText: 'x', aiResponse: { text: '' } }).id;
});
afterEach(() => { app.locals.db?.close(); rmSync(dataDir, { recursive: true, force: true }); });

describe('facts routes (M1 anonymous)', () => {
  it('GET facts empty initially', async () => {
    const r = await request(app).get(`/api/projects/${projectId}/facts`);
    expect(r.body.facts).toEqual([]);
  });

  it('POST creates a fact (use existing turnId)', async () => {
    const r = await request(app).post(`/api/projects/${projectId}/facts`)
      .send({ turnId, kind: 'requirement', text: 'r1' });
    expect(r.status).toBe(201);
    expect(r.body.id).toBeDefined();
    expect(r.body.kind).toBe('requirement');
  });

  it('POST validates kind enum', async () => {
    const r = await request(app).post(`/api/projects/${projectId}/facts`)
      .send({ turnId, kind: 'invalid', text: 'r1' });
    expect(r.status).toBe(400);
  });

  it('POST validates non-empty text', async () => {
    const r = await request(app).post(`/api/projects/${projectId}/facts`)
      .send({ turnId, kind: 'requirement', text: '' });
    expect(r.status).toBe(400);
  });

  it('GET with ?kind filter', async () => {
    const db = app.locals.db;
    addFact(db, { projectId, turnId, kind: 'requirement', text: 'r' });
    addFact(db, { projectId, turnId, kind: 'page', text: 'p' });
    const r = await request(app).get(`/api/projects/${projectId}/facts?kind=page`);
    expect(r.body.facts).toHaveLength(1);
    expect(r.body.facts[0].kind).toBe('page');
  });

  it('PATCH replaces text with supersede (new fact + old marked superseded_by new)', async () => {
    const db = app.locals.db;
    const old = addFact(db, { projectId, turnId, kind: 'requirement', text: 'old' });
    const r = await request(app).patch(`/api/projects/${projectId}/facts/${old.id}`)
      .send({ text: 'new' });
    expect(r.status).toBe(200);
    expect(r.body.text).toBe('new');
    expect(r.body.id).not.toBe(old.id);
    const list = (await request(app).get(`/api/projects/${projectId}/facts`)).body.facts;
    expect(list).toHaveLength(1);
    expect(list[0].text).toBe('new');
  });

  it('DELETE marks superseded (soft delete) — listFacts no longer returns it', async () => {
    const db = app.locals.db;
    const f = addFact(db, { projectId, turnId, kind: 'requirement', text: 'x' });
    const r = await request(app).delete(`/api/projects/${projectId}/facts/${f.id}`);
    expect(r.status).toBe(200);
    const list = (await request(app).get(`/api/projects/${projectId}/facts`)).body.facts;
    expect(list).toEqual([]);
  });

  it('GET 404 for non-existent project', async () => {
    const r = await request(app).get(`/api/projects/does-not-exist/facts`);
    expect(r.status).toBe(404);
  });
});
