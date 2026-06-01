import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../index';
import { appendTurn } from '../../services/turnService';

let dataDir: string;
let app: ReturnType<typeof createApp>;
let token: string;
let projectId: string;

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'tr-'));
  app = createApp({ dataDir });
  const r = await request(app).post('/api/auth/setup').send({ name: 'A', email: 'a@x.com', password: 'pw12345678' });
  token = r.body.token;
  const p = await request(app).post('/api/projects').set('Authorization', `Bearer ${token}`).send({ name: 'P' });
  projectId = p.body.id;
});
afterEach(() => { app.locals.db?.close(); rmSync(dataDir, { recursive: true, force: true }); });

const auth = () => ({ Authorization: `Bearer ${token}` });

describe('turns routes', () => {
  it('GET /api/projects/:id/turns empty initially', async () => {
    const r = await request(app).get(`/api/projects/${projectId}/turns`).set(auth());
    expect(r.body.turns).toEqual([]);
  });

  it('GET /api/projects/:id/turns lists turns chronologically', async () => {
    const db = app.locals.db;
    appendTurn(db, { projectId, mode: 'consult', userText: 'one', aiResponse: { text: '' } });
    appendTurn(db, { projectId, mode: 'consult', userText: 'two', aiResponse: { text: '' } });
    const r = await request(app).get(`/api/projects/${projectId}/turns`).set(auth());
    expect(r.body.turns).toHaveLength(2);
    expect(r.body.turns[0].userText).toBe('one');
  });

  it('GET supports ?mode= filter', async () => {
    const db = app.locals.db;
    appendTurn(db, { projectId, mode: 'consult', userText: 'c', aiResponse: { text: '' } });
    appendTurn(db, { projectId, mode: 'design', userText: 'd', aiResponse: { text: '' } });
    const r = await request(app).get(`/api/projects/${projectId}/turns?mode=design`).set(auth());
    expect(r.body.turns).toHaveLength(1);
    expect(r.body.turns[0].userText).toBe('d');
  });

  it('GET /api/projects/:id/turns/:turnId returns single turn', async () => {
    const db = app.locals.db;
    const t = appendTurn(db, { projectId, mode: 'consult', userText: 'x', aiResponse: { text: 'y' } });
    const r = await request(app).get(`/api/projects/${projectId}/turns/${t.id}`).set(auth());
    expect(r.status).toBe(200);
    expect(r.body.userText).toBe('x');
  });

  it('GET single turn 404 if turn not in project', async () => {
    const r = await request(app).get(`/api/projects/${projectId}/turns/nope`).set(auth());
    expect(r.status).toBe(404);
  });

  it('GET turns 401 without auth', async () => {
    const r = await request(app).get(`/api/projects/${projectId}/turns`);
    expect(r.status).toBe(401);
  });

  it('GET turns 404 if project not owned by user', async () => {
    // Plan 1 setup only allows ONE user, so we cannot easily create a 2nd owner;
    // instead, test with a non-existent project id
    const r = await request(app).get(`/api/projects/does-not-exist/turns`).set(auth());
    expect(r.status).toBe(404);
  });
});
