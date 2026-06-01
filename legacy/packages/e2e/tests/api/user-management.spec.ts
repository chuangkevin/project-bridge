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
    // First-time setup
    const setupRes = await request.post(`${API}/api/auth/setup`, {
      data: { name: `admin-${Date.now()}` },
    });
    expect(setupRes.status()).toBe(200);
    const setupBody = await setupRes.json();
    return { token: setupBody.token, userId: setupBody.user.id };
  }

  // DB already has users — find an admin and login
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

test.describe('API: Auth flow (13.2)', () => {
  const testUserIds: string[] = [];
  let adminToken = '';
  let adminUserId = '';

  test.beforeAll(async ({ request }) => {
    const { token, userId } = await getAdminToken(request);
    adminToken = token;
    adminUserId = userId;
  });

  test.afterAll(async ({ request }) => {
    // Clean up test users created during auth tests
    for (const id of testUserIds) {
      try {
        await request.delete(`${API}/api/users/${id}`, {
          headers: authHeader(adminToken),
        });
      } catch {
        // ignore cleanup errors
      }
    }
  });

  test('GET /api/auth/status — returns hasUsers boolean', async ({ request }) => {
    const res = await request.get(`${API}/api/auth/status`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(typeof body.hasUsers).toBe('boolean');
  });

  test('POST /api/auth/setup — creates admin when no users exist', async ({ request }) => {
    // Check current status
    const statusRes = await request.get(`${API}/api/auth/status`);
    const status = await statusRes.json();

    if (status.hasUsers) {
      // DB already has users; setup should reject
      const res = await request.post(`${API}/api/auth/setup`, {
        data: { name: 'should-fail-setup' },
      });
      // Expect 400 or 409 since users already exist
      expect(res.status()).toBeGreaterThanOrEqual(400);
    } else {
      // Fresh DB — setup should succeed
      const res = await request.post(`${API}/api/auth/setup`, {
        data: { name: `setup-admin-${Date.now()}` },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.token).toBeTruthy();
      expect(body.user.id).toBeTruthy();
      expect(body.user.name).toBeTruthy();
      expect(body.user.role).toBe('admin');
    }
  });

  test('POST /api/auth/login — valid userId returns token and user', async ({ request }) => {
    // Create a test user to login as
    const createRes = await request.post(`${API}/api/users`, {
      data: { name: `login-test-${Date.now()}` },
      headers: authHeader(adminToken),
    });
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();
    testUserIds.push(created.id);

    const res = await request.post(`${API}/api/auth/login`, {
      data: { userId: created.id },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.token).toBeTruthy();
    expect(body.user.id).toBe(created.id);
    expect(body.user.name).toBe(created.name);
  });

  test('POST /api/auth/login — invalid userId returns 404', async ({ request }) => {
    const res = await request.post(`${API}/api/auth/login`, {
      data: { userId: 'nonexistent-user-id-000' },
    });
    expect(res.status()).toBe(404);
  });

  test('GET /api/auth/me — with valid token returns user', async ({ request }) => {
    const res = await request.get(`${API}/api/auth/me`, {
      headers: authHeader(adminToken),
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.user).toBeTruthy();
    expect(body.user.id).toBe(adminUserId);
  });

  test('GET /api/auth/me — without token returns null user', async ({ request }) => {
    const res = await request.get(`${API}/api/auth/me`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.user).toBeNull();
  });

  test('POST /api/auth/logout — clears session', async ({ request }) => {
    // Create a user and login to get a fresh token
    const createRes = await request.post(`${API}/api/users`, {
      data: { name: `logout-test-${Date.now()}` },
      headers: authHeader(adminToken),
    });
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();
    testUserIds.push(created.id);

    const loginRes = await request.post(`${API}/api/auth/login`, {
      data: { userId: created.id },
    });
    const { token } = await loginRes.json();

    // Verify token works
    const meRes1 = await request.get(`${API}/api/auth/me`, {
      headers: authHeader(token),
    });
    const me1 = await meRes1.json();
    expect(me1.user).toBeTruthy();

    // Logout
    const logoutRes = await request.post(`${API}/api/auth/logout`, {
      headers: authHeader(token),
    });
    expect(logoutRes.status()).toBe(200);

    // Verify token no longer works
    const meRes2 = await request.get(`${API}/api/auth/me`, {
      headers: authHeader(token),
    });
    const me2 = await meRes2.json();
    expect(me2.user).toBeNull();
  });

  test('POST /api/auth/login — disabled user returns 404', async ({ request }) => {
    // Create and disable a user
    const createRes = await request.post(`${API}/api/users`, {
      data: { name: `disabled-login-${Date.now()}` },
      headers: authHeader(adminToken),
    });
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();
    testUserIds.push(created.id);

    // Disable the user
    const disableRes = await request.patch(`${API}/api/users/${created.id}/disable`, {
      headers: authHeader(adminToken),
    });
    expect(disableRes.status()).toBe(200);

    // Attempt login with disabled user
    const loginRes = await request.post(`${API}/api/auth/login`, {
      data: { userId: created.id },
    });
    expect(loginRes.status()).toBe(404);
  });

  test('GET /api/auth/users — lists active users', async ({ request }) => {
    const res = await request.get(`${API}/api/auth/users`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);

    const first = body[0];
    expect(first.id).toBeTruthy();
    expect(first.name).toBeTruthy();
    expect(first.role).toBeTruthy();
    expect(typeof first.is_active).toBe('number');
  });
});

test.describe('API: User CRUD (13.1)', () => {
  const testUserIds: string[] = [];
  let adminToken = '';
  let adminUserId = '';

  test.beforeAll(async ({ request }) => {
    const { token, userId } = await getAdminToken(request);
    adminToken = token;
    adminUserId = userId;
  });

  test.afterAll(async ({ request }) => {
    for (const id of testUserIds) {
      try {
        await request.delete(`${API}/api/users/${id}`, {
          headers: authHeader(adminToken),
        });
      } catch {
        // ignore cleanup errors
      }
    }
  });

  test('POST /api/users — admin can create user', async ({ request }) => {
    const name = `crud-create-${Date.now()}`;
    const res = await request.post(`${API}/api/users`, {
      data: { name },
      headers: authHeader(adminToken),
    });
    expect(res.status()).toBe(201);

    const body = await res.json();
    expect(body.id).toBeTruthy();
    expect(body.name).toBe(name);
    expect(body.role).toBe('user');
    expect(body.is_active).toBeTruthy();
    expect(body.created_at).toBeTruthy();

    testUserIds.push(body.id);
  });

  test('POST /api/users — duplicate name returns 409', async ({ request }) => {
    const name = `crud-dup-${Date.now()}`;
    const res1 = await request.post(`${API}/api/users`, {
      data: { name },
      headers: authHeader(adminToken),
    });
    expect(res1.status()).toBe(201);
    const created = await res1.json();
    testUserIds.push(created.id);

    const res2 = await request.post(`${API}/api/users`, {
      data: { name },
      headers: authHeader(adminToken),
    });
    expect(res2.status()).toBe(409);
  });

  test('POST /api/users — non-admin cannot create user (403)', async ({ request }) => {
    // Create a regular user and login as them
    const createRes = await request.post(`${API}/api/users`, {
      data: { name: `non-admin-${Date.now()}` },
      headers: authHeader(adminToken),
    });
    expect(createRes.status()).toBe(201);
    const regularUser = await createRes.json();
    testUserIds.push(regularUser.id);

    const loginRes = await request.post(`${API}/api/auth/login`, {
      data: { userId: regularUser.id },
    });
    const { token: regularToken } = await loginRes.json();

    // Try to create user as non-admin
    const res = await request.post(`${API}/api/users`, {
      data: { name: `should-fail-${Date.now()}` },
      headers: authHeader(regularToken),
    });
    expect(res.status()).toBe(403);
  });

  test('GET /api/users/all — admin can list all users including disabled', async ({ request }) => {
    const res = await request.get(`${API}/api/users/all`, {
      headers: authHeader(adminToken),
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);

    const first = body[0];
    expect(first.id).toBeTruthy();
    expect(first.name).toBeTruthy();
    expect(first.role).toBeTruthy();
  });

  test('PATCH /api/users/:id/disable — admin can disable user and sessions are cleared', async ({ request }) => {
    // Create user and login to get a session
    const createRes = await request.post(`${API}/api/users`, {
      data: { name: `disable-test-${Date.now()}` },
      headers: authHeader(adminToken),
    });
    const user = await createRes.json();
    testUserIds.push(user.id);

    const loginRes = await request.post(`${API}/api/auth/login`, {
      data: { userId: user.id },
    });
    const { token: userToken } = await loginRes.json();

    // Verify session works
    const meRes1 = await request.get(`${API}/api/auth/me`, {
      headers: authHeader(userToken),
    });
    const me1 = await meRes1.json();
    expect(me1.user).toBeTruthy();

    // Disable user
    const disableRes = await request.patch(`${API}/api/users/${user.id}/disable`, {
      headers: authHeader(adminToken),
    });
    expect(disableRes.status()).toBe(200);

    // Session should be cleared
    const meRes2 = await request.get(`${API}/api/auth/me`, {
      headers: authHeader(userToken),
    });
    const me2 = await meRes2.json();
    expect(me2.user).toBeNull();
  });

  test('PATCH /api/users/:id/disable — admin cannot disable self', async ({ request }) => {
    const res = await request.patch(`${API}/api/users/${adminUserId}/disable`, {
      headers: authHeader(adminToken),
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test('PATCH /api/users/:id/enable — admin can re-enable user', async ({ request }) => {
    // Create and disable a user
    const createRes = await request.post(`${API}/api/users`, {
      data: { name: `enable-test-${Date.now()}` },
      headers: authHeader(adminToken),
    });
    const user = await createRes.json();
    testUserIds.push(user.id);

    await request.patch(`${API}/api/users/${user.id}/disable`, {
      headers: authHeader(adminToken),
    });

    // Re-enable
    const enableRes = await request.patch(`${API}/api/users/${user.id}/enable`, {
      headers: authHeader(adminToken),
    });
    expect(enableRes.status()).toBe(200);

    // Should be able to login again
    const loginRes = await request.post(`${API}/api/auth/login`, {
      data: { userId: user.id },
    });
    expect(loginRes.status()).toBe(200);
  });

  test('DELETE /api/users/:id — admin can delete user', async ({ request }) => {
    const createRes = await request.post(`${API}/api/users`, {
      data: { name: `delete-test-${Date.now()}` },
      headers: authHeader(adminToken),
    });
    const user = await createRes.json();

    const deleteRes = await request.delete(`${API}/api/users/${user.id}`, {
      headers: authHeader(adminToken),
    });
    expect(deleteRes.status()).toBe(200);

    // Should not appear in login
    const loginRes = await request.post(`${API}/api/auth/login`, {
      data: { userId: user.id },
    });
    expect(loginRes.status()).toBe(404);
  });

  test('DELETE /api/users/:id — admin cannot delete self', async ({ request }) => {
    const res = await request.delete(`${API}/api/users/${adminUserId}`, {
      headers: authHeader(adminToken),
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test('DELETE /api/users/:id — projects are reassigned on delete', async ({ request }) => {
    // Create a user
    const createRes = await request.post(`${API}/api/users`, {
      data: { name: `reassign-test-${Date.now()}` },
      headers: authHeader(adminToken),
    });
    const user = await createRes.json();

    // Login as that user and create a project
    const loginRes = await request.post(`${API}/api/auth/login`, {
      data: { userId: user.id },
    });
    const { token: userToken } = await loginRes.json();

    const projectRes = await request.post(`${API}/api/projects`, {
      data: { name: `reassign-project-${Date.now()}` },
      headers: authHeader(userToken),
    });
    let projectId: string | null = null;
    if (projectRes.status() === 201) {
      const project = await projectRes.json();
      projectId = project.id;
    }

    // Delete the user — projects should be reassigned to admin
    const deleteRes = await request.delete(`${API}/api/users/${user.id}`, {
      headers: authHeader(adminToken),
    });
    expect(deleteRes.status()).toBe(200);

    // Verify project still exists (reassigned to admin)
    if (projectId) {
      const projRes = await request.get(`${API}/api/projects/${projectId}`, {
        headers: authHeader(adminToken),
      });
      expect(projRes.status()).toBe(200);

      // Clean up the project
      await request.delete(`${API}/api/projects/${projectId}`, {
        headers: authHeader(adminToken),
      });
    }
  });
});

test.describe('API: Admin transfer (13.1)', () => {
  const testUserIds: string[] = [];
  let adminToken = '';
  let adminUserId = '';

  test.beforeAll(async ({ request }) => {
    const { token, userId } = await getAdminToken(request);
    adminToken = token;
    adminUserId = userId;
  });

  test.afterAll(async ({ request }) => {
    // Re-login as current admin to clean up (admin may have changed)
    const { token } = await getAdminToken(request);
    for (const id of testUserIds) {
      try {
        await request.delete(`${API}/api/users/${id}`, {
          headers: authHeader(token),
        });
      } catch {
        // ignore cleanup errors
      }
    }
  });

  test('POST /api/users/transfer-admin — admin can transfer role to regular user', async ({ request }) => {
    // Create a regular user to transfer admin to
    const createRes = await request.post(`${API}/api/users`, {
      data: { name: `transfer-target-${Date.now()}` },
      headers: authHeader(adminToken),
    });
    expect(createRes.status()).toBe(201);
    const targetUser = await createRes.json();
    testUserIds.push(targetUser.id);

    // Transfer admin role
    const transferRes = await request.post(`${API}/api/users/transfer-admin`, {
      data: { targetUserId: targetUser.id },
      headers: authHeader(adminToken),
    });
    expect(transferRes.status()).toBe(200);

    // Login as new admin to verify
    const loginRes = await request.post(`${API}/api/auth/login`, {
      data: { userId: targetUser.id },
    });
    const newAdmin = await loginRes.json();
    expect(newAdmin.user.role).toBe('admin');

    // Old admin should no longer be admin
    const oldAdminLogin = await request.post(`${API}/api/auth/login`, {
      data: { userId: adminUserId },
    });
    const oldAdmin = await oldAdminLogin.json();
    expect(oldAdmin.user.role).toBe('user');
    testUserIds.push(adminUserId);

    // Transfer back so subsequent cleanup works
    const restoreRes = await request.post(`${API}/api/users/transfer-admin`, {
      data: { targetUserId: adminUserId },
      headers: authHeader(newAdmin.token),
    });
    expect(restoreRes.status()).toBe(200);

    // Re-login as original admin to restore token
    const relogin = await request.post(`${API}/api/auth/login`, {
      data: { userId: adminUserId },
    });
    const restored = await relogin.json();
    adminToken = restored.token;

    // Remove old admin from cleanup list since they are admin again
    const idx = testUserIds.indexOf(adminUserId);
    if (idx !== -1) testUserIds.splice(idx, 1);
  });

  test('POST /api/users/transfer-admin — cannot transfer to disabled user', async ({ request }) => {
    // Create and disable a user
    const createRes = await request.post(`${API}/api/users`, {
      data: { name: `transfer-disabled-${Date.now()}` },
      headers: authHeader(adminToken),
    });
    expect(createRes.status()).toBe(201);
    const user = await createRes.json();
    testUserIds.push(user.id);

    await request.patch(`${API}/api/users/${user.id}/disable`, {
      headers: authHeader(adminToken),
    });

    // Try to transfer admin to disabled user
    const transferRes = await request.post(`${API}/api/users/transfer-admin`, {
      data: { targetUserId: user.id },
      headers: authHeader(adminToken),
    });
    expect(transferRes.status()).toBeGreaterThanOrEqual(400);
  });
});
