import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001';

test.describe('API: Annotation CRUD', () => {
  const createdIds: string[] = [];

  test.afterEach(async ({ request }) => {
    for (const id of createdIds) {
      try {
        await request.delete(`${API}/api/projects/${id}`);
      } catch {
        // ignore cleanup errors
      }
    }
    createdIds.length = 0;
  });

  test('POST create annotation with bridgeId, label, content, specData', async ({ request }) => {
    // Create project
    const projRes = await request.post(`${API}/api/projects`, {
      data: { name: 'Annotation Create Test' },
    });
    const project = await projRes.json();
    createdIds.push(project.id);

    const res = await request.post(`${API}/api/projects/${project.id}/annotations`, {
      data: {
        bridgeId: 'bridge-elem-1',
        label: 'Test Label',
        content: 'This is a test annotation',
        specData: { fieldName: 'email', fieldType: 'email' },
      },
    });

    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.id).toBeTruthy();
    expect(body.bridge_id).toBe('bridge-elem-1');
    expect(body.label).toBe('Test Label');
    expect(body.content).toBe('This is a test annotation');
    expect(body.created_at).toBeTruthy();
    expect(body.updated_at).toBeTruthy();
  });

  test('GET list annotations for project', async ({ request }) => {
    // Create project
    const projRes = await request.post(`${API}/api/projects`, {
      data: { name: 'Annotation List Test' },
    });
    const project = await projRes.json();
    createdIds.push(project.id);

    // Create two annotations
    await request.post(`${API}/api/projects/${project.id}/annotations`, {
      data: { bridgeId: 'elem-1', label: 'First', content: 'First annotation' },
    });
    await request.post(`${API}/api/projects/${project.id}/annotations`, {
      data: { bridgeId: 'elem-2', label: 'Second', content: 'Second annotation' },
    });

    const res = await request.get(`${API}/api/projects/${project.id}/annotations`);
    expect(res.status()).toBe(200);

    const annotations = await res.json();
    expect(Array.isArray(annotations)).toBe(true);
    expect(annotations.length).toBe(2);
    expect(annotations[0].bridge_id).toBe('elem-1');
    expect(annotations[1].bridge_id).toBe('elem-2');
  });

  test('PUT update annotation content and specData', async ({ request }) => {
    // Create project
    const projRes = await request.post(`${API}/api/projects`, {
      data: { name: 'Annotation Update Test' },
    });
    const project = await projRes.json();
    createdIds.push(project.id);

    // Create annotation
    const createRes = await request.post(`${API}/api/projects/${project.id}/annotations`, {
      data: { bridgeId: 'elem-upd', label: 'Original', content: 'Original content' },
    });
    const annotation = await createRes.json();

    // Update
    const updateRes = await request.put(
      `${API}/api/projects/${project.id}/annotations/${annotation.id}`,
      {
        data: {
          content: 'Updated content',
          specData: { fieldName: 'username', fieldType: 'text' },
        },
      }
    );

    expect(updateRes.status()).toBe(200);
    const updated = await updateRes.json();
    expect(updated.content).toBe('Updated content');
    // specData is stored as JSON string
    const specData = typeof updated.spec_data === 'string'
      ? JSON.parse(updated.spec_data)
      : updated.spec_data;
    expect(specData.fieldName).toBe('username');
    expect(specData.fieldType).toBe('text');
  });

  test('DELETE annotation — returns 204', async ({ request }) => {
    // Create project
    const projRes = await request.post(`${API}/api/projects`, {
      data: { name: 'Annotation Delete Test' },
    });
    const project = await projRes.json();
    createdIds.push(project.id);

    // Create annotation
    const createRes = await request.post(`${API}/api/projects/${project.id}/annotations`, {
      data: { bridgeId: 'elem-del', label: 'To Delete', content: 'Delete me' },
    });
    const annotation = await createRes.json();

    // Delete
    const delRes = await request.delete(
      `${API}/api/projects/${project.id}/annotations/${annotation.id}`
    );
    expect(delRes.status()).toBe(204);

    // Verify it's gone
    const listRes = await request.get(`${API}/api/projects/${project.id}/annotations`);
    const annotations = await listRes.json();
    expect(annotations.find((a: any) => a.id === annotation.id)).toBeUndefined();
  });

  test('POST annotation on non-existent project — returns 404', async ({ request }) => {
    const res = await request.post(`${API}/api/projects/nonexistent-id-99/annotations`, {
      data: { bridgeId: 'elem-1', content: 'orphan' },
    });
    expect(res.status()).toBe(404);
  });

  test('PUT annotation on non-existent annotation — returns 404', async ({ request }) => {
    // Create project
    const projRes = await request.post(`${API}/api/projects`, {
      data: { name: 'Annotation 404 Test' },
    });
    const project = await projRes.json();
    createdIds.push(project.id);

    const res = await request.put(
      `${API}/api/projects/${project.id}/annotations/nonexistent-ann-id`,
      { data: { content: 'updated' } }
    );
    expect(res.status()).toBe(404);
  });

  test('DELETE annotation on non-existent annotation — returns 404', async ({ request }) => {
    // Create project
    const projRes = await request.post(`${API}/api/projects`, {
      data: { name: 'Annotation Del 404 Test' },
    });
    const project = await projRes.json();
    createdIds.push(project.id);

    const res = await request.delete(
      `${API}/api/projects/${project.id}/annotations/nonexistent-ann-id`
    );
    expect(res.status()).toBe(404);
  });

  test('GET annotations on non-existent project — returns 404', async ({ request }) => {
    const res = await request.get(`${API}/api/projects/nonexistent-id-99/annotations`);
    expect(res.status()).toBe(404);
  });
});
