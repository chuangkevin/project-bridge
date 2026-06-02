import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../index';
import { appendTurn } from '../../services/turnService';

let dataDir: string;
let app: ReturnType<typeof createApp>;
let projectId: string;

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'tr-'));
  app = createApp({ dataDir });
  const p = await request(app).post('/api/projects').send({ name: 'P' });
  projectId = p.body.id;
});
afterEach(() => { app.locals.db?.close(); rmSync(dataDir, { recursive: true, force: true }); });

describe('turns routes (M1 anonymous)', () => {
  it('GET /api/projects/:id/turns empty initially', async () => {
    const r = await request(app).get(`/api/projects/${projectId}/turns`);
    expect(r.body.turns).toEqual([]);
  });

  it('GET /api/projects/:id/turns lists turns chronologically', async () => {
    const db = app.locals.db;
    appendTurn(db, { projectId, mode: 'consult', userText: 'one', aiResponse: { text: '' } });
    appendTurn(db, { projectId, mode: 'consult', userText: 'two', aiResponse: { text: '' } });
    const r = await request(app).get(`/api/projects/${projectId}/turns`);
    expect(r.body.turns).toHaveLength(2);
    expect(r.body.turns[0].userText).toBe('one');
  });

  it('GET supports ?mode= filter', async () => {
    const db = app.locals.db;
    appendTurn(db, { projectId, mode: 'consult', userText: 'c', aiResponse: { text: '' } });
    appendTurn(db, { projectId, mode: 'design', userText: 'd', aiResponse: { text: '' } });
    const r = await request(app).get(`/api/projects/${projectId}/turns?mode=design`);
    expect(r.body.turns).toHaveLength(1);
    expect(r.body.turns[0].userText).toBe('d');
  });

  it('GET /api/projects/:id/turns/:turnId returns single turn', async () => {
    const db = app.locals.db;
    const t = appendTurn(db, { projectId, mode: 'consult', userText: 'x', aiResponse: { text: 'y' } });
    const r = await request(app).get(`/api/projects/${projectId}/turns/${t.id}`);
    expect(r.status).toBe(200);
    expect(r.body.userText).toBe('x');
  });

  it('GET single turn 404 if turn not in project', async () => {
    const r = await request(app).get(`/api/projects/${projectId}/turns/nope`);
    expect(r.status).toBe(404);
  });

  it('GET turns 404 if project does not exist', async () => {
    const r = await request(app).get(`/api/projects/does-not-exist/turns`);
    expect(r.status).toBe(404);
  });
});
