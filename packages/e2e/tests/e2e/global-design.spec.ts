import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001';

test.describe('E2E: Global Design Page', () => {
  test('navigate to /global-design from home page via button', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('global-design-btn')).toBeVisible();
    await page.getByTestId('global-design-btn').click();
    await expect(page).toHaveURL('/global-design');
    await expect(page.getByTestId('global-design-description')).toBeVisible();
  });

  test('fill description and save, then verify saved on reload', async ({ page }) => {
    await page.goto('/global-design');

    const desc = `全域設計測試 ${Date.now()}`;
    await page.getByTestId('global-design-description').fill(desc);
    await page.getByTestId('global-save-design-btn').click();

    await expect(page.getByText('全域設計已儲存')).toBeVisible({ timeout: 5000 });

    // Reload and verify description persists
    await page.reload();
    await expect(page.getByTestId('global-design-description')).toHaveValue(desc, { timeout: 5000 });
  });

  test('set primary color and save, verify via API', async ({ request, page }) => {
    await page.goto('/global-design');

    // Set primary color via text input (the hex input next to the color picker)
    const hexInputs = page.locator('input[type="text"][maxlength="7"]');
    await hexInputs.first().fill('#ab12cd');
    await hexInputs.first().dispatchEvent('input');

    await page.getByTestId('global-save-design-btn').click();
    await expect(page.getByText('全域設計已儲存')).toBeVisible({ timeout: 5000 });

    const res = await request.get(`${API}/api/global-design`);
    const body = await res.json();
    expect(body.profile.tokens.primaryColor).toBe('#ab12cd');
  });

  test('back button navigates to home', async ({ page }) => {
    await page.goto('/global-design');
    // Click the back button (SVG arrow)
    await page.locator('button').first().click();
    await expect(page).toHaveURL('/');
  });
});

test.describe('E2E: DesignPanel — inheritance UI', () => {
  let projectId: string;

  test.beforeEach(async ({ request }) => {
    const res = await request.post(`${API}/api/projects`, {
      data: { name: `Inherit UI Test ${Date.now()}` },
    });
    const project = await res.json();
    projectId = project.id;

    // Ensure global design has content so the toggle appears
    await request.put(`${API}/api/global-design`, {
      data: {
        description: '測試用全域風格描述',
        tokens: { primaryColor: '#7c3aed' },
      },
    });
  });

  test.afterEach(async ({ request }) => {
    if (projectId) {
      await request.delete(`${API}/api/projects/${projectId}`);
    }
  });

  test('DesignPanel shows inheritance toggle when global design exists', async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    await page.getByRole('tab', { name: '設計' }).click();
    await page.getByTestId('tab-design').click();

    // The toggle label text should be visible (the checkbox itself is display:none)
    await expect(page.getByText('繼承全域設計')).toBeVisible({ timeout: 5000 });
    // Toggle should be checked by default
    const toggle = page.getByLabel('繼承全域設計');
    await expect(toggle).toBeChecked();
  });

  test('supplement textarea visible when inheritGlobal is true', async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    await page.getByRole('tab', { name: '設計' }).click();
    await page.getByTestId('tab-design').click();

    // Toggle label text should be visible (the checkbox itself is display:none)
    await expect(page.getByText('繼承全域設計')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('supplement-textarea')).toBeVisible();
  });

  test('toggle off hides supplement textarea', async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    await page.getByRole('tab', { name: '設計' }).click();
    await page.getByTestId('tab-design').click();

    // Verify toggle label is visible and checkbox is on
    await expect(page.getByText('繼承全域設計')).toBeVisible({ timeout: 5000 });
    const toggle = page.getByLabel('繼承全域設計');
    await expect(toggle).toBeChecked();

    // Click the visual toggle label to turn it off
    await toggle.click({ force: true });
    await expect(toggle).not.toBeChecked();

    // Supplement textarea should be hidden
    await expect(page.getByTestId('supplement-textarea')).not.toBeVisible();
  });

  test('save supplement content and verify it persists', async ({ page, request }) => {
    await page.goto(`/project/${projectId}`);
    await page.getByRole('tab', { name: '設計' }).click();
    await page.getByTestId('tab-design').click();

    await expect(page.getByText('繼承全域設計')).toBeVisible({ timeout: 5000 });

    const supplementText = '此專案按鈕使用橘色 #f97316';
    await page.getByTestId('supplement-textarea').fill(supplementText);
    await page.getByTestId('save-design-btn').click();

    await expect(page.getByText('已儲存，下次生成將套用此設計')).toBeVisible({ timeout: 5000 });

    // Verify via API
    const res = await request.get(`${API}/api/projects/${projectId}/design`);
    const body = await res.json();
    expect(body.profile.supplement).toBe(supplementText);
    expect(body.profile.inheritGlobal).toBe(true);
  });

  test('inheritGlobal false saved and reflected on reload', async ({ page, request }) => {
    await page.goto(`/project/${projectId}`);
    await page.getByRole('tab', { name: '設計' }).click();
    await page.getByTestId('tab-design').click();

    await expect(page.getByText('繼承全域設計')).toBeVisible({ timeout: 5000 });
    const toggle = page.getByLabel('繼承全域設計');

    // Turn off inheritance
    await toggle.click({ force: true });
    await expect(toggle).not.toBeChecked();

    await page.getByTestId('save-design-btn').click();
    await expect(page.getByText('已儲存，下次生成將套用此設計')).toBeVisible({ timeout: 5000 });

    // Verify via API
    const res = await request.get(`${API}/api/projects/${projectId}/design`);
    const body = await res.json();
    expect(body.profile.inheritGlobal).toBe(false);
  });
});
