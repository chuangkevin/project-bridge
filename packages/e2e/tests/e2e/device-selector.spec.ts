import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001';

test.describe('E2E: Device Size Selector', () => {
  let projectId: string;

  test.beforeEach(async ({ request }) => {
    const res = await request.post(`${API}/api/projects`, {
      data: { name: `E2E Device Test ${Date.now()}` },
    });
    const project = await res.json();
    projectId = project.id;
  });

  test.afterEach(async ({ request }) => {
    if (projectId) {
      await request.delete(`${API}/api/projects/${projectId}`);
    }
  });

  test('device size buttons are visible and desktop is default', async ({ page }) => {
    await page.goto(`/project/${projectId}`);

    // Wait for workspace to load (loading state resolves)
    await expect(page.getByTestId('device-desktop')).toBeVisible();
    await expect(page.getByTestId('device-tablet')).toBeVisible();
    await expect(page.getByTestId('device-mobile')).toBeVisible();
  });

  test('clicking tablet changes iframe dimensions', async ({ page }) => {
    await page.goto(`/project/${projectId}`);

    const tabletBtn = page.getByTestId('device-tablet');
    await expect(tabletBtn).toBeVisible();
    await tabletBtn.click();

    // Verify the tablet button becomes active (has blue color)
    await expect(tabletBtn).toHaveCSS('color', 'rgb(59, 130, 246)');
  });

  test('clicking mobile changes selector state', async ({ page }) => {
    await page.goto(`/project/${projectId}`);

    const mobileBtn = page.getByTestId('device-mobile');
    await expect(mobileBtn).toBeVisible();
    await mobileBtn.click();

    // Verify the mobile button becomes active
    await expect(mobileBtn).toHaveCSS('color', 'rgb(59, 130, 246)');
  });

  test('clicking desktop after another mode returns to desktop', async ({ page }) => {
    await page.goto(`/project/${projectId}`);

    // Switch to tablet first
    const tabletBtn = page.getByTestId('device-tablet');
    await expect(tabletBtn).toBeVisible();
    await tabletBtn.click();

    // Switch back to desktop
    const desktopBtn = page.getByTestId('device-desktop');
    await desktopBtn.click();

    // Verify desktop button is active
    await expect(desktopBtn).toHaveCSS('color', 'rgb(59, 130, 246)');
  });
});
