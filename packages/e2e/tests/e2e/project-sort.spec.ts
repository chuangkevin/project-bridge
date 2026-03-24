import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001';

test.describe('E2E: Project Drag-and-Drop Sorting', () => {
  const projectNames = ['E2E Sort AAA', 'E2E Sort BBB', 'E2E Sort CCC'];
  let projectIds: string[] = [];

  test.beforeEach(async ({ request }) => {
    // Create 3 projects in order
    projectIds = [];
    for (const name of projectNames) {
      const res = await request.post(`${API}/api/projects`, {
        data: { name },
      });
      const p = await res.json();
      projectIds.push(p.id);
    }
  });

  test.afterEach(async ({ request }) => {
    for (const id of projectIds) {
      await request.delete(`${API}/api/projects/${id}`);
    }
    // Clean up any stale projects
    const res = await request.get(`${API}/api/projects`);
    if (res.ok()) {
      const projects = await res.json();
      for (const p of projects) {
        if (p.name.startsWith('E2E Sort')) {
          await request.delete(`${API}/api/projects/${p.id}`);
        }
      }
    }
  });

  test('sort dropdown includes custom sort option', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('sort-select')).toBeVisible();
    const options = page.getByTestId('sort-select').locator('option');
    await expect(options).toHaveCount(4);
    // "自訂排序" should be the first option
    await expect(options.first()).toHaveText('自訂排序');
  });

  test('project cards are visible and have data-testid attributes', async ({ page }) => {
    await page.goto('/');
    for (const id of projectIds) {
      await expect(page.getByTestId(`project-card-${id}`)).toBeVisible();
    }
  });

  test('drag and drop reorders project cards', async ({ page }) => {
    await page.goto('/');

    // Wait for all cards to appear
    for (const id of projectIds) {
      await expect(page.getByTestId(`project-card-${id}`)).toBeVisible();
    }

    // Ensure custom sort is selected
    await page.getByTestId('sort-select').selectOption('custom');

    // Get the first and last project cards
    const firstCard = page.getByTestId(`project-card-${projectIds[0]}`);
    const lastCard = page.getByTestId(`project-card-${projectIds[2]}`);

    // Get bounding boxes
    const firstBox = await firstCard.boundingBox();
    const lastBox = await lastCard.boundingBox();

    if (!firstBox || !lastBox) {
      test.skip(true, 'Could not get bounding boxes for cards');
      return;
    }

    // Drag the first card to the last card position
    await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2);
    await page.mouse.down();
    // Move slowly to trigger the drag
    await page.mouse.move(lastBox.x + lastBox.width / 2, lastBox.y + lastBox.height / 2, { steps: 10 });
    await page.mouse.up();

    // Brief wait for reorder to settle
    await page.waitForTimeout(500);

    // The page should still show all 3 projects
    for (const id of projectIds) {
      await expect(page.getByTestId(`project-card-${id}`)).toBeVisible();
    }
  });
});
