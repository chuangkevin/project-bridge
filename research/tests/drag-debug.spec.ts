import { test, expect } from '@playwright/test';

const PROJECT_URL = '/projects/06176856-5996-4343-ba5d-57b549b3a383';

test('DRAG DEBUG: 設計模式 chat panel 拖拉後放開不再移動', async ({ page }) => {
  await page.goto(PROJECT_URL);
  await page.locator('.mode-tabs button').filter({ hasText: '設計' }).click();
  await page.waitForTimeout(500);

  // Find drag handle between chat panel and preview
  const handle = page.locator('.design__body > div[style*="col-resize"]');
  await expect(handle).toBeVisible({ timeout: 5000 });

  // Get initial position of the handle
  const before = await handle.boundingBox();
  console.log('Handle before:', before);

  // Simulate drag: mousedown → move right 100px → mouseup
  if (before) {
    const cx = before.x + before.width / 2;
    const cy = before.y + before.height / 2;

    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 100, cy, { steps: 5 });

    // Width should have changed
    const duringBox = await handle.boundingBox();
    console.log('Handle during drag:', duringBox);

    await page.mouse.up();
    await page.waitForTimeout(200);

    const afterRelease = await handle.boundingBox();
    console.log('Handle after mouseup:', afterRelease);

    // Now move mouse WITHOUT clicking — should NOT move the handle
    await page.mouse.move(cx + 200, cy, { steps: 5 });
    await page.waitForTimeout(200);

    const afterNoClick = await handle.boundingBox();
    console.log('Handle after mouse move (no click):', afterNoClick);

    // Handle should NOT have moved after mouseup
    const movedAfterRelease = Math.abs((afterNoClick?.x ?? 0) - (afterRelease?.x ?? 0)) > 2;
    console.log('Still moving after mouseup?', movedAfterRelease);
    expect(movedAfterRelease).toBe(false);
  }
});
