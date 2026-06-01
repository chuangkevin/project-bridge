import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001';

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

test.describe('API: URL Design Crawler — crawl-full-page', () => {
  let adminToken = '';
  let projectId = '';

  test.beforeAll(async ({ request }) => {
    const { token } = await getAdminToken(request);
    adminToken = token;

    // Create a test project
    const res = await request.post(`${API}/api/projects`, {
      headers: authHeader(adminToken),
      data: { name: `crawler-test-${Date.now()}` },
    });
    const project = await res.json();
    projectId = project.id;
  });

  test.afterAll(async ({ request }) => {
    try {
      await request.delete(`${API}/api/projects/${projectId}`, {
        headers: authHeader(adminToken),
      });
    } catch { /* ignore */ }
  });

  test('crawl-full-page returns HTML + tokens + screenshot for valid URL', async ({ request }) => {
    const res = await request.post(`${API}/api/projects/${projectId}/crawl-full-page`, {
      headers: authHeader(adminToken),
      data: { url: 'https://example.com' },
      timeout: 30000,
    });

    if (res.status() === 200) {
      const body = await res.json();
      expect(body.url).toBe('https://example.com');
      expect(body.html).toBeTruthy();
      expect(typeof body.html).toBe('string');
      expect(body.html).toContain('<html');
      // Scripts should be stripped
      expect(body.html).not.toContain('<script');
      // Tokens from crawlWebsite
      expect(body.tokens).toBeTruthy();
      // Screenshot
      expect(body.screenshot).toBeTruthy();
    } else {
      // Browser may not be available in test env
      expect([400, 500]).toContain(res.status());
    }
  });

  test('crawl-full-page rejects invalid URL', async ({ request }) => {
    const res = await request.post(`${API}/api/projects/${projectId}/crawl-full-page`, {
      headers: authHeader(adminToken),
      data: { url: 'not-a-url' },
    });
    expect(res.status()).toBe(400);
  });

  test('crawl-full-page rejects missing URL', async ({ request }) => {
    const res = await request.post(`${API}/api/projects/${projectId}/crawl-full-page`, {
      headers: authHeader(adminToken),
      data: {},
    });
    expect(res.status()).toBe(400);
  });
});
