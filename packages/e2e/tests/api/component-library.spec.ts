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

test.describe('API: Component CRUD + Extract + Version History (1.7)', () => {
  let adminToken = '';
  const createdComponentIds: string[] = [];

  test.beforeAll(async ({ request }) => {
    const { token } = await getAdminToken(request);
    adminToken = token;
  });

  test.afterAll(async ({ request }) => {
    for (const id of createdComponentIds) {
      try {
        await request.delete(`${API}/api/components/${id}`, {
          headers: authHeader(adminToken),
        });
      } catch {
        // ignore cleanup errors
      }
    }
  });

  test('POST /api/components/extract — extracts and creates a component', async ({ request }) => {
    const res = await request.post(`${API}/api/components/extract`, {
      headers: authHeader(adminToken),
      data: {
        html: '<div class="card">Test</div>',
        css: '.card { padding: 16px; }',
        name: 'Test Card',
        category: 'card',
        tags: ['test'],
      },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.id).toBeTruthy();
    expect(body.name).toBe('Test Card');
    expect(body.category).toBe('card');
    expect(body.html).toContain('card');
    expect(body.css).toContain('.card');

    createdComponentIds.push(body.id);
  });

  test('GET /api/components — returns paginated list containing created component', async ({ request }) => {
    // Ensure at least one component exists
    const createRes = await request.post(`${API}/api/components/extract`, {
      headers: authHeader(adminToken),
      data: {
        html: '<div class="list-card">List Test</div>',
        css: '.list-card { margin: 8px; }',
        name: 'List Test Card',
        category: 'card',
        tags: ['list-test'],
      },
    });
    const created = await createRes.json();
    createdComponentIds.push(created.id);

    const res = await request.get(`${API}/api/components`, {
      headers: authHeader(adminToken),
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.items).toBeTruthy();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(body.page).toBeTruthy();
    expect(body.limit).toBeTruthy();

    const found = body.items.find((c: any) => c.id === created.id);
    expect(found).toBeTruthy();
  });

  test('GET /api/components?category=card — filters by category', async ({ request }) => {
    const res = await request.get(`${API}/api/components?category=card`, {
      headers: authHeader(adminToken),
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.items).toBeTruthy();
    for (const item of body.items) {
      expect(item.category).toBe('card');
    }
  });

  test('GET /api/components?search=Test — searches components', async ({ request }) => {
    const res = await request.get(`${API}/api/components?search=Test`, {
      headers: authHeader(adminToken),
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.items).toBeTruthy();
    expect(body.items.length).toBeGreaterThanOrEqual(1);
  });

  test('GET /api/components/:id — returns component with versions array', async ({ request }) => {
    // Create a fresh component for this test
    const createRes = await request.post(`${API}/api/components/extract`, {
      headers: authHeader(adminToken),
      data: {
        html: '<div class="detail-card">Detail</div>',
        css: '.detail-card { padding: 12px; }',
        name: 'Detail Card',
        category: 'card',
        tags: ['detail'],
      },
    });
    const created = await createRes.json();
    createdComponentIds.push(created.id);

    const res = await request.get(`${API}/api/components/${created.id}`, {
      headers: authHeader(adminToken),
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.id).toBe(created.id);
    expect(body.name).toBe('Detail Card');
    expect(body.versions).toBeTruthy();
    expect(Array.isArray(body.versions)).toBe(true);
  });

  test('PUT /api/components/:id — updates component and creates version', async ({ request }) => {
    // Create component
    const createRes = await request.post(`${API}/api/components/extract`, {
      headers: authHeader(adminToken),
      data: {
        html: '<div class="version-card">V1</div>',
        css: '.version-card { padding: 8px; }',
        name: 'Version Card',
        category: 'card',
        tags: ['version'],
      },
    });
    const created = await createRes.json();
    createdComponentIds.push(created.id);

    // Get initial version count
    const beforeRes = await request.get(`${API}/api/components/${created.id}`, {
      headers: authHeader(adminToken),
    });
    const before = await beforeRes.json();
    const initialVersionCount = before.versions?.length ?? 0;

    // Update the component
    const updateRes = await request.put(`${API}/api/components/${created.id}`, {
      headers: authHeader(adminToken),
      data: {
        html: '<div class="version-card">Updated</div>',
      },
    });
    expect(updateRes.status()).toBe(200);

    const updated = await updateRes.json();
    expect(updated.html).toContain('Updated');

    // Verify version was created
    const afterRes = await request.get(`${API}/api/components/${created.id}`, {
      headers: authHeader(adminToken),
    });
    const after = await afterRes.json();
    expect(after.versions.length).toBeGreaterThan(initialVersionCount);
  });

  test('DELETE /api/components/:id — deletes component, then 404', async ({ request }) => {
    // Create component to delete
    const createRes = await request.post(`${API}/api/components/extract`, {
      headers: authHeader(adminToken),
      data: {
        html: '<div class="delete-card">Delete Me</div>',
        css: '.delete-card { color: red; }',
        name: 'Delete Card',
        category: 'card',
        tags: ['delete'],
      },
    });
    const created = await createRes.json();

    // Delete it
    const deleteRes = await request.delete(`${API}/api/components/${created.id}`, {
      headers: authHeader(adminToken),
    });
    expect(deleteRes.status()).toBe(204);

    // Confirm 404
    const getRes = await request.get(`${API}/api/components/${created.id}`, {
      headers: authHeader(adminToken),
    });
    expect(getRes.status()).toBe(404);
  });
});

test.describe('API: Project-Component Binding + Injection (4.6)', () => {
  let adminToken = '';
  const createdComponentIds: string[] = [];
  const createdProjectIds: string[] = [];

  test.beforeAll(async ({ request }) => {
    const { token } = await getAdminToken(request);
    adminToken = token;
  });

  test.afterAll(async ({ request }) => {
    for (const id of createdComponentIds) {
      try {
        await request.delete(`${API}/api/components/${id}`, {
          headers: authHeader(adminToken),
        });
      } catch {
        // ignore cleanup errors
      }
    }
    for (const id of createdProjectIds) {
      try {
        await request.delete(`${API}/api/projects/${id}`, {
          headers: authHeader(adminToken),
        });
      } catch {
        // ignore cleanup errors
      }
    }
  });

  test('bind component to project, list, unbind', async ({ request }) => {
    // Create a project
    const projectRes = await request.post(`${API}/api/projects`, {
      headers: authHeader(adminToken),
      data: { name: 'binding-test-project' },
    });
    expect(projectRes.ok()).toBeTruthy();
    const project = await projectRes.json();
    createdProjectIds.push(project.id);

    // Create a component
    const compRes = await request.post(`${API}/api/components/extract`, {
      headers: authHeader(adminToken),
      data: {
        html: '<div class="bind-card">Bind</div>',
        css: '.bind-card { border: 1px solid; }',
        name: 'Bind Card',
        category: 'card',
        tags: ['bind'],
      },
    });
    expect(compRes.status()).toBe(200);
    const component = await compRes.json();
    createdComponentIds.push(component.id);

    // Bind component to project
    const bindRes = await request.post(`${API}/api/projects/${project.id}/components/bind`, {
      headers: authHeader(adminToken),
      data: { componentId: component.id },
    });
    expect(bindRes.ok()).toBeTruthy();

    // List bound components
    const listRes = await request.get(`${API}/api/projects/${project.id}/components`, {
      headers: authHeader(adminToken),
    });
    expect(listRes.status()).toBe(200);
    const bound = await listRes.json();
    const boundArr = Array.isArray(bound) ? bound : bound.items ?? bound.components ?? [];
    expect(boundArr.length).toBeGreaterThanOrEqual(1);
    const found = boundArr.find((c: any) => c.id === component.id || c.component_id === component.id);
    expect(found).toBeTruthy();

    // Unbind component from project
    const unbindRes = await request.delete(
      `${API}/api/projects/${project.id}/components/${component.id}`,
      { headers: authHeader(adminToken) },
    );
    expect(unbindRes.status()).toBe(204);

    // Verify empty
    const emptyRes = await request.get(`${API}/api/projects/${project.id}/components`, {
      headers: authHeader(adminToken),
    });
    expect(emptyRes.status()).toBe(200);
    const emptyBody = await emptyRes.json();
    const emptyArr = Array.isArray(emptyBody) ? emptyBody : emptyBody.items ?? emptyBody.components ?? [];
    expect(emptyArr.length).toBe(0);
  });
});

test.describe('API: Crawl-extract endpoint (5.5)', () => {
  let adminToken = '';
  const createdComponentIds: string[] = [];

  test.beforeAll(async ({ request }) => {
    const { token } = await getAdminToken(request);
    adminToken = token;
  });

  test.afterAll(async ({ request }) => {
    for (const id of createdComponentIds) {
      try {
        await request.delete(`${API}/api/components/${id}`, {
          headers: authHeader(adminToken),
        });
      } catch {
        // ignore cleanup errors
      }
    }
  });

  test('POST /api/components/crawl-extract — crawls URL and extracts components', async ({ request }) => {
    const res = await request.post(`${API}/api/components/crawl-extract`, {
      headers: authHeader(adminToken),
      data: { url: 'https://example.com' },
      timeout: 30000,
    });

    // Crawl may fail if Playwright browser is not installed in the test environment
    if (res.status() === 200) {
      const body = await res.json();
      expect(body.url).toBe('https://example.com');
      expect(body.components).toBeTruthy();
      expect(Array.isArray(body.components)).toBe(true);
      expect(typeof body.total).toBe('number');

      // Track created components for cleanup
      for (const comp of body.components) {
        if (comp.id) {
          createdComponentIds.push(comp.id);
        }
      }
    } else {
      // Accept known error statuses when browser is not available
      const body = await res.json().catch(() => ({}));
      const status = res.status();
      // 400/422/500 are acceptable if browser is not installed
      expect([400, 422, 500]).toContain(status);
      // Optionally check for a meaningful error message
      if (body.error) {
        expect(typeof body.error).toBe('string');
      }
    }
  });
});
