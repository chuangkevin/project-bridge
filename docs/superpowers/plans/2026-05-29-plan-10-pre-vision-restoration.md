# Plan 10-pre — Vision Restoration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the ability to send image inputs to an AI from the server, by introducing a small **vision side-path** (`generateVision`) that bypasses the broken `MultiProviderClient` image path and calls Gemini multimodal directly. Gate is a single smoke test against a fixture image.

**Architecture:** Option B from spec §5 — `services/visionProvider.ts` is a thin module that loads a Gemini key via the existing `geminiKeys.getKeyList()` helper, calls `@google/generative-ai`'s multimodal API directly (same precedent as `routes/settings.ts`'s direct-SDK key-validation use), and returns plain text. Per-call retry on 429 / 5xx with two attempts and short backoff. Used only by future Plan 10 code paths; never by the existing `getProvider()` callers.

**Tech Stack:** TS 5.6 strict, Vitest 3.2.4, `@google/generative-ai` (already a dep), `better-sqlite3` (via existing `geminiKeys`), no new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-29-plan-10-design-intelligence-design.md` §5.

**Scope boundary (out of plan):** No production wiring (no route consumes `generateVision` yet — Plan 10 proper does). No vision *streaming* (`streamVision`). No fallback to OpenAI vision (Gemini-only for now; the rest of the system already tolerates AI calls being best-effort). No key-pool integration beyond "first valid key" — full pool rotation lives in `ai-core` and we are intentionally side-channeling. No client changes.

**Memory note (background, do not act on directly):** `project_multimodal_limitation.md` records that "Both Codex and OpenCode adapters throw on images; all vision via `getProvider()` is broken; document analysis agent fixed to text-only (d45fdf8)". This plan adds a parallel path; **it does not fix `getProvider()`** and does not change any existing call site.

---

## File Structure

```
packages/server/
  src/services/
    visionProvider.ts                  ← NEW (≈80 LoC) — generateVision() + types
    __tests__/
      visionProvider.test.ts           ← NEW — unit tests (SDK mocked)
  scripts/                             ← NEW DIRECTORY
    vision-smoke.ts                    ← NEW — manual smoke runner
    fixtures/
      vision-smoke.png                 ← NEW — tiny test PNG (≤10 KB)
```

No changes to existing files in this plan. Anything that *uses* `generateVision` is Plan 10's problem.

---

## Phase 1 — Module skeleton + happy path

### Task 1: `visionProvider.ts` — interface + happy path

**Files:**
- Create: `packages/server/src/services/visionProvider.ts`
- Create: `packages/server/src/services/__tests__/visionProvider.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/server/src/services/__tests__/visionProvider.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@google/generative-ai', () => {
  const generateContent = vi.fn();
  const getGenerativeModel = vi.fn(() => ({ generateContent }));
  return {
    GoogleGenerativeAI: vi.fn(() => ({ getGenerativeModel })),
    __mock: { generateContent, getGenerativeModel },
  };
});

vi.mock('../geminiKeys', () => ({
  getKeyList: vi.fn(() => ['AIzaTESTKEY_PLACEHOLDER_0000000000000']),
  getGeminiModel: vi.fn(() => 'gemini-2.5-flash'),
}));

import { generateVision } from '../visionProvider';
import * as sdk from '@google/generative-ai';

const sdkMock = (sdk as unknown as { __mock: { generateContent: ReturnType<typeof vi.fn>; getGenerativeModel: ReturnType<typeof vi.fn> } }).__mock;

describe('generateVision — happy path', () => {
  beforeEach(() => { sdkMock.generateContent.mockReset(); sdkMock.getGenerativeModel.mockClear(); });

  it('returns the model text for prompt + 1 image', async () => {
    sdkMock.generateContent.mockResolvedValueOnce({ response: { text: () => 'detected: stripe.com pricing page' } });

    const result = await generateVision({
      prompt: 'identify this page',
      images: [{ mimeType: 'image/png', base64: 'iVBORw0KGgo=' }],
    });

    expect(result).toBe('detected: stripe.com pricing page');
    expect(sdkMock.generateContent).toHaveBeenCalledTimes(1);
    // SDK is given parts in [prompt, image] order
    const call = sdkMock.generateContent.mock.calls[0][0];
    expect(call[0]).toEqual({ text: 'identify this page' });
    expect(call[1]).toEqual({ inlineData: { mimeType: 'image/png', data: 'iVBORw0KGgo=' } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter server test -- visionProvider`
Expected: FAIL with "Cannot find module '../visionProvider'" or "generateVision is not exported".

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/server/src/services/visionProvider.ts
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getKeyList, getGeminiModel } from './geminiKeys';

export interface VisionImage {
  /** MIME type, e.g. 'image/png', 'image/jpeg'. */
  mimeType: string;
  /** Base64-encoded image bytes, NO data: prefix. */
  base64: string;
}

export interface GenerateVisionParams {
  prompt: string;
  images: VisionImage[];
  /** Override the model id (default: getGeminiModel()). */
  modelId?: string;
}

export class VisionUnavailableError extends Error {
  constructor(reason: string) {
    super(`vision_unavailable: ${reason}`);
    this.name = 'VisionUnavailableError';
  }
}

/**
 * Send a prompt + images to Gemini multimodal and return the model text.
 *
 * Side-path that bypasses MultiProviderClient. Only Plan 10 callers should use this;
 * everything else continues through getProvider().
 */
export async function generateVision(params: GenerateVisionParams): Promise<string> {
  const keys = getKeyList();
  if (keys.length === 0) throw new VisionUnavailableError('no_gemini_key_configured');

  const apiKey = keys[0];
  const modelId = params.modelId ?? getGeminiModel();

  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({ model: modelId });

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    { text: params.prompt },
    ...params.images.map(img => ({ inlineData: { mimeType: img.mimeType, data: img.base64 } })),
  ];

  const result = await model.generateContent(parts as never);
  return result.response.text();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter server test -- visionProvider`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/services/visionProvider.ts packages/server/src/services/__tests__/visionProvider.test.ts
git commit -m "feat(vision): add generateVision side-path (Plan 10-pre Phase 1)"
```

---

## Phase 2 — Retry + error contract

### Task 2: Retry on 429 / 5xx

**Files:**
- Modify: `packages/server/src/services/visionProvider.ts`
- Modify: `packages/server/src/services/__tests__/visionProvider.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `visionProvider.test.ts`:

```typescript
describe('generateVision — retry on transient errors', () => {
  beforeEach(() => { sdkMock.generateContent.mockReset(); });

  it('retries once on 429, succeeds on second attempt', async () => {
    const err = Object.assign(new Error('rate limited'), { status: 429 });
    sdkMock.generateContent
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce({ response: { text: () => 'ok' } });

    const result = await generateVision({
      prompt: 'p',
      images: [{ mimeType: 'image/png', base64: 'x' }],
    });

    expect(result).toBe('ok');
    expect(sdkMock.generateContent).toHaveBeenCalledTimes(2);
  });

  it('retries on 503, succeeds on second attempt', async () => {
    const err = Object.assign(new Error('service unavailable'), { status: 503 });
    sdkMock.generateContent
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce({ response: { text: () => 'ok' } });
    const result = await generateVision({ prompt: 'p', images: [{ mimeType: 'image/png', base64: 'x' }] });
    expect(result).toBe('ok');
  });

  it('does NOT retry on 401 (auth) and throws immediately', async () => {
    const err = Object.assign(new Error('invalid api key'), { status: 401 });
    sdkMock.generateContent.mockRejectedValueOnce(err);
    await expect(
      generateVision({ prompt: 'p', images: [{ mimeType: 'image/png', base64: 'x' }] })
    ).rejects.toThrow(/invalid api key/i);
    expect(sdkMock.generateContent).toHaveBeenCalledTimes(1);
  });

  it('throws after exhausting retries on persistent 429', async () => {
    const err = Object.assign(new Error('rate limited'), { status: 429 });
    sdkMock.generateContent.mockRejectedValue(err);
    await expect(
      generateVision({ prompt: 'p', images: [{ mimeType: 'image/png', base64: 'x' }] })
    ).rejects.toThrow(/rate limited/i);
    expect(sdkMock.generateContent).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
  });
});

describe('generateVision — error contract', () => {
  it('throws VisionUnavailableError when no Gemini key is configured', async () => {
    const keysMod = await import('../geminiKeys');
    (keysMod.getKeyList as ReturnType<typeof vi.fn>).mockReturnValueOnce([]);
    await expect(
      generateVision({ prompt: 'p', images: [{ mimeType: 'image/png', base64: 'x' }] })
    ).rejects.toThrow(/vision_unavailable: no_gemini_key_configured/);
  });
});
```

- [ ] **Step 2: Run tests, confirm new ones fail**

Run: `pnpm --filter server test -- visionProvider`
Expected: 4 new tests FAIL (no retry logic yet); 1 passes (no-key error already covered).

- [ ] **Step 3: Add retry logic to `visionProvider.ts`**

Replace the body of `generateVision` with:

```typescript
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const RETRY_BACKOFF_MS = 600;

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function getStatus(err: unknown): number | undefined {
  return typeof err === 'object' && err !== null && 'status' in err
    ? (err as { status?: number }).status
    : undefined;
}

export async function generateVision(params: GenerateVisionParams): Promise<string> {
  const keys = getKeyList();
  if (keys.length === 0) throw new VisionUnavailableError('no_gemini_key_configured');

  const apiKey = keys[0];
  const modelId = params.modelId ?? getGeminiModel();

  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({ model: modelId });

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    { text: params.prompt },
    ...params.images.map(img => ({ inlineData: { mimeType: img.mimeType, data: img.base64 } })),
  ];

  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await model.generateContent(parts as never);
      return result.response.text();
    } catch (err) {
      lastErr = err;
      const status = getStatus(err);
      if (status && RETRYABLE_STATUSES.has(status) && attempt === 0) {
        await delay(RETRY_BACKOFF_MS);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}
```

- [ ] **Step 4: Run tests, confirm all pass**

Run: `pnpm --filter server test -- visionProvider`
Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/services/visionProvider.ts packages/server/src/services/__tests__/visionProvider.test.ts
git commit -m "feat(vision): retry on 429/5xx, typed VisionUnavailableError (Plan 10-pre Phase 2)"
```

---

## Phase 3 — Smoke runner

### Task 3: `scripts/vision-smoke.ts` + fixture image

**Files:**
- Create: `packages/server/scripts/vision-smoke.ts`
- Create: `packages/server/scripts/fixtures/vision-smoke.png` (tiny PNG)

> **Note:** The smoke runner is **not** a vitest test. It hits the real Gemini API and costs real (small) quota; it must be run by hand. CI must not invoke it.

- [ ] **Step 1: Create the fixture PNG**

Use a tiny placeholder PNG (~1 KB). One option — generate it inline:

```bash
node -e "
const { createCanvas } = require('@napi-rs/canvas');
const fs = require('fs');
const c = createCanvas(200, 80);
const ctx = c.getContext('2d');
ctx.fillStyle = '#1A73E8'; ctx.fillRect(0, 0, 200, 80);
ctx.fillStyle = '#fff'; ctx.font = 'bold 22px sans-serif';
ctx.fillText('Plan 10-pre', 20, 50);
fs.mkdirSync('packages/server/scripts/fixtures', { recursive: true });
fs.writeFileSync('packages/server/scripts/fixtures/vision-smoke.png', c.toBuffer('image/png'));
console.log('wrote fixture');
"
```

Verify:
```bash
ls -la packages/server/scripts/fixtures/vision-smoke.png
# Expected: file ~1-3 KB
```

- [ ] **Step 2: Write the smoke runner**

```typescript
// packages/server/scripts/vision-smoke.ts
//
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
```

- [ ] **Step 3: Run the smoke locally** (this is the actual gate — by hand, not CI)

Run from repo root with a real key in env or DB:
```bash
pnpm --filter server exec ts-node-dev --transpile-only scripts/vision-smoke.ts
```

Expected: exit code 0, prints a single sentence that mentions "Plan 10-pre" text or the blue color. Anything non-empty counts as a pass — the model just has to *see* the image, not be deeply accurate.

If exit code is 1: fixture is missing — re-run Step 1.
If exit code is 3: vision call failed — read the error, check key validity / model availability. **Do not proceed to Plan 10 until this returns OK.**

- [ ] **Step 4: Commit**

```bash
git add packages/server/scripts/
git commit -m "feat(vision): manual smoke runner + fixture image (Plan 10-pre Phase 3)"
```

---

## Phase 4 — Verify

- [ ] `pnpm --filter server test -- visionProvider` → 6 tests green.
- [ ] `pnpm --filter server build` → no errors.
- [ ] `pnpm --filter server exec ts-node-dev --transpile-only scripts/vision-smoke.ts` → exit code 0, non-empty response. **Record the response text in the PR description / handover note** so reviewers can confirm vision actually fired.
- [ ] `git diff --stat <plan-10-pre-start>..HEAD -- packages/server packages/client packages/ast packages/codegen` → all changes confined to `packages/server/src/services/visionProvider.ts`, its test, and `packages/server/scripts/**`. Anything outside is a scope leak — fix before merging.
- [ ] No existing call site changed (no `getProvider()` callers modified).

## Acceptance Criteria

- [ ] `generateVision({ prompt, images })` returns the model's text response for prompt + at least one image.
- [ ] 429 / 5xx errors retried once with ~600ms backoff; 401 / 4xx (non-429) errors thrown immediately.
- [ ] `VisionUnavailableError` thrown when no Gemini key is configured.
- [ ] Smoke runner (`scripts/vision-smoke.ts`) exits 0 against the real Gemini API with a real key.
- [ ] No production wiring added — nothing in `routes/` or `services/compile.ts` calls `generateVision` in this plan.
- [ ] Memory note `project_multimodal_limitation.md` left **unchanged** (it documents the broken `getProvider()` path, which this plan does not fix). The Plan 10 implementation plan will update memory once `generateVision` is actually consumed.

## Risks / Notes

1. **Direct SDK precedent:** `routes/settings.ts` already imports `@google/generative-ai` for key validation. This plan adds a second precedent; both must remain narrow — never let direct-SDK usage spread to general AI calls (that's what `getProvider()` is for).
2. **No key-pool rotation here:** intentional. If the first key in `getKeyList()` is rate-limited, the retry will fail and the call throws — Plan 10 callers must tolerate occasional vision failures (the spec already says vision-mode falls back to "please paste a URL"). Adding pool rotation here would duplicate `ai-core`'s `KeyPool` and is out of scope.
3. **Model id:** uses `getGeminiModel()` (returns `gemini_model` setting, default `gemini-2.5-flash`). 2.5-flash supports vision. If the user has set the model to one that *doesn't* support vision, the SDK throws an error at call time — Plan 10's compile route will surface this as a clean `vision_unavailable` to the user.
4. **Vitest mock layout:** the test file uses Vitest's `vi.mock` factory + a `__mock` escape hatch to expose the mock functions for assertions. Keep this pattern consistent if the test file grows.
5. **No streaming:** `streamVision` is intentionally absent. Plan 10's UI uses progress indicators around the whole compile (already exists), not token-by-token vision streaming.

---

**Plan end.**
