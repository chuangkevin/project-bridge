import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001';

test.describe('Architecture Mode', () => {
  let projectId: string;

  test.beforeAll(async ({ request }) => {
    const res = await request.post(`${API}/api/projects`, { data: { name: 'Arch UI Test' } });
    projectId = (await res.json()).id;
  });

  test.afterAll(async ({ request }) => {
    await request.delete(`${API}/api/projects/${projectId}`);
  });

  test('Architecture tab is visible in project page', async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    await expect(page.getByRole('tab', { name: 'Architecture' })).toBeVisible();
  });

  test('Clicking Architecture tab shows arch content', async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    await page.getByRole('tab', { name: 'Architecture' }).click();
    await expect(page.getByTestId('arch-wizard')).toBeVisible();
  });

  test('New project defaults to Architecture tab', async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    // New project with no arch_data → should default to architecture mode
    const archTab = page.getByRole('tab', { name: 'Architecture' });
    await expect(archTab).toBeVisible();
    await expect(page.getByTestId('arch-wizard')).toBeVisible();
  });

  test('Wizard Q1: shows page/component choice', async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    await page.getByRole('tab', { name: 'Architecture' }).click();
    await expect(page.getByTestId('wizard-question')).toBeVisible();
    await expect(page.getByTestId('wizard-option-page')).toBeVisible();
    await expect(page.getByTestId('wizard-option-component')).toBeVisible();
  });

  test('Wizard: selecting 頁面 advances to Q2', async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    await page.getByRole('tab', { name: 'Architecture' }).click();
    await page.getByTestId('wizard-option-page').click();
    // Q2: type selection
    await expect(page.getByTestId('wizard-option-website')).toBeVisible();
  });

  test('Wizard: completing flow shows flowchart', async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    await page.getByRole('tab', { name: 'Architecture' }).click();
    // Q1: page
    await page.getByTestId('wizard-option-page').click();
    // Q2: website
    await page.getByTestId('wizard-option-website').click();
    // Q3: 2-3 pages
    await page.getByTestId('wizard-option-2-3').click();
    // Q4a: first page name
    await page.getByTestId('wizard-chip-首頁').click();
    await page.getByTestId('wizard-next').click();
    // Q4b: second page name
    await page.getByTestId('wizard-chip-列表頁').click();
    await page.getByTestId('wizard-next').click();
    // Q_last
    await page.getByTestId('wizard-finish-view').click();
    // Flowchart should be visible
    await expect(page.getByTestId('arch-flowchart')).toBeVisible();
  });

  test('Flowchart: shows nodes after wizard completion', async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    await page.getByRole('tab', { name: 'Architecture' }).click();
    await page.getByTestId('wizard-option-page').click();
    await page.getByTestId('wizard-option-website').click();
    await page.getByTestId('wizard-option-2-3').click();
    await page.getByTestId('wizard-chip-首頁').click();
    await page.getByTestId('wizard-next').click();
    await page.getByTestId('wizard-chip-列表頁').click();
    await page.getByTestId('wizard-next').click();
    await page.getByTestId('wizard-finish-view').click();
    // Two page nodes should be visible
    await expect(page.getByTestId('page-node-首頁')).toBeVisible();
    await expect(page.getByTestId('page-node-列表頁')).toBeVisible();
  });

  test('Context menu: 前往此頁面 switches to Design tab', async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    await page.getByRole('tab', { name: 'Architecture' }).click();

    // Complete wizard
    await page.getByTestId('wizard-option-page').click();
    await page.getByTestId('wizard-option-website').click();
    await page.getByTestId('wizard-option-2-3').click();
    await page.getByTestId('wizard-chip-首頁').click();
    await page.getByTestId('wizard-next').click();
    await page.getByTestId('wizard-chip-列表頁').click();
    await page.getByTestId('wizard-next').click();
    await page.getByTestId('wizard-finish-view').click();

    // Right-click on page node and select 前往此頁面
    // ReactFlow nodes intercept pointer events for drag; use dispatchEvent to bypass
    await page.getByTestId('page-node-首頁').dispatchEvent('contextmenu');
    await page.getByText('前往此頁面').dispatchEvent('click');

    // Should now be in Design tab
    await expect(page.getByRole('tab', { name: 'Design' })).toHaveAttribute('aria-selected', 'true');
  });

  test('Flowchart: add new page node via toolbar', async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    await page.getByRole('tab', { name: 'Architecture' }).click();
    // Complete wizard first
    await page.getByTestId('wizard-option-page').click();
    await page.getByTestId('wizard-option-website').click();
    await page.getByTestId('wizard-option-2-3').click();
    await page.getByTestId('wizard-chip-首頁').click();
    await page.getByTestId('wizard-next').click();
    await page.getByTestId('wizard-chip-列表頁').click();
    await page.getByTestId('wizard-next').click();
    await page.getByTestId('wizard-finish-view').click();
    // Add page
    await page.getByTestId('add-page-btn').click();
    await expect(page.getByText('新頁面')).toBeVisible();
  });
});
