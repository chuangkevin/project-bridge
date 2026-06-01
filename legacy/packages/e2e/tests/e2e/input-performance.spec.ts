import { test, expect } from '@playwright/test';

/**
 * E2E test: Textarea input performance on project with long conversation history.
 * Directly navigates to a project page to avoid login/creation issues.
 */

test.describe('Input Performance', () => {

  test('textarea typing is responsive on project with history', async ({ page }) => {
    // Get a project ID from API
    const apiRes = await page.request.get('http://localhost:3003/api/projects');
    const projects = await apiRes.json();
    if (!projects.length) {
      test.skip(true, 'No projects');
      return;
    }
    const projectId = projects[0].id;
    console.log('Testing project:', projectId, projects[0].name);

    // Navigate directly to project
    await page.goto(`http://localhost:5191/project/${projectId}`);
    await page.waitForTimeout(3000); // wait for full load + conversations

    // Find textarea
    const textarea = page.locator('textarea').last();
    await expect(textarea).toBeVisible({ timeout: 10000 });

    // Measure typing performance
    await textarea.click();
    await textarea.fill('');

    const startTime = Date.now();
    await textarea.type('hello world test 12345', { delay: 30 });
    const endTime = Date.now();

    const totalTime = endTime - startTime;
    const charCount = 22;
    const perCharMs = Math.round(totalTime / charCount);

    console.log(`=== TYPING PERFORMANCE ===`);
    console.log(`Total: ${totalTime}ms for ${charCount} chars`);
    console.log(`Per char: ${perCharMs}ms (target: <100ms)`);
    console.log(`==========================`);

    // Verify text appeared
    const value = await textarea.inputValue();
    expect(value).toContain('hello world');

    // Per-char should be under 150ms (30ms delay + 120ms max processing)
    expect(perCharMs).toBeLessThan(150);
  });
});
