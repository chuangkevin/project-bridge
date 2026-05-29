import { test, expect } from '@playwright/test';

/**
 * Smoke test — minimal "the app starts and CompilerWorkspace loads" check.
 *
 * Other e2e specs depend on this (`dependencies: ['smoke']` in playwright.config.ts).
 * Keep this lean: only verifies that the new CompilerWorkspace shell renders, NOT
 * any full journey. Full journeys live in compiler-*.spec.ts.
 */

test('CompilerWorkspace shell loads', async ({ page }) => {
  await page.goto('/project/smoke-demo');

  // Skip the anonymous-user picker if it appears.
  const anon = page.getByText('取消（以匿名繼續）');
  if (await anon.isVisible({ timeout: 2000 }).catch(() => false)) {
    await anon.click();
  }

  // The 4-column compiler shell is visible.
  await expect(page.getByLabel('compiler chat input')).toBeVisible({ timeout: 15000 });
  // Stage tabs are visible.
  await expect(page.getByText('AST')).toBeVisible();
});
