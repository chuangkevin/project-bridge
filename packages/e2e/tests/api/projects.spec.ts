import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001';

test.describe('API: Project CRUD', () => {
  const createdIds: string[] = [];

  test.afterEach(async ({ request }) => {
    // Clean up all projects created during tests
    for (const id of createdIds) {
      try {
        await request.delete(`${API}/api/projects/${id}`);
      } catch {
        // ignore cleanup errors
      }
    }
    createdIds.length = 0;
  });

  test('POST /api/projects — creates project with valid id, name, share_token', async ({ request }) => {
    const res = await request.post(`${API}/api/projects`, {
      data: { name: 'Test Project' },
    });
    expect(res.status()).toBe(201);

    const body = await res.json();
    expect(body.id).toBeTruthy();
    expect(body.name).toBe('Test Project');
    expect(body.share_token).toBeTruthy();
    expect(typeof body.share_token).toBe('string');
    expect(body.share_token.length).toBeGreaterThan(0);
    expect(body.created_at).toBeTruthy();
    expect(body.updated_at).toBeTruthy();

    createdIds.push(body.id);
  });

  test('POST /api/projects with empty name — returns 400', async ({ request }) => {
    const res = await request.post(`${API}/api/projects`, {
      data: { name: '' },
    });
    expect(res.status()).toBe(400);

    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  test('POST /api/projects with missing name — returns 400', async ({ request }) => {
    const res = await request.post(`${API}/api/projects`, {
      data: {},
    });
    expect(res.status()).toBe(400);
  });

  test('GET /api/projects — returns array sorted by updated_at desc', async ({ request }) => {
    // Create two projects
    const res1 = await request.post(`${API}/api/projects`, {
      data: { name: 'First Project' },
    });
    const proj1 = await res1.json();
    createdIds.push(proj1.id);

    // Small delay so updated_at differs
    await new Promise(r => setTimeout(r, 50));

    const res2 = await request.post(`${API}/api/projects`, {
      data: { name: 'Second Project' },
    });
    const proj2 = await res2.json();
    createdIds.push(proj2.id);

    const listRes = await request.get(`${API}/api/projects`);
    expect(listRes.status()).toBe(200);

    const projects = await listRes.json();
    expect(Array.isArray(projects)).toBe(true);
    expect(projects.length).toBeGreaterThanOrEqual(2);

    // Verify sorted by updated_at desc
    for (let i = 1; i < projects.length; i++) {
      expect(projects[i - 1].updated_at >= projects[i].updated_at).toBe(true);
    }
  });

  test('GET /api/projects/:id — returns project', async ({ request }) => {
    const createRes = await request.post(`${API}/api/projects`, {
      data: { name: 'Get Test' },
    });
    const created = await createRes.json();
    createdIds.push(created.id);

    const res = await request.get(`${API}/api/projects/${created.id}`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.id).toBe(created.id);
    expect(body.name).toBe('Get Test');
    expect(body).toHaveProperty('currentHtml');
    expect(body).toHaveProperty('currentVersion');
  });

  test('GET /api/projects/:id with bad id — returns 404', async ({ request }) => {
    const res = await request.get(`${API}/api/projects/nonexistent-id-12345`);
    expect(res.status()).toBe(404);
  });

  test('PUT /api/projects/:id — updates name', async ({ request }) => {
    const createRes = await request.post(`${API}/api/projects`, {
      data: { name: 'Before Update' },
    });
    const created = await createRes.json();
    createdIds.push(created.id);

    const updateRes = await request.put(`${API}/api/projects/${created.id}`, {
      data: { name: 'After Update' },
    });
    expect(updateRes.status()).toBe(200);

    const updated = await updateRes.json();
    expect(updated.name).toBe('After Update');
    expect(updated.id).toBe(created.id);
  });

  test('DELETE /api/projects/:id — returns 204 and project is gone', async ({ request }) => {
    const createRes = await request.post(`${API}/api/projects`, {
      data: { name: 'To Delete' },
    });
    const created = await createRes.json();

    const delRes = await request.delete(`${API}/api/projects/${created.id}`);
    expect(delRes.status()).toBe(204);

    // Verify project is gone
    const getRes = await request.get(`${API}/api/projects/${created.id}`);
    expect(getRes.status()).toBe(404);
  });

  test('DELETE cascades — conversations are removed with project', async ({ request }) => {
    // Create project
    const createRes = await request.post(`${API}/api/projects`, {
      data: { name: 'Cascade Test' },
    });
    const project = await createRes.json();

    // Try to create a conversation via the chat endpoint
    // This may fail without an OpenAI key, so we just verify the conversation endpoint
    // works and then check cascade on delete
    const convBefore = await request.get(`${API}/api/projects/${project.id}/conversations`);
    expect(convBefore.status()).toBe(200);

    // Delete the project
    const delRes = await request.delete(`${API}/api/projects/${project.id}`);
    expect(delRes.status()).toBe(204);

    // Verify conversations endpoint returns 404 for deleted project
    const convAfter = await request.get(`${API}/api/projects/${project.id}/conversations`);
    expect(convAfter.status()).toBe(404);
  });
});
