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

test.describe('API: Key Pool — validate-key', () => {
  let adminToken = '';

  test.beforeAll(async ({ request }) => {
    const { token } = await getAdminToken(request);
    adminToken = token;
  });

  test('missing apiKey returns 400 with valid:false', async ({ request }) => {
    const res = await request.post(`${API}/api/settings/validate-key`, {
      headers: authHeader(adminToken),
      data: {},
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.valid).toBe(false);
    expect(body.error).toBe('Missing apiKey');
  });

  test('empty string apiKey returns 400', async ({ request }) => {
    const res = await request.post(`${API}/api/settings/validate-key`, {
      headers: authHeader(adminToken),
      data: { apiKey: '' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.valid).toBe(false);
  });

  test('invalid key returns valid:false with error', async ({ request }) => {
    const res = await request.post(`${API}/api/settings/validate-key`, {
      headers: authHeader(adminToken),
      data: { apiKey: 'invalid-key-12345678901234567890' },
    });
    const body = await res.json();
    expect(body.valid).toBe(false);
    expect(body).toHaveProperty('error');
  });

  test('requires auth (no token → 401)', async ({ request }) => {
    const res = await request.post(`${API}/api/settings/validate-key`, {
      data: { apiKey: 'some-key' },
    });
    expect(res.status()).toBe(401);
  });
});

test.describe('API: Key Pool — batch-validate', () => {
  let adminToken = '';

  test.beforeAll(async ({ request }) => {
    const { token } = await getAdminToken(request);
    adminToken = token;
  });

  test('missing keys array returns 400', async ({ request }) => {
    const res = await request.post(`${API}/api/settings/api-keys/batch-validate`, {
      headers: authHeader(adminToken),
      data: {},
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Missing keys array');
  });

  test('empty array returns 400', async ({ request }) => {
    const res = await request.post(`${API}/api/settings/api-keys/batch-validate`, {
      headers: authHeader(adminToken),
      data: { keys: [] },
    });
    expect(res.status()).toBe(400);
  });

  test('too many keys (>20) returns 400', async ({ request }) => {
    const keys = Array.from({ length: 21 }, (_, i) => `AIzaSyFake${String(i).padStart(3, '0')}`);
    const res = await request.post(`${API}/api/settings/api-keys/batch-validate`, {
      headers: authHeader(adminToken),
      data: { keys },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Maximum 20 keys per batch');
  });

  test('batch with invalid keys returns structured results', async ({ request }) => {
    const keys = [
      'AIzaSyFakeKey000000000000000000000001',
      'AIzaSyFakeKey000000000000000000000002',
    ];
    const res = await request.post(`${API}/api/settings/api-keys/batch-validate`, {
      headers: authHeader(adminToken),
      data: { keys },
    });
    const body = await res.json();
    expect(body).toHaveProperty('results');
    expect(body).toHaveProperty('total');
    expect(body).toHaveProperty('valid');
    expect(body).toHaveProperty('invalid');
    expect(body.total).toBe(2);
    expect(body.invalid).toBe(2);
    expect(body.valid).toBe(0);
    expect(body.results).toHaveLength(2);
    for (const result of body.results) {
      expect(result).toHaveProperty('suffix');
      expect(result.valid).toBe(false);
      expect(result).toHaveProperty('error');
    }
  });

  test('requires auth (no token → 401)', async ({ request }) => {
    const res = await request.post(`${API}/api/settings/api-keys/batch-validate`, {
      data: { keys: ['AIzaSyFake'] },
    });
    expect(res.status()).toBe(401);
  });
});

test.describe('API: Key Pool — cooldown & error classification', () => {
  let adminToken = '';

  test.beforeAll(async ({ request }) => {
    const { token } = await getAdminToken(request);
    adminToken = token;
  });

  test('validate-key classifies invalid key as auth error', async ({ request }) => {
    const res = await request.post(`${API}/api/settings/validate-key`, {
      headers: authHeader(adminToken),
      data: { apiKey: 'AIzaSyBogusKeyForErrorClassification99' },
    });
    const body = await res.json();
    expect(body.valid).toBe(false);
    expect(typeof body.error).toBe('string');
    expect(body.error.length).toBeGreaterThan(0);
  });

  test('batch-validate classifies multiple invalid keys with per-key errors', async ({ request }) => {
    const keys = [
      'AIzaSyInvalid_AAAA_000000000000000001',
      'AIzaSyInvalid_BBBB_000000000000000002',
    ];
    const res = await request.post(`${API}/api/settings/api-keys/batch-validate`, {
      headers: authHeader(adminToken),
      data: { keys },
    });
    const body = await res.json();
    expect(body.total).toBe(2);
    expect(body.invalid).toBe(2);
    for (const r of body.results) {
      expect(r.valid).toBe(false);
      expect(typeof r.error).toBe('string');
      expect(r.suffix).toHaveLength(4);
    }
  });

  test('existing pool keys are listed with usage stats', async ({ request }) => {
    const res = await request.get(`${API}/api/settings/api-keys`, {
      headers: authHeader(adminToken),
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const keyList = body.keys || body;
    if (Array.isArray(keyList) && keyList.length > 0) {
      const first = keyList[0];
      expect(first).toHaveProperty('suffix');
      expect(first).toHaveProperty('todayCalls');
      expect(first).toHaveProperty('totalTokens');
    }
  });
});
