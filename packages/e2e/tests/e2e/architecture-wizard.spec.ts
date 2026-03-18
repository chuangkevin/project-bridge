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
});
