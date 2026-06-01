import { test, expect, type Page } from '@playwright/test';

/**
 * Plan 10c E2E — Screenshot input (Mirror identified + AST unknown).
 *
 * Route-mocked. Verifies that pasting an image triggers MirrorIntentCard,
 * Mirror flow identifies the source and produces a mirror artifact, and
 * AST flow produces an AST artifact directly via parseScreenshot.
 */

const PROJECT_ID = 'e2e-screenshot-demo';

async function resolveUserPickerIfPresent(page: Page): Promise<void> {
  const anon = page.getByText('取消（以匿名繼續）');
  if (await anon.isVisible({ timeout: 2000 }).catch(() => false)) await anon.click();
}

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';

async function pasteImage(page: Page): Promise<void> {
  await page.evaluate((b64) => {
    const ta = document.querySelector('textarea[aria-label="compiler chat input"]') as HTMLTextAreaElement;
    const dt = new DataTransfer();
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    dt.items.add(new File([bytes], 'shot.png', { type: 'image/png' }));
    const ev = new ClipboardEvent('paste', { clipboardData: dt as unknown as DataTransfer, bubbles: true });
    ta.dispatchEvent(ev);
  }, PNG_BASE64);
}

test('mirror+image — identified site flows to mirror artifact', async ({ page }) => {
  await page.route(`**/api/projects/${PROJECT_ID}/compile`, async (route) => {
    const body = route.request().postDataJSON();
    if (body?.mode === 'mirror' && body?.source?.kind === 'image') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, artifact: { kind: 'mirror', id: 'mirror-1', sourceUrl: 'https://detected.com', sourceType: 'url', crawledAt: new Date().toISOString(), files: { html: 'page.html', css: 'styles.css', screenshot: 'screenshot.png' }, warnings: [], editable: false } }),
      });
    } else {
      await route.continue();
    }
  });
  await page.route(`**/api/projects/${PROJECT_ID}/mirrors/mirror-1/page.html`, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<html><body><h1>Identified site</h1></body></html>' }),
  );

  await page.goto(`/project/${PROJECT_ID}`);
  await resolveUserPickerIfPresent(page);
  await pasteImage(page);

  await expect(page.getByText(/Attached/i)).toBeVisible();
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByTestId('mirror-intent-card')).toBeVisible();
  await page.getByLabel(/Mirror —/i).check();
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByRole('button', { name: /mirror-1/ })).toBeVisible({ timeout: 5000 });
});

test('ast+image — produces an AST artifact directly (no themeProposal)', async ({ page }) => {
  await page.route(`**/api/projects/${PROJECT_ID}/compile`, async (route) => {
    const body = route.request().postDataJSON();
    if (body?.mode === 'ast' && body?.source?.kind === 'image') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          ast: { schemaVersion: 1, artifactId: 'home', kind: 'page', root: { id: 'n_root', type: 'Container', props: {}, layout: { kind: 'flow' }, style: {}, bindings: [], events: [], constraints: [], children: [] } },
          violations: [],
          vue: { filename: 'Home.vue', code: '<template></template>' },
        }),
      });
    } else {
      await route.continue();
    }
  });

  await page.goto(`/project/${PROJECT_ID}`);
  await resolveUserPickerIfPresent(page);
  await pasteImage(page);

  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByTestId('mirror-intent-card')).toBeVisible();
  await page.getByLabel(/AST —/i).check();
  await page.getByRole('button', { name: 'Confirm' }).click();

  // ThemeMergeDialog should NOT appear for image-derived AST (no DOM/CSS source for theme extraction in 10c)
  await expect(page.getByTestId('theme-merge-dialog')).toHaveCount(0);
  // An AST artifact appears in rail
  await expect(page.getByRole('button', { pressed: true })).toBeVisible();
});
