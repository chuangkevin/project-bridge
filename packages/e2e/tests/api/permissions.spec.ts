import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001';

test.describe('API: Permission Matrix (Task 13.3)', () => {
  let adminToken: string;
  let adminUserId: string;
  let userAToken: string;
  let userAId: string;
  let userBToken: string;
  let userBId: string;
  let projectByA: string; // project owned by user A
  let projectByB: string; // project owned by user B
  const ts = Date.now();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];

  test.beforeAll(async ({ request }) => {
    // 1. Check if users exist
    const statusRes = await request.get(`${API}/api/auth/status`);
    const { hasUsers } = await statusRes.json();

    if (!hasUsers) {
      // No users: setup admin
      const setupRes = await request.post(`${API}/api/auth/setup`, {
        data: { name: `perm-admin-${ts}` },
      });
      expect(setupRes.status()).toBe(200);
      const setupBody = await setupRes.json();
      adminToken = setupBody.token;
      adminUserId = setupBody.user.id;
    } else {
      // Users exist: find admin and login
      const usersRes = await request.get(`${API}/api/auth/users`);
      expect(usersRes.status()).toBe(200);
      const users = await usersRes.json();
      const admin = users.find((u: any) => u.role === 'admin');
      expect(admin).toBeTruthy();
      adminUserId = admin.id;

      const loginRes = await request.post(`${API}/api/auth/login`, {
        data: { userId: adminUserId },
      });
      expect(loginRes.status()).toBe(200);
      const loginBody = await loginRes.json();
      adminToken = loginBody.token;
    }

    const adminHeaders = { Authorization: `Bearer ${adminToken}` };

    // 2. Create two test users via POST /api/users (admin auth)
    const userARes = await request.post(`${API}/api/users`, {
      headers: adminHeaders,
      data: { name: `perm-user-a-${ts}` },
    });
    expect(userARes.status()).toBe(201);
    const userABody = await userARes.json();
    userAId = userABody.id;
    createdUserIds.push(userAId);

    const userBRes = await request.post(`${API}/api/users`, {
      headers: adminHeaders,
      data: { name: `perm-user-b-${ts}` },
    });
    expect(userBRes.status()).toBe(201);
    const userBBody = await userBRes.json();
    userBId = userBBody.id;
    createdUserIds.push(userBId);

    // 3. Login as each user to get tokens
    const loginARes = await request.post(`${API}/api/auth/login`, {
      data: { userId: userAId },
    });
    expect(loginARes.status()).toBe(200);
    userAToken = (await loginARes.json()).token;

    const loginBRes = await request.post(`${API}/api/auth/login`, {
      data: { userId: userBId },
    });
    expect(loginBRes.status()).toBe(200);
    userBToken = (await loginBRes.json()).token;

    // 4. Create projects owned by each user
    const projARes = await request.post(`${API}/api/projects`, {
      headers: { Authorization: `Bearer ${userAToken}` },
      data: { name: `perm-proj-a-${ts}` },
    });
    expect(projARes.status()).toBe(201);
    const projA = await projARes.json();
    projectByA = projA.id;
    createdProjectIds.push(projectByA);

    const projBRes = await request.post(`${API}/api/projects`, {
      headers: { Authorization: `Bearer ${userBToken}` },
      data: { name: `perm-proj-b-${ts}` },
    });
    expect(projBRes.status()).toBe(201);
    const projB = await projBRes.json();
    projectByB = projB.id;
    createdProjectIds.push(projectByB);
  });

  test.afterAll(async ({ request }) => {
    const adminHeaders = { Authorization: `Bearer ${adminToken}` };

    // Delete test projects
    for (const id of createdProjectIds) {
      try {
        await request.delete(`${API}/api/projects/${id}`, { headers: adminHeaders });
      } catch {
        // ignore cleanup errors
      }
    }

    // Delete test users (disable them via admin)
    for (const id of createdUserIds) {
      try {
        await request.patch(`${API}/api/users/${id}/disable`, { headers: adminHeaders });
      } catch {
        // ignore cleanup errors
      }
    }
  });

  // --- Owner can modify own project ---

  test('Owner can PUT own project', async ({ request }) => {
    const res = await request.put(`${API}/api/projects/${projectByA}`, {
      headers: { Authorization: `Bearer ${userAToken}` },
      data: { name: 'updated' },
    });
    expect(res.status()).toBe(200);
  });

  test('Owner can DELETE own project', async ({ request }) => {
    // Create a throwaway project to delete
    const createRes = await request.post(`${API}/api/projects`, {
      headers: { Authorization: `Bearer ${userAToken}` },
      data: { name: `perm-delete-own-${ts}` },
    });
    expect(createRes.status()).toBe(201);
    const proj = await createRes.json();

    const res = await request.delete(`${API}/api/projects/${proj.id}`, {
      headers: { Authorization: `Bearer ${userAToken}` },
    });
    expect([200, 204]).toContain(res.status());
  });

  // --- Non-owner cannot modify others' project ---

  test('Non-owner cannot PUT another users project — 403', async ({ request }) => {
    const res = await request.put(`${API}/api/projects/${projectByA}`, {
      headers: { Authorization: `Bearer ${userBToken}` },
      data: { name: 'updated' },
    });
    expect(res.status()).toBe(403);
  });

  test('Non-owner cannot DELETE another users project — 403', async ({ request }) => {
    const res = await request.delete(`${API}/api/projects/${projectByA}`, {
      headers: { Authorization: `Bearer ${userBToken}` },
    });
    expect(res.status()).toBe(403);
  });

  // --- Admin can modify any project ---

  test('Admin can PUT any project', async ({ request }) => {
    const res = await request.put(`${API}/api/projects/${projectByB}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { name: 'updated' },
    });
    expect(res.status()).toBe(200);
  });

  test('Admin can DELETE any project', async ({ request }) => {
    // Create a throwaway project owned by user B, then delete as admin
    const createRes = await request.post(`${API}/api/projects`, {
      headers: { Authorization: `Bearer ${userBToken}` },
      data: { name: `perm-admin-delete-${ts}` },
    });
    expect(createRes.status()).toBe(201);
    const proj = await createRes.json();

    const res = await request.delete(`${API}/api/projects/${proj.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect([200, 204]).toContain(res.status());
  });

  // --- Unauthenticated requests to protected routes return 401 ---

  test('Unauthenticated PUT returns 401', async ({ request }) => {
    const res = await request.put(`${API}/api/projects/${projectByA}`, {
      data: { name: 'updated' },
    });
    expect(res.status()).toBe(401);
  });

  test('Unauthenticated DELETE returns 401', async ({ request }) => {
    const res = await request.delete(`${API}/api/projects/${projectByA}`);
    expect(res.status()).toBe(401);
  });

  test('Unauthenticated POST to chat returns 401', async ({ request }) => {
    const res = await request.post(`${API}/api/projects/${projectByA}/chat`, {
      data: { message: 'hello' },
    });
    expect(res.status()).toBe(401);
  });

  // --- All authenticated users can view projects ---

  test('Owner can GET own project', async ({ request }) => {
    const res = await request.get(`${API}/api/projects/${projectByA}`, {
      headers: { Authorization: `Bearer ${userAToken}` },
    });
    expect(res.status()).toBe(200);
  });

  test('Non-owner can GET another users project', async ({ request }) => {
    const res = await request.get(`${API}/api/projects/${projectByA}`, {
      headers: { Authorization: `Bearer ${userBToken}` },
    });
    expect(res.status()).toBe(200);
  });

  test('Admin can GET any project', async ({ request }) => {
    const res = await request.get(`${API}/api/projects/${projectByB}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status()).toBe(200);
  });

  test('GET /api/projects list returns 200 for authenticated user', async ({ request }) => {
    const res = await request.get(`${API}/api/projects`, {
      headers: { Authorization: `Bearer ${userAToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('All authenticated users can POST /api/projects', async ({ request }) => {
    const res = await request.post(`${API}/api/projects`, {
      headers: { Authorization: `Bearer ${userBToken}` },
      data: { name: `perm-create-test-${ts}` },
    });
    expect(res.status()).toBe(201);
    const proj = await res.json();
    createdProjectIds.push(proj.id);
  });

  // --- Chat route permission ---

  test('Non-owner cannot POST chat on another users project — 403', async ({ request }) => {
    const res = await request.post(`${API}/api/projects/${projectByA}/chat`, {
      headers: { Authorization: `Bearer ${userBToken}` },
      data: { message: 'hello' },
    });
    expect(res.status()).toBe(403);
  });

  test('Owner POST chat on own project does not return 401 or 403', async ({ request }) => {
    const res = await request.post(`${API}/api/projects/${projectByA}/chat`, {
      headers: { Authorization: `Bearer ${userAToken}` },
      data: { message: 'hello' },
    });
    // May return 400 (no API key configured) or other, but NOT 401/403
    expect(res.status()).not.toBe(401);
    expect(res.status()).not.toBe(403);
  });

  test('Admin POST chat on any project does not return 401 or 403', async ({ request }) => {
    const res = await request.post(`${API}/api/projects/${projectByB}/chat`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { message: 'hello' },
    });
    // May return 400 (no API key configured) or other, but NOT 401/403
    expect(res.status()).not.toBe(401);
    expect(res.status()).not.toBe(403);
  });

  // --- Settings routes require admin ---

  test('Non-admin cannot GET /api/settings — 403', async ({ request }) => {
    const res = await request.get(`${API}/api/settings`, {
      headers: { Authorization: `Bearer ${userAToken}` },
    });
    expect(res.status()).toBe(403);
  });

  test('Admin can GET /api/settings — 200', async ({ request }) => {
    const res = await request.get(`${API}/api/settings`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status()).toBe(200);
  });

  test('Unauthenticated GET /api/settings — 401', async ({ request }) => {
    const res = await request.get(`${API}/api/settings`);
    expect(res.status()).toBe(401);
  });
});
