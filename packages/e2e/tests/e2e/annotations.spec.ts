import { test, expect } from '@playwright/test';

const API = process.env.PLAYWRIGHT_API_BASE_URL || 'http://localhost:3001';

test.describe('E2E: Annotation Mode', () => {
  let projectId: string;

  test.beforeEach(async ({ request }) => {
    const res = await request.post(`${API}/api/projects`, {
      data: { name: 'E2E Annotation Test' },
    });
    const project = await res.json();
    projectId = project.id;
  });

  test.afterEach(async ({ request }) => {
    if (projectId) {
      await request.delete(`${API}/api/projects/${projectId}`);
    }
  });

  test('annotation mode toggle button exists', async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    await expect(page.getByTestId('annotate-toggle')).toBeVisible();
  });

  test('clicking annotation mode toggle changes button appearance', async ({ page }) => {
    await page.goto(`/project/${projectId}`);

    const toggleBtn = page.getByTestId('annotate-toggle');
    await expect(toggleBtn).toBeVisible();

    // Initially the button should NOT have the active background color
    const bgBefore = await toggleBtn.evaluate(
      (el) => window.getComputedStyle(el).backgroundColor
    );

    // Click to enable annotation mode
    await toggleBtn.click();

    // After clicking, the button style should change (active state)
    const bgAfter = await toggleBtn.evaluate(
      (el) => window.getComputedStyle(el).backgroundColor
    );

    expect(bgBefore).not.toBe(bgAfter);

    // Click again to disable
    await toggleBtn.click();

    const bgFinal = await toggleBtn.evaluate(
      (el) => window.getComputedStyle(el).backgroundColor
    );

    // Should revert to original style
    expect(bgFinal).toBe(bgBefore);
  });
});
