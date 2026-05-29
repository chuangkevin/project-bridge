// Manual smoke test for Plan 10-pre. NOT a CI test — hits the real Gemini API.
//
// Usage (from repo root):
//   pnpm --filter server exec ts-node-dev --transpile-only scripts/vision-smoke.ts
//
// Requires GEMINI_API_KEY env var OR a key in the settings DB.
//
// Expected behavior: prints a non-empty, ~1-2 line description of what the
// model sees in the fixture image. If it errors, Plan 10-pre is not done.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { generateVision } from '../src/services/visionProvider';

async function main(): Promise<void> {
  const imgPath = path.join(__dirname, 'fixtures', 'vision-smoke.png');
  if (!fs.existsSync(imgPath)) {
    console.error(`fixture missing: ${imgPath}`);
    process.exit(1);
  }
  const base64 = fs.readFileSync(imgPath).toString('base64');

  console.log('--- Plan 10-pre vision smoke ---');
  console.log(`fixture: ${imgPath} (${base64.length} base64 chars)`);

  try {
    const t0 = Date.now();
    const text = await generateVision({
      prompt: 'Describe in one sentence what text and colors are in this image.',
      images: [{ mimeType: 'image/png', base64 }],
    });
    const dt = Date.now() - t0;

    if (!text || text.trim().length === 0) {
      console.error(`FAIL: empty response in ${dt}ms`);
      process.exit(2);
    }
    console.log(`OK (${dt}ms):`);
    console.log(text.trim());
  } catch (err: unknown) {
    const e = err instanceof Error ? err : new Error(String(err));
    console.error(`FAIL: ${e.name}: ${e.message}`);
    process.exit(3);
  }
}

main();
