import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';

const API = 'http://localhost:3001';

test.describe('E2E: File Upload in Chat', () => {
  let projectId: string;
  let tmpDir: string;

  test.beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-e2e-upload-'));
  });

  test.afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test.beforeEach(async ({ request }) => {
    const res = await request.post(`${API}/api/projects`, {
      data: { name: 'E2E Upload Test' },
    });
    const project = await res.json();
    projectId = project.id;
  });

  test.afterEach(async ({ request }) => {
    if (projectId) {
      await request.delete(`${API}/api/projects/${projectId}`);
    }
  });

  test('file upload area and attach button exist in chat panel', async ({ page }) => {
    await page.goto(`/project/${projectId}`);
    await expect(page.getByTestId('drop-zone')).toBeVisible();
    await expect(page.getByTestId('attach-file-btn')).toBeVisible();
  });

  test('upload a text file and verify file chip appears', async ({ page }) => {
    await page.goto(`/project/${projectId}`);

    // Create a temp text file
    const filePath = path.join(tmpDir, 'upload-test.txt');
    fs.writeFileSync(filePath, 'Sample file content for E2E test.');

    // Use the hidden file input to upload
    const fileInput = page.getByTestId('file-input');
    await fileInput.setInputFiles(filePath);

    // Wait for the file chip to appear (upload completes)
    await expect(page.getByTestId('file-chip')).toBeVisible({ timeout: 15000 });
  });
});
