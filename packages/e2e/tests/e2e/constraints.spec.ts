import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001';

test.describe('E2E: Constraints Bar', () => {
  let projectId: string;

  test.beforeEach(async ({ request }) => {
    const res = await request.post(`${API}/api/projects`, {
      data: { name: 'E2E Constraints Test' },
    });
    const project = await res.json();
    projectId = project.id;
  });

  test.afterEach(async ({ request }) => {
    if (projectId) {
      await request.delete(`${API}/api/projects/${projectId}`);
    }
  });

  test('constraints bar toggle exists and opens on click', async ({ page }) => {
    await page.goto(`/project/${projectId}`);

    const toggle = page.getByTestId('constraints-toggle');
    await expect(toggle).toBeVisible();

    // Bar should not be visible initially
    await expect(page.getByTestId('constraints-bar')).not.toBeVisible();

    // Click to expand
    await toggle.click();

    // Bar should now be visible
    await expect(page.getByTestId('constraints-bar')).toBeVisible();
  });

  test('device, color, and language dropdowns exist', async ({ page }) => {
    await page.goto(`/project/${projectId}`);

    // Open constraints bar
    await page.getByTestId('constraints-toggle').click();
    await expect(page.getByTestId('constraints-bar')).toBeVisible();

    // Verify labels
    await expect(page.getByText('Device')).toBeVisible();
    await expect(page.getByText('Color')).toBeVisible();
    await expect(page.getByText('Language')).toBeVisible();

    // Verify the three select elements exist within the constraints bar
    const bar = page.getByTestId('constraints-bar');
    const selects = bar.locator('select');
    await expect(selects).toHaveCount(3);
  });

  test('selecting different options updates the dropdowns', async ({ page }) => {
    await page.goto(`/project/${projectId}`);

    // Open constraints bar
    await page.getByTestId('constraints-toggle').click();

    const bar = page.getByTestId('constraints-bar');

    // Get the three selects by their label context
    const deviceSelect = bar.locator('select').first();
    const colorSelect = bar.locator('select').nth(1);
    const languageSelect = bar.locator('select').nth(2);

    // Verify default values
    await expect(deviceSelect).toHaveValue('Desktop');
    await expect(colorSelect).toHaveValue('Light');

    // Change device to Mobile
    await deviceSelect.selectOption('Mobile');
    await expect(deviceSelect).toHaveValue('Mobile');

    // Change color to Dark
    await colorSelect.selectOption('Dark');
    await expect(colorSelect).toHaveValue('Dark');

    // Change language to English
    await languageSelect.selectOption('English');
    await expect(languageSelect).toHaveValue('English');
  });
});
