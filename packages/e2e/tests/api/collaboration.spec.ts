import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001';

/**
 * Helper: get or create an admin token.
 * If the DB already has users, login as an existing admin.
 * Otherwise, run the initial setup flow.
 */
async function getAdminToken(request: any): Promise<{ token: string; userId: string }> {
  const statusRes = await request.get(`${API}/api/auth/status`);
  const status = await statusRes.json();

  if (!status.hasUsers) {
    const setupRes = await request.post(`${API}/api/auth/setup`, {
      data: { name: `admin-${Date.now()}` },
    });
    expect(setupRes.status()).toBe(200);
    const setupBody = await setupRes.json();
    return { token: setupBody.token, userId: setupBody.user.id };
  }

  const usersRes = await request.get(`${API}/api/auth/users`);
  const users = await usersRes.json();
  const admin = users.find((u: any) => u.role === 'admin' && u.is_active);
  expect(admin).toBeTruthy();

  const loginRes = await request.post(`${API}/api/auth/login`, {
    data: { userId: admin.id },
  });
  expect(loginRes.status()).toBe(200);
  const loginBody = await loginRes.json();
  return { token: loginBody.token, userId: loginBody.user.id };
}

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

test.describe('API: Collaboration & Export', () => {
  let adminToken = '';
  let projectId = '';

  test.beforeAll(async ({ request }) => {
    const { token } = await getAdminToken(request);
    adminToken = token;

    // Create a test project
    const res = await request.post(`${API}/api/projects`, {
      headers: authHeader(adminToken),
      data: { name: `Collab Test ${Date.now()}` },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    projectId = body.id;
  });

  test.afterAll(async ({ request }) => {
    if (projectId) {
      try {
        await request.delete(`${API}/api/projects/${projectId}`, {
          headers: authHeader(adminToken),
        });
      } catch { /* ignore cleanup errors */ }
    }
  });

  // ── Figma Export Endpoint Tests ──────────────────────────────────────

  test('POST /api/projects/:id/export/figma with no prototype returns 404', async ({ request }) => {
    const res = await request.post(`${API}/api/projects/${projectId}/export/figma`, {
      headers: authHeader(adminToken),
      data: { viewport: 'desktop' },
    });
    expect(res.status()).toBe(404);

    const body = await res.json();
    expect(body.error).toContain('No prototype found');
  });

  test('POST /api/projects/:id/export/figma with non-existent project returns 404', async ({ request }) => {
    const fakeId = 'non-existent-project-id-00000';
    const res = await request.post(`${API}/api/projects/${fakeId}/export/figma`, {
      headers: authHeader(adminToken),
      data: { viewport: 'desktop' },
    });
    // The route checks for prototype first, so it returns 404 for missing prototype
    expect(res.status()).toBe(404);
  });

  test('POST /api/projects/:id/export/figma-components with empty componentIds returns 400', async ({ request }) => {
    const res = await request.post(`${API}/api/projects/${projectId}/export/figma-components`, {
      headers: authHeader(adminToken),
      data: { componentIds: [], viewport: 'desktop' },
    });
    expect(res.status()).toBe(400);

    const body = await res.json();
    expect(body.error).toContain('componentIds');
  });

  test('POST /api/projects/:id/export/figma-components with too many components returns 400', async ({ request }) => {
    // Create an array of 51 fake IDs to exceed the 50 limit
    const tooMany = Array.from({ length: 51 }, (_, i) => `fake-comp-${i}`);
    const res = await request.post(`${API}/api/projects/${projectId}/export/figma-components`, {
      headers: authHeader(adminToken),
      data: { componentIds: tooMany, viewport: 'desktop' },
    });
    expect(res.status()).toBe(400);

    const body = await res.json();
    expect(body.error).toContain('Maximum 50');
  });

  test('POST /api/projects/:id/export/figma-components with missing body returns 400', async ({ request }) => {
    const res = await request.post(`${API}/api/projects/${projectId}/export/figma-components`, {
      headers: authHeader(adminToken),
      data: {},
    });
    expect(res.status()).toBe(400);
  });

  // ── Socket.IO Connectivity ───────────────────────────────────────────

  test('GET /socket.io/?transport=polling returns valid handshake', async ({ request }) => {
    const res = await request.get(`${API}/socket.io/?transport=polling&EIO=4`);
    expect(res.status()).toBe(200);

    const text = await res.text();
    // Socket.IO v4 handshake response starts with "0{" (open packet)
    // The raw response may have a length prefix like "0{"sid":"...",...}"
    expect(text).toContain('"sid"');
  });

  test('Socket.IO polling endpoint rejects invalid transport', async ({ request }) => {
    const res = await request.get(`${API}/socket.io/?transport=invalid`);
    // Socket.IO returns 400 for unknown transports
    expect([400, 403]).toContain(res.status());
  });
});
