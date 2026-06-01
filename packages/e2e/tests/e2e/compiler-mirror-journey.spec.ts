import { test, expect, type Page } from '@playwright/test';

/**
 * Plan 10a E2E — Mirror mode (URL path) journey on CompilerWorkspace.
 *
 * Deterministic: /compile and the mirrors page.html endpoint are route-mocked.
 * Verifies: paste URL → MirrorIntentCard → confirm Mirror → mirror artifact in rail with 🔒
 *           → PreviewPane shows the mirrored iframe content.
 */

const PROJECT_ID = 'e2e-mirror-demo';

const MIRROR_ARTIFACT = {
  kind: 'mirror' as const,
  id: 'mirror-1',
  sourceUrl: 'https://example.com',
  sourceType: 'url' as const,
  crawledAt: new Date().toISOString(),
  files: { html: 'page.html', css: 'styles.css', screenshot: 'screenshot.png' },
  warnings: [] as Array<{ code: string; url?: string; detail?: string }>,
  editable: false as const,
};

async function resolveUserPickerIfPresent(page: Page): Promise<void> {
  const anon = page.getByText('取消（以匿名繼續）');
  if (await anon.isVisible({ timeout: 2000 }).catch(() => false)) {
    await anon.click();
  }
}

test.describe('compiler mirror journey', () => {
  test.beforeEach(async ({ page }) => {
    // Mock the compile endpoint to handle mirror mode.
    await page.route(`**/api/projects/${PROJECT_ID}/compile`, async (route) => {
      const body = route.request().postDataJSON();
      if (body?.mode === 'mirror') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, artifact: MIRROR_ARTIFACT }),
        });
      } else {
        await route.continue();
      }
    });

    // Mock the mirror page.html serve.
    await page.route(`**/api/projects/${PROJECT_ID}/mirrors/${MIRROR_ARTIFACT.id}/page.html`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: '<html><body><h1>Mirrored page</h1></body></html>',
      }),
    );
  });

  test('paste URL → MirrorIntentCard → mirror artifact in rail with 🔒', async ({ page }) => {
    await page.goto(`/project/${PROJECT_ID}`);
    await resolveUserPickerIfPresent(page);

    await page.getByLabel('compiler chat input').fill('mirror this https://example.com');
    await page.getByRole('button', { name: 'Send' }).click();

    // Intent card appears
    await expect(page.getByTestId('mirror-intent-card')).toBeVisible();
    await expect(page.getByText(/https:\/\/example\.com/).first()).toBeVisible();

    // Pick Mirror + confirm
    await page.getByLabel(/Mirror —/i).check();
    await page.getByRole('button', { name: 'Confirm' }).click();

    // Mirror artifact shows up in rail with 🔒 prefix and locked tooltip
    await expect(page.getByRole('button', { pressed: true }).filter({ hasText: 'mirror-1' })).toBeVisible({ timeout: 5000 });
    expect(await page.getByRole('button', { name: /mirror-1/ }).textContent()).toContain('🔒');

    // Preview iframe loads the mocked mirror page
    const iframe = page.locator('iframe[title="Mirror preview"]');
    await expect(iframe).toBeVisible();
    await expect(iframe.contentFrame().locator('h1')).toHaveText('Mirrored page');
  });

  test('crawl failure surfaces an alert and does NOT add an artifact', async ({ page }) => {
    await page.unroute(`**/api/projects/${PROJECT_ID}/compile`);
    await page.route(`**/api/projects/${PROJECT_ID}/compile`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, reason: 'crawl_timeout', detail: 'timed out' }),
      }),
    );

    await page.goto(`/project/${PROJECT_ID}`);
    await resolveUserPickerIfPresent(page);

    await page.getByLabel('compiler chat input').fill('完整複製 https://example.com');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByTestId('mirror-intent-card')).toBeVisible();
    await page.getByRole('button', { name: 'Confirm' }).click();

    await expect(page.getByRole('alert')).toContainText(/crawl_timeout/);
    // No mirror artifact button rendered
    await expect(page.getByRole('button', { name: /mirror-1/ })).toHaveCount(0);
  });
});
