import { test, expect, type Page } from '@playwright/test';

/**
 * M1 E2E — AI UI Compiler journey on the new CompilerWorkspace (Plan 6b).
 *
 * Deterministic by design: the /compile and /compile/mutate endpoints are route-mocked,
 * so this does NOT depend on a live AI provider (fast + CI-safe). It verifies the UI
 * journey: navigate → describe a UI → preview renders → inspect codegen → chat-edit → re-render.
 *
 * NOTE: this spec targets the NEW compiler UI. The legacy smoke.spec.ts / other e2e specs
 * target the OLD mode UI (now routed away) and are expected to fail until rewritten — that
 * rewrite + a live (un-mocked) run is part of M1 sign-off and is intentionally NOT done here.
 * Run this spec in isolation, e.g.:
 *   npx playwright test tests/e2e/compiler-journey.spec.ts --project=e2e
 * (you may need to temporarily drop the smoke dependency in playwright.config.ts, since the
 *  legacy smoke spec fails against the new UI.)
 */

const PROJECT_ID = 'e2e-compiler-demo';

const COLD = {
  ast: {
    schemaVersion: 1,
    artifactId: 'home',
    kind: 'page',
    root: {
      id: 'n_root',
      type: 'Form',
      props: {},
      layout: { kind: 'stack', direction: 'vertical', gap: 12 },
      style: { padding: 24 },
      bindings: [],
      events: [],
      constraints: [],
      children: [
        { id: 'n_h', type: 'Heading', props: { content: 'Sign in', level: '1' }, layout: { kind: 'flow' }, style: {}, bindings: [], events: [], constraints: [], children: [] },
        { id: 'n_email', type: 'Input', props: { inputType: 'email', placeholder: 'Email' }, layout: { kind: 'flow' }, style: {}, bindings: [], events: [], constraints: [], children: [] },
        { id: 'n_submit', type: 'Button', props: { label: 'Sign in' }, layout: { kind: 'flow' }, style: {}, bindings: [], events: [], constraints: [], children: [] },
      ],
    },
  },
  violations: [],
  vue: {
    filename: 'Home.vue',
    code: '<template>\n  <form class="flex flex-col gap-[12px] p-[24px]">\n    <h1>Sign in</h1>\n    <input type="email" placeholder="Email" />\n    <button type="button">Sign in</button>\n  </form>\n</template>\n',
  },
};

// Same AST shape, button label edited → proves re-render after a chat edit.
const EDITED = {
  ...COLD,
  vue: {
    filename: 'Home.vue',
    code: COLD.vue.code.replace(/Sign in<\/button>/, 'Submit</button>'),
  },
};

async function resolveUserPickerIfPresent(page: Page) {
  const anon = page.getByText('取消（以匿名繼續）');
  if (await anon.isVisible({ timeout: 2000 }).catch(() => false)) {
    await anon.click();
    return;
  }
  const firstUser = page.locator('button').filter({ hasText: /Kevin|晴晴|管理員/ }).first();
  if (await firstUser.isVisible({ timeout: 2000 }).catch(() => false)) {
    await firstUser.click();
  }
}

test.describe('AI UI Compiler — workspace journey (route-mocked)', () => {
  test.beforeEach(async ({ page }) => {
    // Mock the compile pipeline so the journey is deterministic (no live AI).
    await page.route(/\/compile(\/mutate)?$/, async (route) => {
      const isMutate = route.request().url().endsWith('/mutate');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(isMutate ? EDITED : COLD),
      });
    });
  });

  test('describe → preview → inspect codegen → edit → re-render', async ({ page }) => {
    await page.goto(`/project/${PROJECT_ID}`);
    await resolveUserPickerIfPresent(page);

    // The 4-column workspace mounts: stage tabs present, empty preview.
    await expect(page.getByRole('tab', { name: 'AST' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Describe a UI in chat to compile it.')).toBeVisible();

    // 1) Describe a UI → cold-start compile.
    await page.getByLabel('compiler chat input').fill('a login form with an email field and a sign-in button');
    await page.getByRole('button', { name: 'Send' }).click();

    // 2) Preview renders (the sandboxed iframe appears).
    await expect(page.locator('iframe[title="preview"]')).toBeVisible({ timeout: 15000 });

    // 3) Inspect the generated code via the Codegen stage.
    await page.getByRole('tab', { name: 'Codegen' }).click();
    await expect(page.locator('pre').first()).toContainText('<form class="flex flex-col gap-[12px] p-[24px]">');
    await expect(page.locator('pre').first()).toContainText('Sign in</button>');

    // 4) Chat an edit → mutate → re-render with the new label.
    await page.getByLabel('compiler chat input').fill('rename the button to Submit');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.locator('pre').first()).toContainText('Submit</button>', { timeout: 15000 });
    await expect(page.locator('pre').first()).not.toContainText('Sign in</button>');

    // 5) Back to the AST/visual stage — preview still renders.
    await page.getByRole('tab', { name: 'AST' }).click();
    await expect(page.locator('iframe[title="preview"]')).toBeVisible();
  });
});
