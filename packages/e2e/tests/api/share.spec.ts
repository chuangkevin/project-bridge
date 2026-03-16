import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001';

test.describe('API: Share Endpoint', () => {
  let projectId: string;
  let shareToken: string;

  test.beforeEach(async ({ request }) => {
    const res = await request.post(`${API}/api/projects`, {
      data: { name: `Share Test ${Date.now()}` },
    });
    const project = await res.json();
    projectId = project.id;
    shareToken = project.share_token;
  });

  test.afterEach(async ({ request }) => {
    if (projectId) {
      await request.delete(`${API}/api/projects/${projectId}`);
    }
  });

  test('GET /api/share/:shareToken — returns name and html', async ({ request }) => {
    const res = await request.get(`${API}/api/share/${shareToken}`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.name).toBeTruthy();
    expect(body.name).toContain('Share Test');
    expect(body).toHaveProperty('html');
    // html is null when no prototype has been generated yet
    expect(body.html).toBeNull();
  });

  test('GET /api/share/invalid-token — returns 404', async ({ request }) => {
    const res = await request.get(`${API}/api/share/invalid-token-xyz`);
    expect(res.status()).toBe(404);

    const body = await res.json();
    expect(body.error).toBeTruthy();
  });
});
