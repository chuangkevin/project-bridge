import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../index';
import { appendTurn } from '../../services/turnService';
import { createArtifact } from '../../services/artifactService';
import { createUser, login as loginService } from '../../services/authService';

let dataDir: string;
let app: ReturnType<typeof createApp>;
let token: string;
let projectId: string;
let turnId: string;

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'ar-'));
  app = createApp({ dataDir });
  const r = await request(app).post('/api/auth/setup').send({ name: 'A', email: 'a@x.com', password: 'pw12345678' });
  token = r.body.token;
  const p = await request(app).post('/api/projects').set('Authorization', `Bearer ${token}`).send({ name: 'P' });
  projectId = p.body.id;
  turnId = appendTurn(app.locals.db, { projectId, mode: 'consult', userText: 'x', aiResponse: { text: '' } }).id;
});
afterEach(() => { app.locals.db?.close(); rmSync(dataDir, { recursive: true, force: true }); });

const auth = () => ({ Authorization: `Bearer ${token}` });

function makeArtifact(name = 'ia', payload = '{"nodes":[],"edges":[]}') {
  return createArtifact(app.locals.db, {
    projectId, createdByTurn: turnId,
    kind: 'page-graph', name,
    payload, payloadExt: 'json',
    artifactsRoot: join(dataDir, 'projects', projectId, 'artifacts'),
  });
}

describe('artifacts routes', () => {
  it('GET / empty → artifacts: []', async () => {
    const r = await request(app).get(`/api/projects/${projectId}/artifacts`).set(auth());
    expect(r.status).toBe(200);
    expect(r.body.artifacts).toEqual([]);
  });

  it('GET / with kind filter returns only matching artifacts', async () => {
    makeArtifact('ia');
    createArtifact(app.locals.db, {
      projectId, createdByTurn: turnId,
      kind: 'design-tokens', name: 'tokens',
      payload: '{}', payloadExt: 'json',
      artifactsRoot: join(dataDir, 'projects', projectId, 'artifacts'),
    });
    const r = await request(app).get(`/api/projects/${projectId}/artifacts?kind=page-graph`).set(auth());
    expect(r.status).toBe(200);
    expect(r.body.artifacts).toHaveLength(1);
    expect(r.body.artifacts[0].kind).toBe('page-graph');
  });

  it('GET /:artifactId returns artifact', async () => {
    const a = makeArtifact();
    const r = await request(app).get(`/api/projects/${projectId}/artifacts/${a.id}`).set(auth());
    expect(r.status).toBe(200);
    expect(r.body.id).toBe(a.id);
    expect(r.body.kind).toBe('page-graph');
  });

  it('GET /:artifactId/payload returns JSON content with correct content-type', async () => {
    const content = '{"nodes":[{"id":"home","label":"首頁"}],"edges":[]}';
    const a = makeArtifact('ia', content);
    const r = await request(app).get(`/api/projects/${projectId}/artifacts/${a.id}/payload`).set(auth());
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('application/json');
    // The payload is valid JSON — supertest auto-parses it since content-type is json
    expect(JSON.stringify(r.body)).toBe(content);
  });

  it('401 without auth', async () => {
    const r = await request(app).get(`/api/projects/${projectId}/artifacts`);
    expect(r.status).toBe(401);
  });

  it('404 for cross-user project access', async () => {
    // Create a second user directly via service (setup only allows 1 user)
    await createUser(app.locals.db, { name: 'B', email: 'b@x.com', password: 'pw12345678' });
    const login2 = await loginService(app.locals.db, 'b@x.com', 'pw12345678');
    const token2 = login2.ok ? login2.token : '';
    const r = await request(app).get(`/api/projects/${projectId}/artifacts`).set({ Authorization: `Bearer ${token2}` });
    expect(r.status).toBe(404);
  });

  it('404 for non-existent artifact', async () => {
    const r = await request(app).get(`/api/projects/${projectId}/artifacts/does-not-exist`).set(auth());
    expect(r.status).toBe(404);
  });
});
