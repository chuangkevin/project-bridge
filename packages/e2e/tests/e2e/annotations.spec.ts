import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001';

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

  /** Dismiss onboarding tooltip if visible */
  async function dismissOnboarding(page: import('@playwright/test').Page) {
    const skipBtn = page.getByTestId('onboarding-skip');
    if (await skipBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await skipBtn.click();
    }
  }

  test('annotation mode toggle button exists', async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    await dismissOnboarding(page);
    await page.getByRole('tab', { name: '設計' }).click();
    const toggleBtn = page.getByTestId('annotate-toggle');
    await expect(toggleBtn).toBeVisible();
    await expect(toggleBtn).toContainText('標注');
  });

  test('clicking annotation mode toggle changes button appearance', async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    await dismissOnboarding(page);
    await page.getByRole('tab', { name: '設計' }).click();

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

    // Verify annotation mode banner appears
    await expect(page.getByText('✏️ 標注模式 — 點擊元件來修改或標注 · 按')).toBeVisible();

    // Click again to disable
    await toggleBtn.click();

    const bgFinal = await toggleBtn.evaluate(
      (el) => window.getComputedStyle(el).backgroundColor
    );

    // Should revert to original style
    expect(bgFinal).toBe(bgBefore);

    // Banner should disappear
    await expect(page.getByText('✏️ 標注模式 — 點擊元件來修改或標注 · 按')).not.toBeVisible();
  });
});
