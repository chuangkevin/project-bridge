import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001';

test.describe('API: Fork (13.4) and Annotation Permissions (13.5)', () => {
  let adminToken: string;
  let adminId: string;
  let testUserToken: string;
  let testUserId: string;
  let adminProjectId: string;

  // Track resources for cleanup
  const createdProjectIds: string[] = [];
  const createdUserIds: string[] = [];

  test.beforeAll(async ({ request }) => {
    const ts = Date.now();

    // 1. Check if users exist
    const statusRes = await request.get(`${API}/api/auth/status`);
    const { hasUsers } = await statusRes.json();

    if (!hasUsers) {
      // No users: create admin via setup
      const setupRes = await request.post(`${API}/api/auth/setup`, {
        data: { name: `fork-admin-${ts}` },
      });
      expect(setupRes.status()).toBe(200);
      const setupBody = await setupRes.json();
      adminToken = setupBody.token;
      adminId = setupBody.user.id;
    } else {
      // Users exist: find admin and login
      const usersRes = await request.get(`${API}/api/auth/users`);
      const users = await usersRes.json();
      const admin = users.find((u: any) => u.role === 'admin');
      expect(admin).toBeTruthy();

      const loginRes = await request.post(`${API}/api/auth/login`, {
        data: { userId: admin.id },
      });
      expect(loginRes.status()).toBe(200);
      const loginBody = await loginRes.json();
      adminToken = loginBody.token;
      adminId = loginBody.user.id;
    }

    // 2. Create test user via POST /api/users (requires admin auth)
    const createUserRes = await request.post(`${API}/api/users`, {
      headers: { Authorization: 'Bearer ' + adminToken },
      data: { name: `fork-user-${ts}` },
    });
    expect(createUserRes.status()).toBe(201);
    const testUser = await createUserRes.json();
    testUserId = testUser.id;
    createdUserIds.push(testUserId);

    // 3. Login as test user to get token
    const testLoginRes = await request.post(`${API}/api/auth/login`, {
      data: { userId: testUserId },
    });
    expect(testLoginRes.status()).toBe(200);
    const testLoginBody = await testLoginRes.json();
    testUserToken = testLoginBody.token;

    // 4. Create a project owned by admin
    const projRes = await request.post(`${API}/api/projects`, {
      headers: { Authorization: 'Bearer ' + adminToken },
      data: { name: `Fork Source Project ${ts}` },
    });
    expect(projRes.status()).toBe(201);
    const project = await projRes.json();
    adminProjectId = project.id;
    createdProjectIds.push(adminProjectId);
  });

  test.afterAll(async ({ request }) => {
    const headers = { Authorization: 'Bearer ' + adminToken };

    // Clean up created projects
    for (const id of createdProjectIds) {
      try {
        await request.delete(`${API}/api/projects/${id}`, { headers });
      } catch {
        // ignore cleanup errors
      }
    }

    // Clean up created users
    for (const id of createdUserIds) {
      try {
        await request.delete(`${API}/api/users/${id}`, { headers });
      } catch {
        // ignore cleanup errors
      }
    }
  });

  // ── Fork tests (13.4) ──────────────────────────────────────────────

  test.describe('Fork (13.4)', () => {
    test('User can fork another user\'s project — returns 201 with fork name and correct owner', async ({ request }) => {
      const res = await request.post(`${API}/api/projects/${adminProjectId}/fork`, {
        headers: { Authorization: 'Bearer ' + testUserToken },
      });
      expect(res.status()).toBe(201);

      const body = await res.json();
      expect(body.id).toBeTruthy();
      expect(body.name).toBeTruthy();
      expect(body.name).toContain('(fork)');
      createdProjectIds.push(body.id);

      // Verify forked project owner_id is the test user
      const getRes = await request.get(`${API}/api/projects/${body.id}`, {
        headers: { Authorization: 'Bearer ' + testUserToken },
      });
      expect(getRes.status()).toBe(200);
      const forkedProject = await getRes.json();
      expect(forkedProject.owner_id).toBe(testUserId);
    });

    test('Cannot fork own project — returns 400', async ({ request }) => {
      const res = await request.post(`${API}/api/projects/${adminProjectId}/fork`, {
        headers: { Authorization: 'Bearer ' + adminToken },
      });
      expect(res.status()).toBe(400);

      const body = await res.json();
      expect(body.error).toBeTruthy();
    });

    test('Fork copies data — forked project is accessible', async ({ request }) => {
      const forkRes = await request.post(`${API}/api/projects/${adminProjectId}/fork`, {
        headers: { Authorization: 'Bearer ' + testUserToken },
      });
      expect(forkRes.status()).toBe(201);
      const forked = await forkRes.json();
      createdProjectIds.push(forked.id);

      // Verify the forked project exists and is accessible
      const getRes = await request.get(`${API}/api/projects/${forked.id}`, {
        headers: { Authorization: 'Bearer ' + testUserToken },
      });
      expect(getRes.status()).toBe(200);
      const project = await getRes.json();
      expect(project.id).toBe(forked.id);
      expect(project.name).toContain('(fork)');
    });

    test('Unauthenticated fork — returns 401', async ({ request }) => {
      const res = await request.post(`${API}/api/projects/${adminProjectId}/fork`);
      expect(res.status()).toBe(401);
    });
  });

  // ── Annotation permission tests (13.5) ─────────────────────────────

  test.describe('Annotation Permissions (13.5)', () => {
    test('Create annotation includes user_id matching the authenticated user', async ({ request }) => {
      const res = await request.post(`${API}/api/projects/${adminProjectId}/annotations`, {
        headers: { Authorization: 'Bearer ' + adminToken },
        data: {
          bridgeId: 'test-el-1',
          content: 'test note',
          positionX: 100,
          positionY: 200,
        },
      });
      expect(res.status()).toBe(201);

      const body = await res.json();
      expect(body.user_id).toBe(adminId);
    });

    test('GET annotations includes user_id and user_name fields', async ({ request }) => {
      // Create an annotation first
      await request.post(`${API}/api/projects/${adminProjectId}/annotations`, {
        headers: { Authorization: 'Bearer ' + adminToken },
        data: {
          bridgeId: 'test-el-user-info',
          content: 'annotation with user info',
        },
      });

      const res = await request.get(`${API}/api/projects/${adminProjectId}/annotations`);
      expect(res.status()).toBe(200);

      const annotations = await res.json();
      expect(Array.isArray(annotations)).toBe(true);
      expect(annotations.length).toBeGreaterThan(0);

      // Check that annotations created with auth have user_id and user_name
      const withUser = annotations.find((a: any) => a.user_id !== null);
      expect(withUser).toBeTruthy();
      expect(withUser.user_id).toBeTruthy();
      expect(withUser.user_name).toBeTruthy();
    });

    test('Author can delete own annotation — returns 204', async ({ request }) => {
      // Admin creates annotation
      const createRes = await request.post(`${API}/api/projects/${adminProjectId}/annotations`, {
        headers: { Authorization: 'Bearer ' + adminToken },
        data: {
          bridgeId: 'test-el-author-del',
          content: 'admin will delete this',
        },
      });
      expect(createRes.status()).toBe(201);
      const annotation = await createRes.json();

      // Admin deletes their own annotation
      const delRes = await request.delete(
        `${API}/api/projects/${adminProjectId}/annotations/${annotation.id}`,
        { headers: { Authorization: 'Bearer ' + adminToken } }
      );
      expect(delRes.status()).toBe(204);
    });

    test('Non-author non-admin cannot delete others\' annotation — returns 403', async ({ request }) => {
      // Admin creates annotation
      const createRes = await request.post(`${API}/api/projects/${adminProjectId}/annotations`, {
        headers: { Authorization: 'Bearer ' + adminToken },
        data: {
          bridgeId: 'test-el-forbidden',
          content: 'admin annotation that user cannot delete',
        },
      });
      expect(createRes.status()).toBe(201);
      const annotation = await createRes.json();

      // Test user (non-admin) tries to delete admin's annotation
      const delRes = await request.delete(
        `${API}/api/projects/${adminProjectId}/annotations/${annotation.id}`,
        { headers: { Authorization: 'Bearer ' + testUserToken } }
      );
      expect(delRes.status()).toBe(403);

      const body = await delRes.json();
      expect(body.error).toBeTruthy();
    });

    test('Admin can delete any annotation — returns 204', async ({ request }) => {
      // Test user creates annotation on the admin's project
      const createRes = await request.post(`${API}/api/projects/${adminProjectId}/annotations`, {
        headers: { Authorization: 'Bearer ' + testUserToken },
        data: {
          bridgeId: 'test-el-admin-del',
          content: 'user annotation that admin can delete',
        },
      });
      expect(createRes.status()).toBe(201);
      const annotation = await createRes.json();

      // Admin deletes the test user's annotation
      const delRes = await request.delete(
        `${API}/api/projects/${adminProjectId}/annotations/${annotation.id}`,
        { headers: { Authorization: 'Bearer ' + adminToken } }
      );
      expect(delRes.status()).toBe(204);
    });
  });
});
