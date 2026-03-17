import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001';

test.describe('API: Phase 4-8 endpoints', () => {
  let projectId: string;

  test.beforeEach(async ({ request }) => {
    const res = await request.post(`${API}/api/projects`, {
      data: { name: `Phase4 Test ${Date.now()}` },
    });
    const project = await res.json();
    projectId = project.id;
  });

  test.afterEach(async ({ request }) => {
    if (projectId) await request.delete(`${API}/api/projects/${projectId}`);
  });

  // PATCH /api/projects/:id — rename
  test('PATCH /api/projects/:id renames the project', async ({ request }) => {
    const res = await request.patch(`${API}/api/projects/${projectId}`, {
      data: { name: 'Renamed Project' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('Renamed Project');
  });

  test('PATCH /api/projects/:id with missing name returns 400', async ({ request }) => {
    const res = await request.patch(`${API}/api/projects/${projectId}`, {
      data: {},
    });
    expect(res.status()).toBe(400);
  });

  // GET /upload/spec-status
  test('GET /upload/spec-status returns hasVisualAnalysis false for new project', async ({ request }) => {
    const res = await request.get(`${API}/api/projects/${projectId}/upload/spec-status`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('hasVisualAnalysis');
    expect(body.hasVisualAnalysis).toBe(false);
  });

  // GET /prototype/tokens — no prototype returns 404
  test('GET /prototype/tokens with no prototype returns 404', async ({ request }) => {
    const res = await request.get(`${API}/api/projects/${projectId}/prototype/tokens`);
    expect(res.status()).toBe(404);
  });

  // GET /prototype/versions/:version/html — no prototype returns 404
  test('GET /prototype/versions/1/html with no prototype returns 404', async ({ request }) => {
    const res = await request.get(`${API}/api/projects/${projectId}/prototype/versions/1/html`);
    expect(res.status()).toBe(404);
  });

  // GET /prototype/versions/:vA/diff/:vB — no prototype returns 404
  test('GET /prototype/versions/1/diff/2 with no prototype returns 404', async ({ request }) => {
    const res = await request.get(`${API}/api/projects/${projectId}/prototype/versions/1/diff/2`);
    expect(res.status()).toBe(404);
  });

  // Non-existent project
  test('PATCH on non-existent project returns 404', async ({ request }) => {
    const res = await request.patch(`${API}/api/projects/nonexistent/`, {
      data: { name: 'Test' },
    });
    expect(res.status()).toBe(404);
  });
});
