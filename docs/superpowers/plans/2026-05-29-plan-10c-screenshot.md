# Plan 10c — Screenshot Input Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow the user to **drag/paste a screenshot into CompilerChat** and have both Mirror and AST modes accept it. Mirror+image asks vision to identify the original site; if identified, it transparently runs as `mirror+URL`; if not, it returns a clean fallback asking the user for a URL. AST+image goes straight through `parseScreenshot` → `buildColdStart` with image-aware prompt → editable `SemanticUIAst` (no crawl, no real-site assets).

**Architecture:** Adds `parseScreenshot` ingestion (vision call via `generateVision` from Plan 10-pre) producing a `ScreenshotIngestion`. A new `visionIdentifySite` helper asks the model: "Is this a screenshot of a real public website? If yes, return its URL only. Else 'unknown'." The compile route's existing mirror/ast branches grow `source.kind === 'image'` handling; for mirror+image, identification kicks in; for ast+image, the same `buildColdStart` path runs but with an image-aware prompt mode (DOM is empty, the screenshot text + OCR-style summary from `parseScreenshot` is the input). Client `CompilerChat` accepts drag-and-drop image attachments.

**Tech Stack:** TS 5.6 strict, Vitest 3.2.4. Uses Plan 10-pre's `generateVision`. Optional: `tesseract.js` already a dep — if available, run a quick OCR pass for redundancy; otherwise rely solely on vision text. No new server deps. Client: native HTML5 drag-and-drop + clipboard paste events.

**Spec:** `docs/superpowers/specs/2026-05-29-plan-10-design-intelligence-design.md` §2.1 (image detection in chat), §2.3 (`mirror + image` and `ast + image` rows), §6 pseudocode (image branches), §7 (vision-unavailable row), §8 (parseScreenshot + ast+image integration test).

**Scope boundary (out of plan):**
- **No multi-image input.** One screenshot per compile.
- **No image cropping / region selection.** User submits the whole image.
- **No vision-driven Theme extraction.** `themeExtractor` in 10b is DOM-based; for ast+image with no DOM, `themeProposal` is empty (Plan 10b's response already permits this; the client just won't show ThemeMergeDialog).
- **No real-site assets in AST+image output.** The AST is rendered with the existing codegen (Tailwind classes only); the screenshot is not embedded.
- **Plan 10-pre MUST be done first.** This plan starts with a gate test: if `generateVision` is unavailable, every call returns `vision_unavailable` and these tests skip/red-flag.

---

## File Structure

```
packages/server/
  src/ingestion/
    parseScreenshot.ts                   ← NEW (≈80 LoC)
    __tests__/
      parseScreenshot.test.ts            ← NEW
  src/services/
    visionIdentifySite.ts                ← NEW (≈60 LoC)
    __tests__/
      visionIdentifySite.test.ts         ← NEW
  src/semantic/
    buildColdStart.ts                    ← MODIFY: add ScreenshotIngestion branch
    __tests__/
      buildColdStart.screenshot.test.ts  ← NEW
  src/routes/
    compile.ts                           ← MODIFY: image branches in mirror/ast
    __tests__/
      compile.route.test.ts              ← MODIFY: image branch tests

packages/client/
  src/components/compiler/
    CompilerChat.tsx                     ← MODIFY: accept image attachments
    MirrorIntentCard.tsx                 ← MODIFY: image thumbnail rendering
    __tests__/
      CompilerChat.image.test.tsx        ← NEW
```

---

## Phase 1 — Server: vision identify + parseScreenshot

### Task 1: `visionIdentifySite` — does this screenshot match a known public website?

**Files:**
- Create: `packages/server/src/services/visionIdentifySite.ts`
- Create: `packages/server/src/services/__tests__/visionIdentifySite.test.ts`

- [ ] **Step 1: Failing test**

```typescript
// packages/server/src/services/__tests__/visionIdentifySite.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('../visionProvider', () => ({
  generateVision: vi.fn(),
  VisionUnavailableError: class extends Error {},
}));

import { identifySite } from '../visionIdentifySite';
import { generateVision, VisionUnavailableError } from '../visionProvider';

describe('identifySite', () => {
  it('returns a URL when the model responds with one', async () => {
    (generateVision as ReturnType<typeof vi.fn>).mockResolvedValueOnce('https://stripe.com/pricing');
    const r = await identifySite({ mimeType: 'image/png', base64: 'x' });
    expect(r).toEqual({ ok: true, url: 'https://stripe.com/pricing' });
  });

  it('returns ok:false when model says "unknown"', async () => {
    (generateVision as ReturnType<typeof vi.fn>).mockResolvedValueOnce('unknown');
    const r = await identifySite({ mimeType: 'image/png', base64: 'x' });
    expect(r).toEqual({ ok: false, reason: 'unknown_site' });
  });

  it('returns vision_unavailable when generateVision throws VisionUnavailableError', async () => {
    (generateVision as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new VisionUnavailableError('no_gemini_key'));
    const r = await identifySite({ mimeType: 'image/png', base64: 'x' });
    expect(r).toEqual({ ok: false, reason: 'vision_unavailable' });
  });

  it('strips quotes / whitespace / markdown around the URL', async () => {
    (generateVision as ReturnType<typeof vi.fn>).mockResolvedValueOnce('  "https://example.com"  \n');
    const r = await identifySite({ mimeType: 'image/png', base64: 'x' });
    expect(r).toEqual({ ok: true, url: 'https://example.com' });
  });

  it('rejects non-URL responses as unknown', async () => {
    (generateVision as ReturnType<typeof vi.fn>).mockResolvedValueOnce('this looks like a SaaS pricing page');
    const r = await identifySite({ mimeType: 'image/png', base64: 'x' });
    expect(r).toEqual({ ok: false, reason: 'unknown_site' });
  });
});
```

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3: Implement**

```typescript
// packages/server/src/services/visionIdentifySite.ts
import { generateVision, VisionUnavailableError } from './visionProvider';

const PROMPT = `Is this a screenshot of a real publicly-accessible website (a brand/product page, SaaS, documentation, etc.)?

If yes, respond with ONLY the canonical URL of the page (e.g. "https://stripe.com/pricing"). One URL on one line. No prose, no quotes.
If you are not confident or it's not a real public site, respond with exactly: unknown`;

const URL_RE = /https?:\/\/[^\s"<>'`]+/;

export type IdentifySiteResult =
  | { ok: true; url: string }
  | { ok: false; reason: 'unknown_site' | 'vision_unavailable' };

export async function identifySite(image: { mimeType: string; base64: string }): Promise<IdentifySiteResult> {
  try {
    const raw = (await generateVision({ prompt: PROMPT, images: [image] })).trim();
    if (/^unknown$/i.test(raw)) return { ok: false, reason: 'unknown_site' };
    const m = raw.match(URL_RE);
    if (!m) return { ok: false, reason: 'unknown_site' };
    return { ok: true, url: m[0].replace(/[",\.\)]+$/, '') };
  } catch (err) {
    if (err instanceof VisionUnavailableError) return { ok: false, reason: 'vision_unavailable' };
    return { ok: false, reason: 'vision_unavailable' };
  }
}
```

- [ ] **Step 4:** Re-run → PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/services/visionIdentifySite.ts packages/server/src/services/__tests__/visionIdentifySite.test.ts
git commit -m "feat(vision): identifySite — screenshot → known public URL or unknown (Plan 10c Phase 1)"
```

---

### Task 2: `parseScreenshot` — image → ScreenshotIngestion (vision summary)

**Files:**
- Create: `packages/server/src/ingestion/parseScreenshot.ts`
- Create: `packages/server/src/ingestion/__tests__/parseScreenshot.test.ts`

`ScreenshotIngestion` is already declared in `packages/ast/src/ingestion/ingestionAst.ts` with `ocrText: string` + `regions: ScreenshotRegion[]`. For Plan 10c the regions are populated by a vision call that returns a list of structural blocks (header / hero / section / footer with coarse bboxes).

- [ ] **Step 1: Failing test**

```typescript
// packages/server/src/ingestion/__tests__/parseScreenshot.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../services/visionProvider', () => ({
  generateVision: vi.fn(),
  VisionUnavailableError: class extends Error {},
}));

import { parseScreenshot } from '../parseScreenshot';
import { generateVision } from '../../services/visionProvider';

describe('parseScreenshot', () => {
  it('returns ScreenshotIngestion with ocrText + regions from a vision JSON', async () => {
    (generateVision as ReturnType<typeof vi.fn>).mockResolvedValueOnce(JSON.stringify({
      ocrText: 'Welcome to FooApp\nPricing\nGet started',
      regions: [
        { x: 0, y: 0, width: 1200, height: 80, text: 'Header' },
        { x: 0, y: 100, width: 1200, height: 500, text: 'Hero' },
      ],
    }));
    const r = await parseScreenshot({ mimeType: 'image/png', base64: 'x' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ingestion.type).toBe('screenshot');
    expect(r.ingestion.ocrText).toContain('FooApp');
    expect(r.ingestion.regions.length).toBe(2);
  });

  it('returns ok:false when vision returns malformed JSON', async () => {
    (generateVision as ReturnType<typeof vi.fn>).mockResolvedValueOnce('definitely not json');
    const r = await parseScreenshot({ mimeType: 'image/png', base64: 'x' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('parse_failed');
  });

  it('returns vision_unavailable when generateVision throws', async () => {
    const { VisionUnavailableError } = await import('../../services/visionProvider');
    (generateVision as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new (VisionUnavailableError as unknown as ErrorConstructor)('no_key'));
    const r = await parseScreenshot({ mimeType: 'image/png', base64: 'x' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('vision_unavailable');
  });
});
```

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3: Implement**

```typescript
// packages/server/src/ingestion/parseScreenshot.ts
import { generateVision, VisionUnavailableError } from '../services/visionProvider';
import type { ScreenshotIngestion } from '@designbridge/ast';

const PROMPT = `Look at this UI screenshot and return ONE JSON object with the following shape (no prose, no markdown fence):

{
  "ocrText": "string — all visible text concatenated, line-broken naturally",
  "regions": [
    { "x": int, "y": int, "width": int, "height": int, "text": "string — short label for what this region is, e.g. Header, Hero, PricingCard, Footer" }
  ]
}

Pixel coordinates are approximate. Prefer 3-8 high-level regions, not every tiny element.`;

export type ParseScreenshotReason = 'vision_unavailable' | 'parse_failed';
export type ParseScreenshotResult =
  | { ok: true; ingestion: ScreenshotIngestion }
  | { ok: false; reason: ParseScreenshotReason; detail?: string };

function stripFences(s: string): string {
  return s.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
}

export async function parseScreenshot(image: { mimeType: string; base64: string }): Promise<ParseScreenshotResult> {
  let raw: string;
  try {
    raw = await generateVision({ prompt: PROMPT, images: [image] });
  } catch (err) {
    if (err instanceof VisionUnavailableError) return { ok: false, reason: 'vision_unavailable', detail: err.message };
    return { ok: false, reason: 'vision_unavailable', detail: (err as Error).message };
  }
  let parsed: { ocrText?: string; regions?: Array<{ x: number; y: number; width: number; height: number; text?: string }> };
  try { parsed = JSON.parse(stripFences(raw)); }
  catch (err) { return { ok: false, reason: 'parse_failed', detail: (err as Error).message }; }

  if (typeof parsed.ocrText !== 'string' || !Array.isArray(parsed.regions)) {
    return { ok: false, reason: 'parse_failed', detail: 'missing ocrText or regions' };
  }
  return {
    ok: true,
    ingestion: {
      type: 'screenshot',
      ocrText: parsed.ocrText,
      regions: parsed.regions.map(r => ({ x: r.x|0, y: r.y|0, width: r.width|0, height: r.height|0, text: r.text })),
    },
  };
}
```

- [ ] **Step 4:** Re-run → PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/ingestion/parseScreenshot.ts packages/server/src/ingestion/__tests__/parseScreenshot.test.ts
git commit -m "feat(ingestion): parseScreenshot — vision-based OCR + regions (Plan 10c Phase 1)"
```

---

## Phase 2 — Semantic builder accepts ScreenshotIngestion

### Task 3: Extend `buildColdStart` for `ScreenshotIngestion`

**Files:**
- Modify: `packages/server/src/semantic/buildColdStart.ts`
- Create: `packages/server/src/semantic/__tests__/buildColdStart.screenshot.test.ts`

- [ ] **Step 1: Failing test**

```typescript
// packages/server/src/semantic/__tests__/buildColdStart.screenshot.test.ts
import { describe, it, expect, vi } from 'vitest';
import { buildColdStart } from '../buildColdStart';
import type { ScreenshotIngestion } from '@designbridge/ast';

describe('buildColdStart — screenshot source', () => {
  it('produces a SemanticUIAst from a ScreenshotIngestion using screenshot prompt path', async () => {
    const fakeGenerate = vi.fn(async (params) => {
      expect(params.prompt).toMatch(/regions/i);
      expect(params.prompt).toMatch(/Header/);
      return JSON.stringify({
        schemaVersion: 1, artifactId: 'ar_s1', kind: 'page',
        root: { id: 'n_root', type: 'Container', props: {}, layout: { kind: 'stack', direction: 'vertical' }, style: {}, bindings: [], events: [], constraints: [], children: [] },
      });
    });
    const ing: ScreenshotIngestion = {
      type: 'screenshot', ocrText: 'FooApp\nPricing\nGet started',
      regions: [{ x: 0, y: 0, width: 1200, height: 80, text: 'Header' }, { x: 0, y: 100, width: 1200, height: 500, text: 'Hero' }],
    };
    const ast = await buildColdStart(ing, { artifactId: 'ar_s1', generate: fakeGenerate });
    expect(ast.root.type).toBe('Container');
  });
});
```

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3: Extend `buildColdStart.ts`**

Add a `screenshot` branch alongside `requirement` / `webpage`:

```typescript
const SCREENSHOT_PROMPT = (ing: ScreenshotIngestion) => `You are translating a UI screenshot into a SemanticUIAst.
You will NOT see the image directly. Instead, you have a structured description:

OCR text (all visible text):
${ing.ocrText.slice(0, 4000)}

Regions (high-level blocks the vision pass identified):
${ing.regions.map(r => `- ${r.text ?? '(unlabeled)'} at (${r.x},${r.y}) ${r.width}x${r.height}`).join('\n')}

Constraints: ${describeComponentCatalog()}

Produce ONLY a JSON SemanticUIAst that mirrors the structure (Header → Hero → ... order). No prose.`;

// in buildColdStart() ingestion-type switch:
ingestion.type === 'screenshot' ? SCREENSHOT_PROMPT(ingestion) : ...
```

- [ ] **Step 4:** Re-run → PASS. Webpage + requirement tests still green.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/semantic/buildColdStart.ts packages/server/src/semantic/__tests__/buildColdStart.screenshot.test.ts
git commit -m "feat(semantic): buildColdStart accepts ScreenshotIngestion (Plan 10c Phase 2)"
```

---

## Phase 3 — Route branches for image source

### Task 4: `compile.ts` — image branches

**Files:**
- Modify: `packages/server/src/routes/compile.ts`
- Modify: `packages/server/src/routes/__tests__/compile.route.test.ts`

- [ ] **Step 1: Failing tests**

```typescript
describe('POST /:id/compile — mirror+image', () => {
  it('identified site → runs as mirror+URL transparently', async () => {
    // mock identifySite -> { ok: true, url: 'https://e.com' }
    // mock buildMirror -> success
    const res = await request(app)
      .post('/api/projects/p1/compile')
      .send({ mode: 'mirror', source: { kind: 'image', mimeType: 'image/png', base64: 'x' } });
    expect(res.body).toMatchObject({ ok: true, artifact: { kind: 'mirror', sourceUrl: 'https://e.com' } });
  });

  it('unknown site → ok:false unidentified_screenshot', async () => {
    // mock identifySite -> { ok: false, reason: 'unknown_site' }
    const res = await request(app)
      .post('/api/projects/p1/compile')
      .send({ mode: 'mirror', source: { kind: 'image', mimeType: 'image/png', base64: 'x' } });
    expect(res.body).toMatchObject({ ok: false, reason: 'unidentified_screenshot' });
  });

  it('vision unavailable → ok:false vision_unavailable', async () => {
    // mock identifySite -> vision_unavailable
    const res = await request(app)
      .post('/api/projects/p1/compile')
      .send({ mode: 'mirror', source: { kind: 'image', mimeType: 'image/png', base64: 'x' } });
    expect(res.body).toMatchObject({ ok: false, reason: 'vision_unavailable' });
  });
});

describe('POST /:id/compile — ast+image', () => {
  it('vision OK → parseScreenshot → buildColdStart → returns ast (no themeProposal)', async () => {
    // mock parseScreenshot success + buildColdStart
    const res = await request(app)
      .post('/api/projects/p1/compile')
      .send({ mode: 'ast', source: { kind: 'image', mimeType: 'image/png', base64: 'x' }, artifactId: 'ar_a' });
    expect(res.body.ok).toBe(true);
    expect(res.body.ast).toBeDefined();
    expect(res.body.themeProposal).toBeUndefined();
  });

  it('parseScreenshot vision_unavailable → ok:false', async () => {
    // mock parseScreenshot returning vision_unavailable
    const res = await request(app)
      .post('/api/projects/p1/compile')
      .send({ mode: 'ast', source: { kind: 'image', mimeType: 'image/png', base64: 'x' } });
    expect(res.body).toMatchObject({ ok: false, reason: 'vision_unavailable' });
  });
});
```

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3: Modify `compile.ts`**

Replace the existing 10a `if (source?.kind === 'image') return image_source_not_supported` line with real branches:

```typescript
import { identifySite } from '../services/visionIdentifySite';
import { parseScreenshot } from '../ingestion/parseScreenshot';

if (mode === 'mirror' && req.body?.source?.kind === 'image') {
  const idr = await identifySite({ mimeType: req.body.source.mimeType, base64: req.body.source.base64 });
  if (!idr.ok) {
    res.json({ ok: false, reason: idr.reason === 'vision_unavailable' ? 'vision_unavailable' : 'unidentified_screenshot' });
    return;
  }
  // Fall through to the mirror+url path with the identified URL.
  const result = await buildMirror({ projectId: req.params.id as string, artifactId, url: idr.url });
  if (!result.ok) { res.json({ ok: false, reason: result.reason, detail: result.detail }); return; }
  res.json({ ok: true, artifact: result.meta });
  return;
}

if (mode === 'ast' && req.body?.source?.kind === 'image') {
  const ps = await parseScreenshot({ mimeType: req.body.source.mimeType, base64: req.body.source.base64 });
  if (!ps.ok) { res.json({ ok: false, reason: ps.reason, detail: ps.detail }); return; }
  try {
    const ast = await buildColdStart(ps.ingestion, { artifactId });
    res.json({ ok: true, ast }); // no themeProposal — no DOM/CSS to extract from
  } catch (err) {
    res.json({ ok: false, reason: 'ast_repair_exhausted', detail: (err as Error).message });
  }
  return;
}
```

- [ ] **Step 4:** Run → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/routes/compile.ts packages/server/src/routes/__tests__/compile.route.test.ts
git commit -m "feat(routes): compile.ts image branches — mirror identify + ast parseScreenshot (Plan 10c Phase 3)"
```

---

## Phase 4 — Client: chat accepts images

### Task 5: `CompilerChat` accepts drag/paste image attachments

**Files:**
- Modify: `packages/client/src/components/compiler/CompilerChat.tsx`
- Modify: `packages/client/src/components/compiler/MirrorIntentCard.tsx` (image thumbnail)
- Create: `packages/client/src/components/compiler/__tests__/CompilerChat.image.test.tsx`

- [ ] **Step 1: Failing test**

```typescript
describe('CompilerChat — image attachment', () => {
  it('accepts a dropped PNG and shows MirrorIntentCard with thumbnail on Send', async () => {
    render(<CompilerChat />);
    const dropZone = screen.getByTestId('chat-drop-zone');
    const file = new File([new Uint8Array([137,80,78,71])], 'shot.png', { type: 'image/png' });
    fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });
    fireEvent.click(screen.getByText(/Send/i));
    expect(await screen.findByText(/Reproduce as/i)).toBeTruthy();
    expect(screen.getByAltText(/screenshot|preview/i)).toBeTruthy();
  });

  it('accepts a pasted clipboard image', async () => {
    render(<CompilerChat />);
    const input = screen.getByTestId('chat-input');
    const blob = new Blob([new Uint8Array([137,80,78,71])], { type: 'image/png' });
    const clipboardData = { items: [{ type: 'image/png', getAsFile: () => blob }] };
    fireEvent.paste(input, { clipboardData });
    fireEvent.click(screen.getByText(/Send/i));
    expect(await screen.findByText(/Reproduce as/i)).toBeTruthy();
  });

  it('confirm Mirror with image calls api.compile with mode=mirror + source.image', async () => {
    const compileSpy = vi.spyOn(api, 'compile').mockResolvedValue({ ok: true, artifact: { kind: 'mirror', id: 'ar_m', sourceUrl: 'https://detected.com' } } as any);
    render(<CompilerChat />);
    // ... drop image, send, confirm Mirror
    expect(compileSpy).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ mode: 'mirror', source: expect.objectContaining({ kind: 'image' }) }));
  });
});
```

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3: Modify `CompilerChat.tsx`**

Add a single attachment slot (one image at a time). Render a small thumbnail next to the textarea once attached. On Send, build a `source: { kind: 'image', mimeType, base64 }`.

```tsx
const [attachment, setAttachment] = useState<{ mimeType: string; base64: string; previewUrl: string } | null>(null);

function readFileAsBase64(file: File): Promise<{ mimeType: string; base64: string; previewUrl: string }> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const result = r.result as string;
      const [meta, b64] = result.split(',', 2);
      const mime = meta.match(/^data:([^;]+)/)?.[1] ?? file.type ?? 'image/png';
      resolve({ mimeType: mime, base64: b64, previewUrl: result });
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

async function handleFiles(files: FileList | File[]): Promise<void> {
  for (const f of Array.from(files)) {
    if (f.type.startsWith('image/')) { setAttachment(await readFileAsBase64(f)); break; }
  }
}

function onDrop(e: React.DragEvent): void { e.preventDefault(); void handleFiles(e.dataTransfer.files); }
function onPaste(e: React.ClipboardEvent): void {
  const items = e.clipboardData?.items ?? [];
  const files: File[] = [];
  for (const it of items as unknown as DataTransferItem[]) {
    if (it.type?.startsWith('image/')) { const f = it.getAsFile?.(); if (f) files.push(f); }
  }
  if (files.length) { e.preventDefault(); void handleFiles(files); }
}

function onSend(): void {
  if (attachment) {
    setPending({ source: { kind: 'image', mimeType: attachment.mimeType, base64: attachment.base64 }, suggestedMode: suggested(text) });
    return;
  }
  // existing URL / pure-text logic...
}
```

- [ ] **Step 4: Update `MirrorIntentCard`** to render the image thumbnail when `source.kind === 'image'`:

```tsx
{source.kind === 'image'
  ? <img src={`data:${source.mimeType};base64,${source.base64.slice(0, 200)}…`} alt="screenshot preview" style={{ maxWidth: 160, borderRadius: 4 }} />
  : <div>Detected URL: <code>{source.payload}</code></div>}
```

(Note: the brief `base64.slice(0, 200)` trick only works if you keep the FULL base64 in state — render with the full string in production. The slice was a defensive line-length cap; remove it when wiring real data.)

- [ ] **Step 5:** Run → PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/components/compiler/CompilerChat.tsx packages/client/src/components/compiler/MirrorIntentCard.tsx packages/client/src/components/compiler/__tests__/CompilerChat.image.test.tsx
git commit -m "feat(client): CompilerChat accepts drop/paste image + MirrorIntentCard thumbnail (Plan 10c Phase 4)"
```

---

## Phase 5 — E2E + verify

### Task 6: `compiler-screenshot-journey.spec.ts`

**Files:**
- Create: `packages/e2e/tests/e2e/compiler-screenshot-journey.spec.ts`

Route-mocked. Tests both Mirror+image (identified) and AST+image flows.

- [ ] **Step 1: Write the spec**

```typescript
import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

test('mirror+image — identified site flows to mirror artifact', async ({ page }) => {
  await page.route('**/api/projects/*/compile', async route => {
    const body = await route.request().postDataJSON();
    if (body?.mode === 'mirror' && body?.source?.kind === 'image') {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ ok: true, artifact: { kind: 'mirror', id: 'ar_si', sourceUrl: 'https://detected.com', sourceType: 'url', crawledAt: new Date().toISOString(), files: {}, warnings: [], editable: false } }),
      });
    } else { await route.continue(); }
  });
  await page.route('**/api/projects/*/artifacts', route => route.fulfill({ status: 200, body: JSON.stringify({ artifacts: [{ id: 'ar_si', kind: 'mirror', sourceUrl: 'https://detected.com' }] }) }));

  await page.goto('/project/p1');
  // Drop a fixture PNG
  const buffer = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'tiny.png'));
  await page.locator('[data-testid="chat-drop-zone"]').dispatchEvent('drop', { dataTransfer: { files: [new File([buffer], 'tiny.png', { type: 'image/png' })] } as any });
  await page.getByText(/Send/i).click();
  await page.getByLabel(/Mirror/i).check();
  await page.getByText(/Confirm/i).click();
  await expect(page.locator('text=ar_si')).toBeVisible();
});

test('ast+image — unknown site → ast still produced', async ({ page }) => {
  await page.route('**/api/projects/*/compile', async route => {
    const body = await route.request().postDataJSON();
    if (body?.mode === 'ast' && body?.source?.kind === 'image') {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ ok: true, ast: { schemaVersion: 1, artifactId: 'ar_ai', kind: 'page', root: { id: 'n_root', type: 'Container', props: {}, layout: { kind: 'flow' }, style: {}, bindings: [], events: [], constraints: [], children: [] } } }),
      });
    } else { await route.continue(); }
  });
  // ... drop image, send, pick AST, confirm, assert AST artifact appears
});
```

(Create a tiny fixture `packages/e2e/tests/fixtures/tiny.png` if not present.)

- [ ] **Step 2:** Run E2E → PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/e2e/tests/e2e/compiler-screenshot-journey.spec.ts packages/e2e/tests/fixtures/tiny.png
git commit -m "test(e2e): compiler-screenshot-journey — mirror+image + ast+image (Plan 10c Phase 5)"
```

---

### Task 7: Final verify + manual smoke

- [ ] All builds + tests green.
- [ ] **Manual smoke**: with Plan 10-pre's vision smoke confirmed passing AND a Gemini key in env/settings:
  - Open browser, paste an actual screenshot of `example.com` → pick Mirror → should identify and crawl `example.com`.
  - Paste a screenshot of an obscure private app → pick Mirror → should return "unidentified_screenshot" with a chat hint.
  - Paste any screenshot → pick AST → should produce an AST artifact with structure roughly matching what's visible.
  - Confirm no regression on URL / pure-text flows.

## Acceptance Criteria

- [ ] `identifySite`, `parseScreenshot`, `buildColdStart`(screenshot) all green.
- [ ] `compile.ts` image branches behave per spec §2.3 (mirror+image identified → URL flow; unidentified → clean fallback; vision_unavailable cleanly surfaced).
- [ ] CompilerChat accepts drag-and-drop and paste image attachments; the image survives to the server unmodified.
- [ ] MirrorIntentCard shows an image thumbnail when source is image.
- [ ] `compiler-screenshot-journey.spec.ts` passes.
- [ ] When Plan 10-pre vision smoke fails / no key, compile cleanly returns `vision_unavailable` (no exceptions leaked to the client).
- [ ] Existing Plan 10a + 10b tests still green (no regressions).

## Risks / Notes

1. **Identification accuracy** is the failure mode most users will see. The prompt is biased toward "if not confident, say unknown" so we get clean failures rather than nonsense URLs. If users complain about misidentification, tighten the prompt or add a confirmation step ("I think this is X — is that right?").
2. **AST+image quality is bounded by vision summary quality.** Without DOM, the AST will be coarser than from a URL. That's acceptable for a starting point — user can chat-edit afterwards.
3. **Image size**: large screenshots (>3 MB) might hit Gemini token limits. Add a client-side resize step (downscale to 1600px max width) before base64 if observed. Out of scope unless complaints emerge.
4. **No streaming**: existing compile path is request/response, takes 10-30s with vision. Users see a spinner; acceptable for v1.
5. **The brief `base64.slice(0, 200)` in some snippet examples** is wrong for production — that was placeholder filler. The implementation must keep the FULL base64 in attachment state and pass it intact to the API; only truncate for log display.
6. **Memory note update**: After this plan ships AND smoke passes, update `project_multimodal_limitation.md` to reflect that `generateVision` is a working side-path, and that screenshot input is functional in CompilerChat — but the broader `getProvider()` vision path remains broken for non-Plan-10 callers.

---

**Plan end.**
