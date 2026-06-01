import { test, expect, type Page } from '@playwright/test';

/**
 * Plan 10b E2E — AST mode (URL path) + Theme merge dialog.
 *
 * Route-mocked. Verifies: paste URL → MirrorIntentCard → pick AST → confirm →
 * AST artifact in rail + ThemeMergeDialog opens → Apply → dialog closes,
 * /theme/merge was called.
 */

const PROJECT_ID = 'e2e-ast-theme-demo';

const FAKE_AST = {
  schemaVersion: 1,
  artifactId: 'home',
  kind: 'page',
  root: { id: 'n_root', type: 'Container', props: {}, layout: { kind: 'flow' }, style: {}, bindings: [], events: [], constraints: [], children: [] },
};

const FAKE_THEME_PROPOSAL = {
  palette: [{ value: '#1a73e8', source: 'https://example.com' }],
  typography: { primaryFont: 'Inter', secondaryFont: null, headings: [], body: null },
  radius: ['4px'], shadow: [], source: 'https://example.com',
};

async function resolveUserPickerIfPresent(page: Page): Promise<void> {
  const anon = page.getByText('取消（以匿名繼續）');
  if (await anon.isVisible({ timeout: 2000 }).catch(() => false)) await anon.click();
}

test('paste URL → AST mode → ThemeMergeDialog → Apply writes merged theme', async ({ page }) => {
  await page.route(`**/api/projects/${PROJECT_ID}/compile`, async (route) => {
    const body = route.request().postDataJSON();
    if (body?.mode === 'ast' && body?.source?.kind === 'url') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          ast: FAKE_AST,
          violations: [],
          vue: { filename: 'Home.vue', code: '<template></template>' },
          themeProposal: FAKE_THEME_PROPOSAL,
        }),
      });
    } else {
      await route.continue();
    }
  });

  let mergeCalled = false;
  await page.route(`**/api/projects/${PROJECT_ID}/theme/merge`, async (route) => {
    mergeCalled = true;
    const body = route.request().postDataJSON();
    expect(body?.proposal?.palette?.[0]?.value).toBe('#1a73e8');
    expect(body?.choice).toBeDefined();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, theme: { schemaVersion: 1, updatedAt: 'x', palette: FAKE_THEME_PROPOSAL.palette, typography: FAKE_THEME_PROPOSAL.typography, radius: FAKE_THEME_PROPOSAL.radius, shadow: FAKE_THEME_PROPOSAL.shadow } }),
    });
  });

  await page.goto(`/project/${PROJECT_ID}`);
  await resolveUserPickerIfPresent(page);

  await page.getByLabel('compiler chat input').fill('參考 https://example.com');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByTestId('mirror-intent-card')).toBeVisible();

  await page.getByLabel(/AST —/i).check();
  await page.getByRole('button', { name: 'Confirm' }).click();

  // ThemeMergeDialog should appear after compile returns themeProposal
  await expect(page.getByTestId('theme-merge-dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Apply' }).click();

  // Dialog closes; merge endpoint was hit
  await expect(page.getByTestId('theme-merge-dialog')).toHaveCount(0);
  expect(mergeCalled).toBe(true);
});
