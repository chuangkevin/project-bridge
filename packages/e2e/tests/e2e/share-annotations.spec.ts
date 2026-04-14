import { test, expect } from '@playwright/test';

const API = process.env.PLAYWRIGHT_API_BASE_URL || 'http://localhost:3001';

test.describe('E2E: Share Page with Annotations', () => {
  let projectId: string;
  let shareToken: string;

  test.beforeEach(async ({ request }) => {
    // Create project
    const res = await request.post(`${API}/api/projects`, {
      data: { name: 'E2E Share Annotation Test' },
    });
    const project = await res.json();
    projectId = project.id;
    shareToken = project.share_token;

    // Create an annotation via API
    await request.post(`${API}/api/projects/${projectId}/annotations`, {
      data: {
        bridgeId: 'share-elem-1',
        label: 'Share Label',
        content: 'This is a shared annotation',
        specData: { fieldName: 'email', fieldType: 'email' },
      },
    });
  });

  test.afterEach(async ({ request }) => {
    if (projectId) {
      await request.delete(`${API}/api/projects/${projectId}`);
    }
  });

  test('share page loads with project name', async ({ page }) => {
    await page.goto(`/share/${shareToken}`);

    // Verify the share page loads with the project name
    await expect(page.getByText('E2E Share Annotation Test')).toBeVisible({ timeout: 10000 });
  });

  test('share API returns annotations', async ({ request }) => {
    // Verify the share endpoint returns annotations data
    const res = await request.get(`${API}/api/share/${shareToken}`);
    expect(res.status()).toBe(200);

    const data = await res.json();
    expect(data.name).toBe('E2E Share Annotation Test');
    expect(Array.isArray(data.annotations)).toBe(true);
    expect(data.annotations.length).toBe(1);
    expect(data.annotations[0].bridge_id).toBe('share-elem-1');
    expect(data.annotations[0].content).toBe('This is a shared annotation');
  });

  test('share page with invalid token shows not found', async ({ page }) => {
    await page.goto('/share/invalid-token-xyz');

    // Verify the not found state
    await expect(page.getByText('Project not found')).toBeVisible({ timeout: 10000 });
  });
});
