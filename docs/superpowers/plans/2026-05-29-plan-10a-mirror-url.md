# Plan 10a — Mirror Mode (URL path) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** End-to-end "paste a URL → get a 1:1 Mirror artifact in the project" flow. User pastes a URL into CompilerChat → an inline MirrorIntentCard offers Mirror vs AST (only Mirror is wired in this plan; AST falls back to the existing pure-text flow) → on confirm, the server crawls, strips `<script>`, inlines CSS, localizes assets, writes a sidecar `mirrors/<artifactId>/` directory, and returns a Mirror artifact → the artifact appears in `ArtifactRail` with a 🔒 icon → `PreviewPane` renders it via an `<iframe src="/api/projects/:id/mirrors/:artifactId/page.html">`. "Upgrade to AST" is a button stub in `InspectorPane` (no behavior; Plan 10b wires it).

**Architecture:** Reuse the existing `services/websiteCrawler.ts` `crawlWebsite()` for the raw fetch + screenshot. Add a new `parseWebpage` ingestion (wraps `crawlWebsite` + script-stripping + asset URL extraction → `WebpageIngestion`). Add `services/mirrorBuilder.ts` to orchestrate: ingestion → asset download → URL rewriting → sidecar files via `storage/mirrorStore.ts`. Server returns Mirror artifact metadata stored as `<id>.mirror.json` next to AST artifacts; `listArtifacts` is extended to surface both kinds. Asset URL rewriting maps absolute external URLs to relative `assets/<sha1>.<ext>` (so the served HTML/CSS works without further rewriting at request time). Client `useCompilerStore` learns the `MirrorArtifactMeta` shape; `CompilerChat` detects URL regex matches and renders `MirrorIntentCard` inline.

**Tech Stack:** TS 5.6 strict, Vitest 3.2.4, Express 4, `playwright` (already a dep — Mirror uses the same browser as `websiteCrawler.ts`), `cheerio` (new dep — robust HTML rewriting), Node `node:crypto` for asset hashing, `undici` (already a dep, transitively) for asset HTTP fetch. React 18 (client). No new server framework deps beyond `cheerio`.

**Spec:** `docs/superpowers/specs/2026-05-29-plan-10-design-intelligence-design.md` §1, §2.1 (URL path only), §2.2, §2.3 (`mirror + URL` row), §2.4, §3.1, §3.2, §3.4 (existing artifact-listing scan, no index.json bump needed), §4 (excluding `parseScreenshot`, `themeExtractor`, `themeMerger`, `ThemeMergeDialog`), §6 (mirror + URL pseudocode), §7 (rows 1–6), §8 (mirror-related rows), §9 (Mirror-mode DoD bullet).

**Scope boundary (out of plan):**
- **No AST mode:** the MirrorIntentCard renders both Mirror and AST options, but choosing AST short-circuits to the existing requirement compile flow (no `WebpageIngestion` consumption, no theme extraction). Plan 10b will wire AST.
- **No theme extraction or `theme.json`.** That's Plan 10b.
- **No screenshot input.** Plan 10c.
- **No real Mirror→AST upgrade.** The button is a disabled stub with a tooltip "available after Plan 10b".
- **No vision call.** This plan is text+DOM only.
- **No git versioning of mirror artifacts** beyond regular project file storage (Plan 7's existing hybrid persistence handles `projects/<id>/`).
- **No CSP / referer / cookie auth.** Crawler tolerates the public surface only.
- **`listArtifacts` consumers:** the existing call sites are inside `compile.ts` route (this plan modifies them). No other consumer.

---

## File Structure

```
packages/server/
  src/ingestion/
    parseWebpage.ts                    ← NEW (≈70 LoC)
    classifyIntent.ts                  ← NEW (≈50 LoC)
    __tests__/
      parseWebpage.test.ts             ← NEW
      classifyIntent.test.ts           ← NEW
  src/storage/
    mirrorStore.ts                     ← NEW (≈110 LoC)
    artifactStore.ts                   ← MODIFY: extend listArtifacts return shape
    __tests__/
      mirrorStore.test.ts              ← NEW
      artifactStore.test.ts            ← MODIFY (return-shape test update)
  src/services/
    mirrorBuilder.ts                   ← NEW (≈180 LoC)
    __tests__/
      mirrorBuilder.test.ts            ← NEW
  src/routes/
    compile.ts                         ← MODIFY: add mode branch + update list response
    mirrors.ts                         ← NEW (≈80 LoC)
    __tests__/
      compile.route.test.ts            ← MODIFY: add mirror branch tests
      mirrors.route.test.ts            ← NEW

packages/codegen/src/
  renderMirror.ts                      ← NEW (≈40 LoC)
  __tests__/
    renderMirror.test.ts               ← NEW
  index.ts                             ← MODIFY: re-export renderMirror

packages/client/
  src/lib/api.ts                       ← MODIFY: compile() supports {mode, source}; add getMirrorUrl()
  src/stores/useCompilerStore.ts       ← MODIFY: artifact list adds 'mirror' kind
  src/components/compiler/
    MirrorIntentCard.tsx               ← NEW (≈90 LoC)
    CompilerChat.tsx                   ← MODIFY: URL detection + intent card
    ArtifactRail.tsx                   ← MODIFY: 🔒 icon for mirror
    PreviewPane.tsx                    ← MODIFY: iframe path for mirror
    InspectorPane.tsx                  ← MODIFY: mirror metadata + upgrade stub
    __tests__/
      MirrorIntentCard.test.tsx        ← NEW
      CompilerChat.test.tsx            ← MODIFY (URL detection)

packages/e2e/
  tests/e2e/compiler-mirror-journey.spec.ts  ← NEW (route-mocked)

packages/server/package.json           ← MODIFY: add cheerio
```

---

## Phase 1 — Server foundation

### Task 1: `classifyIntent` — chat message → mode/source

**Files:**
- Create: `packages/server/src/ingestion/classifyIntent.ts`
- Create: `packages/server/src/ingestion/__tests__/classifyIntent.test.ts`

Pure deterministic. No AI.

- [ ] **Step 1: Failing test**

```typescript
// packages/server/src/ingestion/__tests__/classifyIntent.test.ts
import { describe, it, expect } from 'vitest';
import { classifyIntent } from '../classifyIntent';

describe('classifyIntent', () => {
  it('returns pure-text when no URL and no attachment', () => {
    expect(classifyIntent({ text: 'build me a login page', attachments: [] })).toEqual({
      mode: 'pure-text', source: null, suggestedMode: 'pure-text',
    });
  });

  it('detects URL and returns source.url with suggestedMode unset', () => {
    const r = classifyIntent({ text: 'check this https://stripe.com/pricing thanks', attachments: [] });
    expect(r.source).toEqual({ kind: 'url', payload: 'https://stripe.com/pricing' });
    expect(r.suggestedMode).toBeUndefined();
    expect(r.mode).toBe('intent-card'); // server defers to user
  });

  it('mirror-leaning phrases pre-select mirror', () => {
    const r = classifyIntent({ text: '完整複製這個網頁 https://example.com', attachments: [] });
    expect(r.suggestedMode).toBe('mirror');
  });

  it('AST-leaning phrases pre-select ast', () => {
    const r = classifyIntent({ text: '參考這個風格 https://example.com', attachments: [] });
    expect(r.suggestedMode).toBe('ast');
  });

  it('only returns the FIRST URL when multiple are present', () => {
    const r = classifyIntent({ text: 'https://a.com and https://b.com', attachments: [] });
    expect(r.source?.payload).toBe('https://a.com');
  });

  it('image attachment → source.image (mode still intent-card)', () => {
    const r = classifyIntent({ text: 'this', attachments: [{ kind: 'image', mimeType: 'image/png', base64: 'x' }] });
    expect(r.source).toEqual({ kind: 'image', mimeType: 'image/png', base64: 'x' });
    expect(r.mode).toBe('intent-card');
  });
});
```

- [ ] **Step 2:** Run `pnpm --filter server test -- classifyIntent` → FAIL.

- [ ] **Step 3: Implement**

```typescript
// packages/server/src/ingestion/classifyIntent.ts
export type IntentMode = 'pure-text' | 'intent-card';
export type IntentSource =
  | null
  | { kind: 'url'; payload: string }
  | { kind: 'image'; mimeType: string; base64: string };
export type SuggestedMode = 'mirror' | 'ast' | undefined;

export interface ChatAttachment { kind: 'image'; mimeType: string; base64: string; }
export interface ClassifyInput { text: string; attachments: ChatAttachment[]; }
export interface ClassifyResult { mode: IntentMode; source: IntentSource; suggestedMode: SuggestedMode; }

const URL_RE = /https?:\/\/[^\s<>"']+/;
const MIRROR_HINTS = [/照著抄/, /完整複製/, /仿這個/, /1\s*:\s*1/, /pixel[-\s]*perfect/i, /mirror/i];
const AST_HINTS = [/參考/, /像這個風格/, /套這個感/, /inspired\s*by/i];

function suggested(text: string, hasSource: boolean): SuggestedMode {
  if (!hasSource) return undefined;
  if (MIRROR_HINTS.some(r => r.test(text))) return 'mirror';
  if (AST_HINTS.some(r => r.test(text))) return 'ast';
  return undefined;
}

export function classifyIntent(input: ClassifyInput): ClassifyResult {
  const imgAttach = input.attachments.find(a => a.kind === 'image');
  if (imgAttach) {
    return { mode: 'intent-card', source: { kind: 'image', mimeType: imgAttach.mimeType, base64: imgAttach.base64 },
      suggestedMode: suggested(input.text, true) };
  }
  const m = input.text.match(URL_RE);
  if (m) {
    return { mode: 'intent-card', source: { kind: 'url', payload: m[0] }, suggestedMode: suggested(input.text, true) };
  }
  return { mode: 'pure-text', source: null, suggestedMode: 'pure-text' };
}
```

- [ ] **Step 4:** Re-run test → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/ingestion/classifyIntent.ts packages/server/src/ingestion/__tests__/classifyIntent.test.ts
git commit -m "feat(ingestion): classifyIntent — URL/image detection + suggested mode (Plan 10a Phase 1)"
```

---

### Task 2: `parseWebpage` — wrap `crawlWebsite` into a `WebpageIngestion`

**Files:**
- Create: `packages/server/src/ingestion/parseWebpage.ts`
- Create: `packages/server/src/ingestion/__tests__/parseWebpage.test.ts`

Adds `<script>` / `<iframe>` stripping and asset URL extraction. Returns the `WebpageIngestion` shape already declared in `packages/ast/src/ingestion/ingestionAst.ts`.

- [ ] **Step 1: Failing test**

```typescript
// packages/server/src/ingestion/__tests__/parseWebpage.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../services/websiteCrawler', () => ({
  crawlWebsiteRaw: vi.fn(async (url: string) => ({
    url, success: true, screenshot: 'BASE64SCREENSHOT',
    html: '<html><head><link rel="stylesheet" href="https://cdn.example/app.css"></head><body><img src="https://cdn.example/logo.png"><script src="x.js"></script><iframe src="y"></iframe><p>hello</p></body></html>',
    inlineStylesheets: ['body{color:red;background:url(https://cdn.example/bg.jpg)}'],
  })),
}));

import { parseWebpage } from '../parseWebpage';

describe('parseWebpage', () => {
  it('returns a successful WebpageIngestion with script/iframe stripped', async () => {
    const res = await parseWebpage('https://example.com');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.ingestion.type).toBe('webpage');
    expect(res.ingestion.url).toBe('https://example.com');
    expect(res.ingestion.dom).not.toMatch(/<script/i);
    expect(res.ingestion.dom).not.toMatch(/<iframe/i);
    expect(res.ingestion.dom).toContain('<p>hello</p>');
    expect(res.ingestion.screenshot).toBe('BASE64SCREENSHOT');
  });

  it('extracts external asset URLs (img src, stylesheet href, css url())', async () => {
    const res = await parseWebpage('https://example.com');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.assets).toEqual(expect.arrayContaining([
      'https://cdn.example/app.css',
      'https://cdn.example/logo.png',
      'https://cdn.example/bg.jpg',
    ]));
  });

  it('returns ok=false when crawler reports failure', async () => {
    const mod = await import('../../services/websiteCrawler');
    (mod.crawlWebsiteRaw as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ url: 'https://x', success: false, error: 'timeout', html: '', inlineStylesheets: [] });
    const res = await parseWebpage('https://x');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe('crawl_timeout');
  });
});
```

- [ ] **Step 2:** Run → FAIL (module missing + `crawlWebsiteRaw` not exported yet).

- [ ] **Step 3: Add a thin `crawlWebsiteRaw` export to `websiteCrawler.ts`**

This is a small addition (NOT a rewrite). Append to `packages/server/src/services/websiteCrawler.ts`:

```typescript
export interface RawCrawlResult {
  url: string;
  success: boolean;
  error?: string;
  /** Full outerHTML of the page (after networkidle). */
  html: string;
  /** Each `<link rel=stylesheet>` and each `<style>` block's text content, concatenated in order. */
  inlineStylesheets: string[];
  screenshot?: string;
}

/** Like crawlWebsite but returns raw DOM + inline stylesheets — for the Mirror builder. */
export async function crawlWebsiteRaw(url: string): Promise<RawCrawlResult> {
  try { new URL(url); } catch { return { url, success: false, error: 'invalid_url', html: '', inlineStylesheets: [] }; }
  let browser: Browser | null = null;
  try {
    browser = await getBrowser();
    const context = await browser.newContext(getCrawlerContextOptions());
    const page = await context.newPage();
    await applyCrawlerStealth(page);
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
    const html = await page.content();
    if ((response && response.status() === 403) || looksForbiddenHtml(html)) {
      await context.close();
      return { url, success: false, error: 'forbidden', html: '', inlineStylesheets: [] };
    }
    const screenshotBuffer = await page.screenshot({ fullPage: false });
    const screenshot = screenshotBuffer.toString('base64');
    const inlineStylesheets = await page.evaluate(() =>
      Array.from(document.querySelectorAll('style')).map(s => s.textContent || '')
    );
    await context.close();
    return { url, success: true, html, inlineStylesheets, screenshot };
  } catch (err: any) {
    if (err.message?.includes('timeout') || err.message?.includes('Timeout')) return { url, success: false, error: 'timeout', html: '', inlineStylesheets: [] };
    return { url, success: false, error: err.message?.slice(0, 200) || 'unknown', html: '', inlineStylesheets: [] };
  }
}
```

- [ ] **Step 4: Install `cheerio` and implement `parseWebpage`**

```bash
pnpm --filter server add cheerio
```

```typescript
// packages/server/src/ingestion/parseWebpage.ts
import * as cheerio from 'cheerio';
import { crawlWebsiteRaw } from '../services/websiteCrawler';
import type { WebpageIngestion } from '@designbridge/ast';

export type ParseWebpageReason = 'crawl_timeout' | 'crawl_forbidden' | 'invalid_url' | 'crawl_unknown';
export type ParseWebpageResult =
  | { ok: true; ingestion: WebpageIngestion; assets: string[] }
  | { ok: false; reason: ParseWebpageReason; detail?: string };

const RX_CSS_URL = /url\(\s*['"]?([^'")]+)['"]?\s*\)/g;

function reasonFromError(err?: string): ParseWebpageReason {
  if (err === 'timeout') return 'crawl_timeout';
  if (err === 'forbidden') return 'crawl_forbidden';
  if (err === 'invalid_url') return 'invalid_url';
  return 'crawl_unknown';
}

function extractCssUrls(css: string): string[] {
  const out: string[] = [];
  for (const m of css.matchAll(RX_CSS_URL)) {
    const u = m[1];
    if (u && /^https?:/i.test(u)) out.push(u);
  }
  return out;
}

export async function parseWebpage(url: string): Promise<ParseWebpageResult> {
  const raw = await crawlWebsiteRaw(url);
  if (!raw.success) return { ok: false, reason: reasonFromError(raw.error), detail: raw.error };

  const $ = cheerio.load(raw.html);
  $('script, iframe, noscript').remove();
  // Collect asset URLs BEFORE stripping links — img src, link href stylesheets, source srcset, css url()
  const assets = new Set<string>();
  $('img[src]').each((_, el) => { const s = $(el).attr('src'); if (s && /^https?:/i.test(s)) assets.add(s); });
  $('link[rel="stylesheet"][href]').each((_, el) => { const s = $(el).attr('href'); if (s && /^https?:/i.test(s)) assets.add(s); });
  $('source[srcset]').each((_, el) => {
    const ss = $(el).attr('srcset') ?? '';
    for (const part of ss.split(',')) { const u = part.trim().split(/\s+/)[0]; if (u && /^https?:/i.test(u)) assets.add(u); }
  });
  for (const sheet of raw.inlineStylesheets) for (const u of extractCssUrls(sheet)) assets.add(u);

  const dom = $.html();

  return {
    ok: true,
    ingestion: { type: 'webpage', url: raw.url, dom, screenshot: raw.screenshot },
    assets: [...assets],
  };
}
```

- [ ] **Step 5:** Re-run test → PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/ingestion/parseWebpage.ts packages/server/src/ingestion/__tests__/parseWebpage.test.ts packages/server/src/services/websiteCrawler.ts packages/server/package.json pnpm-lock.yaml
git commit -m "feat(ingestion): parseWebpage — wrap crawler, strip script/iframe, extract assets (Plan 10a Phase 1)"
```

---

### Task 3: `mirrorStore` — file ops for `mirrors/<artifactId>/`

**Files:**
- Create: `packages/server/src/storage/mirrorStore.ts`
- Create: `packages/server/src/storage/__tests__/mirrorStore.test.ts`

Mirrors `artifactStore.ts`'s style: traversal-safe slugging, single-segment ids, explicit `baseDir` for testability.

- [ ] **Step 1: Failing test**

```typescript
// packages/server/src/storage/__tests__/mirrorStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  writeMirrorFiles, mirrorBaseDir, readMirrorFile,
  saveMirrorMeta, loadMirrorMeta, deleteMirror,
} from '../mirrorStore';

describe('mirrorStore', () => {
  let baseDir: string;
  beforeEach(() => { baseDir = mkdtempSync(join(tmpdir(), 'mirrorstore-')); });

  it('writes page.html / styles.css / screenshot + assets and round-trips', () => {
    writeMirrorFiles('proj1', 'ar_1', {
      html: '<p>x</p>', css: 'p{color:red}', screenshot: Buffer.from('PNG'),
      assets: [{ filename: 'a.png', bytes: Buffer.from('imgbytes') }],
    }, { baseDir });

    const root = mirrorBaseDir('proj1', 'ar_1', baseDir);
    expect(readFileSync(join(root, 'page.html'), 'utf8')).toBe('<p>x</p>');
    expect(readFileSync(join(root, 'styles.css'), 'utf8')).toBe('p{color:red}');
    expect(readFileSync(join(root, 'screenshot.png'))).toEqual(Buffer.from('PNG'));
    expect(readFileSync(join(root, 'assets', 'a.png'))).toEqual(Buffer.from('imgbytes'));
  });

  it('blocks traversal in artifactId', () => {
    writeMirrorFiles('proj1', '../../escape', { html: 'x', css: '', screenshot: Buffer.from(''), assets: [] }, { baseDir });
    // The directory created is sanitized — must NOT escape baseDir.
    expect(existsSync(join(baseDir, 'projects'))).toBe(true);
    const escaped = join(baseDir, '..', 'escape');
    expect(existsSync(escaped)).toBe(false);
  });

  it('readMirrorFile blocks path traversal in filename', () => {
    writeMirrorFiles('proj1', 'ar_1', { html: 'x', css: '', screenshot: Buffer.from(''), assets: [] }, { baseDir });
    expect(() => readMirrorFile('proj1', 'ar_1', '../../etc/passwd', { baseDir })).toThrow(/invalid/i);
  });

  it('saveMirrorMeta / loadMirrorMeta round-trips', () => {
    const meta = { kind: 'mirror' as const, id: 'ar_1', sourceUrl: 'https://e.com', sourceType: 'url' as const,
      crawledAt: '2026-05-29T00:00:00Z', files: { html: 'page.html', css: 'styles.css', screenshot: 'screenshot.png' },
      warnings: [], editable: false };
    saveMirrorMeta('proj1', meta, { baseDir });
    expect(loadMirrorMeta('proj1', 'ar_1', { baseDir })).toEqual(meta);
  });

  it('deleteMirror removes the directory + meta', () => {
    writeMirrorFiles('proj1', 'ar_1', { html: 'x', css: '', screenshot: Buffer.from(''), assets: [] }, { baseDir });
    saveMirrorMeta('proj1', { kind: 'mirror', id: 'ar_1', sourceUrl: 'x', sourceType: 'url', crawledAt: 'x', files: { html: 'page.html', css: 'styles.css', screenshot: 'screenshot.png' }, warnings: [], editable: false }, { baseDir });
    deleteMirror('proj1', 'ar_1', { baseDir });
    expect(loadMirrorMeta('proj1', 'ar_1', { baseDir })).toBeNull();
    expect(existsSync(mirrorBaseDir('proj1', 'ar_1', baseDir))).toBe(false);
  });
});
```

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3: Implement**

```typescript
// packages/server/src/storage/mirrorStore.ts
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';

export interface MirrorArtifactMeta {
  kind: 'mirror';
  id: string;
  sourceUrl: string;
  sourceType: 'url' | 'screenshot';
  crawledAt: string;
  files: { html: string; css: string; screenshot: string };
  warnings: Array<{ code: string; url?: string; detail?: string }>;
  editable: false;
}

export interface MirrorWriteInput {
  html: string;
  css: string;
  screenshot: Buffer;
  assets: Array<{ filename: string; bytes: Buffer }>;
}

export interface MirrorStoreOpts { baseDir?: string; }

function defaultBaseDir(): string { return resolve(__dirname, '../../data'); }

/** Sanitize an id into a safe single path segment (no traversal, no separators). */
function slug(id: string): string {
  const s = String(id).replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '_').slice(0, 128);
  return s.length ? s : 'unnamed';
}

export function mirrorBaseDir(projectId: string, artifactId: string, baseDir?: string): string {
  return join(baseDir ?? defaultBaseDir(), 'projects', slug(projectId), 'mirrors', slug(artifactId));
}

function metaPath(projectId: string, artifactId: string, baseDir?: string): string {
  return join(baseDir ?? defaultBaseDir(), 'projects', slug(projectId), 'artifacts', `${slug(artifactId)}.mirror.json`);
}

export function writeMirrorFiles(projectId: string, artifactId: string, input: MirrorWriteInput, opts: MirrorStoreOpts = {}): void {
  const root = mirrorBaseDir(projectId, artifactId, opts.baseDir);
  mkdirSync(join(root, 'assets'), { recursive: true });
  writeFileSync(join(root, 'page.html'), input.html, 'utf8');
  writeFileSync(join(root, 'styles.css'), input.css, 'utf8');
  writeFileSync(join(root, 'screenshot.png'), input.screenshot);
  for (const a of input.assets) {
    const safe = basename(a.filename).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 128);
    if (!safe || safe.startsWith('.')) continue;
    writeFileSync(join(root, 'assets', safe), a.bytes);
  }
}

export function readMirrorFile(projectId: string, artifactId: string, filename: string, opts: MirrorStoreOpts = {}): Buffer {
  // Strict allow-list: only `page.html`, `styles.css`, `screenshot.png`, or `assets/<safe-name>` (no traversal).
  if (filename !== 'page.html' && filename !== 'styles.css' && filename !== 'screenshot.png' && !/^assets\/[A-Za-z0-9._-]{1,128}$/.test(filename)) {
    throw new Error(`invalid mirror file path: ${filename}`);
  }
  const p = join(mirrorBaseDir(projectId, artifactId, opts.baseDir), filename);
  return readFileSync(p);
}

export function saveMirrorMeta(projectId: string, meta: MirrorArtifactMeta, opts: MirrorStoreOpts = {}): void {
  const p = metaPath(projectId, meta.id, opts.baseDir);
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, JSON.stringify(meta, null, 2), 'utf8');
}

export function loadMirrorMeta(projectId: string, artifactId: string, opts: MirrorStoreOpts = {}): MirrorArtifactMeta | null {
  const p = metaPath(projectId, artifactId, opts.baseDir);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
}

export function deleteMirror(projectId: string, artifactId: string, opts: MirrorStoreOpts = {}): void {
  const root = mirrorBaseDir(projectId, artifactId, opts.baseDir);
  if (existsSync(root)) rmSync(root, { recursive: true, force: true });
  const meta = metaPath(projectId, artifactId, opts.baseDir);
  if (existsSync(meta)) rmSync(meta);
}
```

- [ ] **Step 4:** Re-run → PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/storage/mirrorStore.ts packages/server/src/storage/__tests__/mirrorStore.test.ts
git commit -m "feat(storage): mirrorStore — traversal-safe sidecar files + meta (Plan 10a Phase 1)"
```

---

### Task 4: Extend `listArtifacts` to surface both AST and Mirror kinds

**Files:**
- Modify: `packages/server/src/storage/artifactStore.ts`
- Modify: `packages/server/src/storage/__tests__/artifactStore.test.ts`

**Breaking change**: `listArtifacts` now returns `Array<{ id: string; kind: 'ast' | 'mirror' }>` instead of `string[]`. Only one consumer (`compile.ts` route) — Task 7 will update it.

- [ ] **Step 1: Update the existing test**

In `artifactStore.test.ts`, find the test asserting `listArtifacts` returns `['<id>']`-shaped output and change to:

```typescript
expect(listArtifacts('proj1', { baseDir })).toEqual([{ id: 'ar_1', kind: 'ast' }]);
```

Add a new test:

```typescript
it('lists both AST and Mirror artifacts', () => {
  saveArtifact('proj1', /* sample ast with artifactId 'ar_a' */, { baseDir });
  // Touch a fake .mirror.json file:
  const mirrorPath = require('node:path').join(baseDir, 'projects', 'proj1', 'artifacts', 'ar_m.mirror.json');
  require('node:fs').mkdirSync(require('node:path').dirname(mirrorPath), { recursive: true });
  require('node:fs').writeFileSync(mirrorPath, '{}');
  expect(listArtifacts('proj1', { baseDir }).sort((a, b) => a.id.localeCompare(b.id))).toEqual([
    { id: 'ar_a', kind: 'ast' },
    { id: 'ar_m', kind: 'mirror' },
  ]);
});
```

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3: Implement**

Replace `listArtifacts` in `artifactStore.ts`:

```typescript
export interface ArtifactListEntry { id: string; kind: 'ast' | 'mirror'; }
export function listArtifacts(projectId: string, opts: StoreOpts = {}): ArtifactListEntry[] {
  const baseDir = opts.baseDir ?? defaultBaseDir();
  const dir = artifactsDir(baseDir, projectId);
  if (!existsSync(dir)) return [];
  const out: ArtifactListEntry[] = [];
  for (const f of readdirSync(dir)) {
    if (f.endsWith('.ast.json')) out.push({ id: f.replace(/\.ast\.json$/, ''), kind: 'ast' });
    else if (f.endsWith('.mirror.json')) out.push({ id: f.replace(/\.mirror\.json$/, ''), kind: 'mirror' });
  }
  return out;
}
```

- [ ] **Step 4:** Run all `artifactStore` tests → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/storage/artifactStore.ts packages/server/src/storage/__tests__/artifactStore.test.ts
git commit -m "feat(storage): listArtifacts returns kind discriminator (Plan 10a Phase 1)"
```

---

### Task 5: `mirrorBuilder` — orchestrate ingestion → assets → write

**Files:**
- Create: `packages/server/src/services/mirrorBuilder.ts`
- Create: `packages/server/src/services/__tests__/mirrorBuilder.test.ts`

The orchestrator. Downloads assets in parallel with bounded concurrency, computes sha1 hashes, rewrites URLs in HTML + CSS to relative `assets/<sha1>.<ext>`, and writes everything via `mirrorStore`.

- [ ] **Step 1: Failing test**

```typescript
// packages/server/src/services/__tests__/mirrorBuilder.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('../../ingestion/parseWebpage', () => ({
  parseWebpage: vi.fn(),
}));

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

import { buildMirror } from '../mirrorBuilder';
import { parseWebpage } from '../../ingestion/parseWebpage';
import { loadMirrorMeta, mirrorBaseDir } from '../../storage/mirrorStore';
import { readFileSync, existsSync } from 'node:fs';

describe('buildMirror', () => {
  beforeEach(() => { fetchMock.mockReset(); (parseWebpage as ReturnType<typeof vi.fn>).mockReset(); });

  it('crawls, downloads assets, rewrites URLs, writes meta', async () => {
    (parseWebpage as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      ingestion: {
        type: 'webpage', url: 'https://e.com',
        dom: '<html><body><img src="https://cdn.example/logo.png"><link rel="stylesheet" href="https://cdn.example/app.css"></body></html>',
        screenshot: Buffer.from('PNG').toString('base64'),
      },
      assets: ['https://cdn.example/logo.png', 'https://cdn.example/app.css'],
    });
    fetchMock.mockImplementation(async (url: string) => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => new Uint8Array(Buffer.from(`bytes:${url}`)).buffer,
    }));

    const baseDir = mkdtempSync(join(tmpdir(), 'mirrorbuilder-'));
    const res = await buildMirror({ projectId: 'p1', artifactId: 'ar_1', url: 'https://e.com', baseDir });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.meta.kind).toBe('mirror');
    expect(res.meta.id).toBe('ar_1');
    expect(res.meta.sourceUrl).toBe('https://e.com');
    expect(res.meta.warnings).toEqual([]);
    // page.html had its asset URLs rewritten to relative paths
    const html = readFileSync(join(mirrorBaseDir('p1', 'ar_1', baseDir), 'page.html'), 'utf8');
    expect(html).toContain('assets/');
    expect(html).not.toContain('https://cdn.example/logo.png');
    // meta written to artifacts/<id>.mirror.json
    expect(loadMirrorMeta('p1', 'ar_1', { baseDir })?.id).toBe('ar_1');
  });

  it('on parseWebpage failure, returns ok=false with reason and does NOT write any files', async () => {
    (parseWebpage as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, reason: 'crawl_timeout', detail: 'timeout' });
    const baseDir = mkdtempSync(join(tmpdir(), 'mirrorbuilder-'));
    const res = await buildMirror({ projectId: 'p1', artifactId: 'ar_2', url: 'https://e.com', baseDir });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe('crawl_timeout');
    expect(existsSync(mirrorBaseDir('p1', 'ar_2', baseDir))).toBe(false);
  });

  it('asset 404 → warning recorded, mirror still built', async () => {
    (parseWebpage as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      ingestion: { type: 'webpage', url: 'https://e.com', dom: '<img src="https://cdn.example/missing.png">', screenshot: Buffer.from('PNG').toString('base64') },
      assets: ['https://cdn.example/missing.png'],
    });
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) });
    const baseDir = mkdtempSync(join(tmpdir(), 'mirrorbuilder-'));
    const res = await buildMirror({ projectId: 'p1', artifactId: 'ar_3', url: 'https://e.com', baseDir });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.meta.warnings.some(w => w.code === 'asset_404')).toBe(true);
  });
});
```

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3: Implement**

```typescript
// packages/server/src/services/mirrorBuilder.ts
import { createHash } from 'node:crypto';
import { extname } from 'node:path';
import { parseWebpage, type ParseWebpageReason } from '../ingestion/parseWebpage';
import { writeMirrorFiles, saveMirrorMeta, type MirrorArtifactMeta } from '../storage/mirrorStore';

export interface BuildMirrorParams {
  projectId: string;
  artifactId: string;
  url: string;
  baseDir?: string;
  /** Bounded asset-fetch concurrency. Default 6. */
  concurrency?: number;
}

export type BuildMirrorResult =
  | { ok: true; meta: MirrorArtifactMeta }
  | { ok: false; reason: ParseWebpageReason | 'asset_write_failed'; detail?: string };

interface DownloadedAsset { originalUrl: string; localFilename: string; bytes: Buffer; }
interface AssetFailure { url: string; code: 'asset_404' | 'asset_error'; detail?: string; }

function extFromUrl(u: string): string {
  try { const p = new URL(u).pathname; const e = extname(p).toLowerCase(); return /^\.[a-z0-9]{1,8}$/.test(e) ? e : '.bin'; } catch { return '.bin'; }
}

async function fetchAsset(url: string): Promise<{ ok: true; bytes: Buffer } | { ok: false; code: 'asset_404' | 'asset_error'; detail?: string }> {
  try {
    const r = await fetch(url);
    if (!r.ok) return { ok: false, code: r.status === 404 ? 'asset_404' : 'asset_error', detail: `status ${r.status}` };
    const ab = await r.arrayBuffer();
    return { ok: true, bytes: Buffer.from(ab) };
  } catch (err) {
    return { ok: false, code: 'asset_error', detail: (err as Error).message };
  }
}

async function downloadAll(urls: string[], concurrency: number): Promise<{ ok: DownloadedAsset[]; failed: AssetFailure[] }> {
  const ok: DownloadedAsset[] = [];
  const failed: AssetFailure[] = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, urls.length) }, async () => {
    while (i < urls.length) {
      const url = urls[i++];
      const r = await fetchAsset(url);
      if (r.ok) {
        const hash = createHash('sha1').update(r.bytes).digest('hex').slice(0, 16);
        ok.push({ originalUrl: url, localFilename: `${hash}${extFromUrl(url)}`, bytes: r.bytes });
      } else {
        failed.push({ url, code: r.code, detail: r.detail });
      }
    }
  });
  await Promise.all(workers);
  return { ok, failed };
}

function rewriteUrls(html: string, css: string, mapping: Map<string, string>): { html: string; css: string } {
  let rewrittenHtml = html;
  let rewrittenCss = css;
  for (const [orig, local] of mapping) {
    const safe = orig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    rewrittenHtml = rewrittenHtml.replace(new RegExp(safe, 'g'), `assets/${local}`);
    rewrittenCss = rewrittenCss.replace(new RegExp(safe, 'g'), `assets/${local}`);
  }
  return { html: rewrittenHtml, css: rewrittenCss };
}

export async function buildMirror(params: BuildMirrorParams): Promise<BuildMirrorResult> {
  const parsed = await parseWebpage(params.url);
  if (!parsed.ok) return { ok: false, reason: parsed.reason, detail: parsed.detail };

  const { ok: assets, failed } = await downloadAll(parsed.assets, params.concurrency ?? 6);
  const mapping = new Map(assets.map(a => [a.originalUrl, a.localFilename]));

  // Concat all inline stylesheets into a single styles.css the iframe can load via the rewritten <link>
  // (Mirror keeps original stylesheet structure intact via cheerio's html(); css collection is best-effort here —
  //  most pages have inline <style> only, and external sheets are downloaded as assets and continue to work.)
  const cssParts: string[] = [];
  for (const a of assets) {
    if (a.localFilename.endsWith('.css')) cssParts.push(a.bytes.toString('utf8'));
  }
  const css = cssParts.join('\n\n');

  const rewritten = rewriteUrls(parsed.ingestion.dom, css, mapping);

  const meta: MirrorArtifactMeta = {
    kind: 'mirror', id: params.artifactId, sourceUrl: parsed.ingestion.url, sourceType: 'url',
    crawledAt: new Date().toISOString(),
    files: { html: 'page.html', css: 'styles.css', screenshot: 'screenshot.png' },
    warnings: failed.map(f => ({ code: f.code, url: f.url, detail: f.detail })),
    editable: false,
  };

  try {
    writeMirrorFiles(params.projectId, params.artifactId, {
      html: rewritten.html, css: rewritten.css,
      screenshot: Buffer.from(parsed.ingestion.screenshot ?? '', 'base64'),
      assets: assets.map(a => ({ filename: a.localFilename, bytes: a.bytes })),
    }, { baseDir: params.baseDir });
    saveMirrorMeta(params.projectId, meta, { baseDir: params.baseDir });
  } catch (err) {
    return { ok: false, reason: 'asset_write_failed', detail: (err as Error).message };
  }

  return { ok: true, meta };
}
```

- [ ] **Step 4:** Re-run → PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/services/mirrorBuilder.ts packages/server/src/services/__tests__/mirrorBuilder.test.ts
git commit -m "feat(mirror): mirrorBuilder — orchestrate crawl, download, rewrite, write (Plan 10a Phase 1)"
```

---

## Phase 2 — Codegen + routes

### Task 6: `renderMirror` — preview HTML generator (codegen package)

**Files:**
- Create: `packages/codegen/src/renderMirror.ts`
- Create: `packages/codegen/src/__tests__/renderMirror.test.ts`
- Modify: `packages/codegen/src/index.ts`

`renderMirror` is a thin function: given mirror meta + a base URL prefix (`/api/projects/:id/mirrors/:artifactId/`), return a self-contained `string` that the iframe can load. It does **not** re-rewrite asset URLs (those are already relative — the iframe `<base href>` makes them resolve under the mirrors route).

- [ ] **Step 1: Failing test**

```typescript
// packages/codegen/src/__tests__/renderMirror.test.ts
import { describe, it, expect } from 'vitest';
import { renderMirror } from '../renderMirror';

describe('renderMirror', () => {
  it('injects a <base href> when missing', () => {
    const html = '<html><head></head><body><p>x</p></body></html>';
    const out = renderMirror({ html, baseHref: '/api/projects/p1/mirrors/ar_1/' });
    expect(out).toMatch(/<base href="\/api\/projects\/p1\/mirrors\/ar_1\/"/);
  });

  it('does not duplicate a <base> when one already exists', () => {
    const html = '<html><head><base href="x"></head><body></body></html>';
    const out = renderMirror({ html, baseHref: '/api/projects/p1/mirrors/ar_1/' });
    const matches = out.match(/<base\b/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it('preserves body content verbatim', () => {
    const html = '<html><body><h1>Hi</h1></body></html>';
    expect(renderMirror({ html, baseHref: '/x/' })).toContain('<h1>Hi</h1>');
  });
});
```

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3: Implement**

```typescript
// packages/codegen/src/renderMirror.ts
export interface RenderMirrorParams { html: string; baseHref: string; }

/** Take a Mirror's stored page.html and prepare it for iframe serving by ensuring a <base href> exists. */
export function renderMirror({ html, baseHref }: RenderMirrorParams): string {
  if (/<base\b/i.test(html)) return html;
  if (/<head>/i.test(html)) return html.replace(/<head>/i, `<head><base href="${baseHref}">`);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html([^>]*)>/i, `<html$1><head><base href="${baseHref}"></head>`);
  return `<head><base href="${baseHref}"></head>${html}`;
}
```

- [ ] **Step 4:** Add to `packages/codegen/src/index.ts`:

```typescript
export { renderMirror } from './renderMirror';
export type { RenderMirrorParams } from './renderMirror';
```

- [ ] **Step 5:** Run → PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/codegen/src/renderMirror.ts packages/codegen/src/__tests__/renderMirror.test.ts packages/codegen/src/index.ts
git commit -m "feat(codegen): renderMirror — inject <base href> for iframe serving (Plan 10a Phase 2)"
```

---

### Task 7: Extend `compile.ts` route — `mode` branching + new `listArtifacts` shape

**Files:**
- Modify: `packages/server/src/routes/compile.ts`
- Modify: `packages/server/src/routes/__tests__/compile.route.test.ts`

- [ ] **Step 1: Failing tests**

In `compile.route.test.ts` add:

```typescript
describe('POST /:id/compile — mirror mode', () => {
  it('mode=mirror with source.url builds a mirror and returns metadata', async () => {
    // mock buildMirror in services/mirrorBuilder
    // ... see Step 3 for what to mock
    const res = await request(app)
      .post('/api/projects/p1/compile')
      .send({ mode: 'mirror', source: { kind: 'url', payload: 'https://example.com' }, artifactId: 'ar_m1' });
    expect(res.status).toBe(200);
    expect(res.body.artifact).toMatchObject({ kind: 'mirror', id: 'ar_m1', sourceUrl: 'https://example.com' });
  });

  it('mode=mirror crawl failure returns 200 with ok:false and reason', async () => {
    // mock buildMirror returning { ok: false, reason: 'crawl_timeout' }
    const res = await request(app)
      .post('/api/projects/p1/compile')
      .send({ mode: 'mirror', source: { kind: 'url', payload: 'https://e.com' } });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: false, reason: 'crawl_timeout' });
  });

  it('mode=mirror with source.image returns ok:false (image not yet supported in 10a)', async () => {
    const res = await request(app)
      .post('/api/projects/p1/compile')
      .send({ mode: 'mirror', source: { kind: 'image', mimeType: 'image/png', base64: 'x' } });
    expect(res.body).toMatchObject({ ok: false, reason: 'image_source_not_supported' });
  });

  it('mode=ast falls back to existing requirement compile (10a no-op for ast)', async () => {
    const res = await request(app)
      .post('/api/projects/p1/compile')
      .send({ mode: 'ast', source: { kind: 'url', payload: 'https://e.com' }, requirement: 'login page' });
    // Expect existing behavior: pure-text compile path; URL is ignored
    expect(res.status).toBe(200);
    expect(res.body.ast).toBeDefined();
  });
});

describe('GET /:id/artifacts — kind discriminator', () => {
  it('lists both kinds', async () => {
    // ... setup: save an AST artifact + write a mirror meta
    const res = await request(app).get('/api/projects/p1/artifacts');
    expect(res.body.artifacts).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'ast' }),
      expect.objectContaining({ kind: 'mirror' }),
    ]));
  });
});
```

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3: Modify `routes/compile.ts`**

```typescript
import { Router, type Request, type Response } from 'express';
import type { SemanticUIAst } from '@designbridge/ast';
import * as compileService from '../services/compile';
import { listArtifacts, loadArtifact } from '../storage/artifactStore';
import { loadMirrorMeta } from '../storage/mirrorStore';
import { buildMirror } from '../services/mirrorBuilder';

export async function compileHandler(req: Request, res: Response): Promise<void> {
  const mode = req.body?.mode ?? 'pure-text';
  const artifactId = typeof req.body?.artifactId === 'string' && req.body.artifactId.trim() ? req.body.artifactId.trim() : 'artifact';

  if (mode === 'mirror') {
    const source = req.body?.source;
    if (!source || source.kind !== 'url' || typeof source.payload !== 'string') {
      if (source?.kind === 'image') { res.json({ ok: false, reason: 'image_source_not_supported' }); return; }
      res.status(400).json({ error: 'mirror mode requires source.kind="url" and source.payload (string)' });
      return;
    }
    try {
      const result = await buildMirror({ projectId: req.params.id as string, artifactId, url: source.payload });
      if (!result.ok) { res.json({ ok: false, reason: result.reason, detail: result.detail }); return; }
      res.json({ ok: true, artifact: result.meta });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
    return;
  }

  // pure-text and ast (10a: ast falls back to pure-text)
  const requirement = req.body?.requirement;
  if (typeof requirement !== 'string' || requirement.trim().length === 0) {
    res.status(400).json({ error: 'requirement (non-empty string) is required' });
    return;
  }
  try {
    const result = await compileService.compileFromInput({ kind: 'requirement', text: requirement }, { artifactId, projectId: req.params.id as string });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

export function listArtifactsHandler(req: Request, res: Response): void {
  res.json({ artifacts: listArtifacts(req.params.id as string) });
}

export function loadArtifactHandler(req: Request, res: Response): void {
  const projectId = req.params.id as string;
  const artifactId = req.params.artifactId as string;
  // Try AST first, then Mirror
  const ast = loadArtifact(projectId, artifactId);
  if (ast) { res.json({ kind: 'ast', ast }); return; }
  const mirror = loadMirrorMeta(projectId, artifactId);
  if (mirror) { res.json({ kind: 'mirror', mirror }); return; }
  res.status(404).json({ error: 'artifact not found' });
}

// mutateHandler unchanged (Plan 10b extends it for AST-mode with WebpageIngestion).

const router = Router();
router.post('/:id/compile', compileHandler);
router.post('/:id/compile/mutate', mutateHandler);
router.get('/:id/artifacts', listArtifactsHandler);
router.get('/:id/artifacts/:artifactId', loadArtifactHandler);
export default router;
```

- [ ] **Step 4:** Run → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/routes/compile.ts packages/server/src/routes/__tests__/compile.route.test.ts
git commit -m "feat(routes): compile.ts adds mirror branch + kind-aware list (Plan 10a Phase 2)"
```

---

### Task 8: `mirrors.ts` route — serve mirror files

**Files:**
- Create: `packages/server/src/routes/mirrors.ts`
- Create: `packages/server/src/routes/__tests__/mirrors.route.test.ts`
- Modify: `packages/server/src/index.ts` (mount the route)

- [ ] **Step 1: Failing test**

```typescript
// packages/server/src/routes/__tests__/mirrors.route.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeMirrorFiles, saveMirrorMeta } from '../../storage/mirrorStore';
import { mountMirrorsRoute } from '../mirrors';

describe('mirrors route', () => {
  let baseDir: string;
  let app: express.Express;

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), 'mirrors-route-'));
    app = express();
    mountMirrorsRoute(app, { baseDir });
  });

  it('serves page.html with injected <base href>', async () => {
    writeMirrorFiles('p1', 'ar_1', { html: '<html><body><p>hi</p></body></html>', css: '', screenshot: Buffer.from(''), assets: [] }, { baseDir });
    saveMirrorMeta('p1', { kind: 'mirror', id: 'ar_1', sourceUrl: 'https://e.com', sourceType: 'url', crawledAt: '', files: { html: 'page.html', css: 'styles.css', screenshot: 'screenshot.png' }, warnings: [], editable: false }, { baseDir });
    const r = await request(app).get('/api/projects/p1/mirrors/ar_1/page.html');
    expect(r.status).toBe(200);
    expect(r.text).toContain('<base href="/api/projects/p1/mirrors/ar_1/"');
    expect(r.text).toContain('<p>hi</p>');
  });

  it('serves styles.css raw', async () => {
    writeMirrorFiles('p1', 'ar_1', { html: '', css: 'body{color:red}', screenshot: Buffer.from(''), assets: [] }, { baseDir });
    const r = await request(app).get('/api/projects/p1/mirrors/ar_1/styles.css');
    expect(r.status).toBe(200);
    expect(r.text).toBe('body{color:red}');
  });

  it('serves an asset by filename', async () => {
    writeMirrorFiles('p1', 'ar_1', { html: '', css: '', screenshot: Buffer.from(''), assets: [{ filename: 'abc.png', bytes: Buffer.from([1,2,3]) }] }, { baseDir });
    const r = await request(app).get('/api/projects/p1/mirrors/ar_1/assets/abc.png');
    expect(r.status).toBe(200);
    expect(Buffer.compare(r.body, Buffer.from([1,2,3]))).toBe(0);
  });

  it('404 on missing mirror', async () => {
    const r = await request(app).get('/api/projects/p1/mirrors/missing/page.html');
    expect(r.status).toBe(404);
  });

  it('400 on traversal attempt', async () => {
    writeMirrorFiles('p1', 'ar_1', { html: '', css: '', screenshot: Buffer.from(''), assets: [] }, { baseDir });
    const r = await request(app).get('/api/projects/p1/mirrors/ar_1/assets/..%2Fpage.html');
    expect([400, 404]).toContain(r.status); // Express normalizes — either is OK
  });
});
```

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3: Implement**

```typescript
// packages/server/src/routes/mirrors.ts
import type { Express, Request, Response } from 'express';
import { renderMirror } from '@designbridge/codegen';
import { readMirrorFile, loadMirrorMeta } from '../storage/mirrorStore';

export interface MountOpts { baseDir?: string; }

function ctype(filename: string): string {
  if (filename.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filename.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filename.endsWith('.png')) return 'image/png';
  if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) return 'image/jpeg';
  if (filename.endsWith('.svg')) return 'image/svg+xml';
  if (filename.endsWith('.woff')) return 'font/woff';
  if (filename.endsWith('.woff2')) return 'font/woff2';
  return 'application/octet-stream';
}

export function mountMirrorsRoute(app: Express, opts: MountOpts = {}): void {
  app.get('/api/projects/:id/mirrors/:artifactId/page.html', (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const artifactId = req.params.artifactId as string;
    if (!loadMirrorMeta(projectId, artifactId, { baseDir: opts.baseDir })) { res.status(404).end(); return; }
    try {
      const buf = readMirrorFile(projectId, artifactId, 'page.html', { baseDir: opts.baseDir });
      const html = renderMirror({ html: buf.toString('utf8'), baseHref: `/api/projects/${projectId}/mirrors/${artifactId}/` });
      res.type('text/html; charset=utf-8').send(html);
    } catch (err) { res.status(400).json({ error: (err as Error).message }); }
  });

  app.get('/api/projects/:id/mirrors/:artifactId/styles.css', (req, res) => {
    try { res.type(ctype('styles.css')).send(readMirrorFile(req.params.id as string, req.params.artifactId as string, 'styles.css', { baseDir: opts.baseDir })); }
    catch { res.status(404).end(); }
  });

  app.get('/api/projects/:id/mirrors/:artifactId/screenshot.png', (req, res) => {
    try { res.type('image/png').send(readMirrorFile(req.params.id as string, req.params.artifactId as string, 'screenshot.png', { baseDir: opts.baseDir })); }
    catch { res.status(404).end(); }
  });

  app.get('/api/projects/:id/mirrors/:artifactId/assets/:filename', (req, res) => {
    const filename = req.params.filename as string;
    try { res.type(ctype(filename)).send(readMirrorFile(req.params.id as string, req.params.artifactId as string, `assets/${filename}`, { baseDir: opts.baseDir })); }
    catch (err) { res.status(400).json({ error: (err as Error).message }); }
  });
}
```

- [ ] **Step 4: Mount in `packages/server/src/index.ts`**

Find where other routes are mounted and add:

```typescript
import { mountMirrorsRoute } from './routes/mirrors';
// ...
mountMirrorsRoute(app);
```

- [ ] **Step 5:** Run all server tests → PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/routes/mirrors.ts packages/server/src/routes/__tests__/mirrors.route.test.ts packages/server/src/index.ts
git commit -m "feat(routes): mirrors.ts — serve page.html/css/assets with traversal guard (Plan 10a Phase 2)"
```

---

## Phase 3 — Client UI

### Task 9: Extend `lib/api.ts` + `useCompilerStore`

**Files:**
- Modify: `packages/client/src/lib/api.ts`
- Modify: `packages/client/src/stores/useCompilerStore.ts`

- [ ] **Step 1: Failing test (store)**

Add a test asserting that the store can hold mirror artifacts in its list and that `getMirrorUrl(projectId, artifactId)` returns the expected path. Use Vitest + existing store-test patterns.

```typescript
// packages/client/src/stores/__tests__/useCompilerStore.mirror.test.ts
import { describe, it, expect } from 'vitest';
import { useCompilerStore } from '../useCompilerStore';

describe('useCompilerStore — mirror', () => {
  it('stores mirror artifact entries with kind discriminator', () => {
    const { setArtifacts } = useCompilerStore.getState();
    setArtifacts([{ id: 'ar_a', kind: 'ast' }, { id: 'ar_m', kind: 'mirror', sourceUrl: 'https://e.com' }]);
    const list = useCompilerStore.getState().artifacts;
    expect(list).toEqual([
      { id: 'ar_a', kind: 'ast' },
      { id: 'ar_m', kind: 'mirror', sourceUrl: 'https://e.com' },
    ]);
  });
});
```

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3: Update the store**

Adjust `useCompilerStore.ts` artifact list type to a discriminated union:

```typescript
export type ArtifactListItem =
  | { id: string; kind: 'ast' }
  | { id: string; kind: 'mirror'; sourceUrl?: string };

interface State {
  // ...
  artifacts: ArtifactListItem[];
  setArtifacts: (items: ArtifactListItem[]) => void;
  // ...
}
```

Add a setter if missing.

- [ ] **Step 4: Add `getMirrorUrl` and `compile` overload in `lib/api.ts`**

```typescript
export function getMirrorUrl(projectId: string, artifactId: string, file: 'page.html' | 'styles.css' | 'screenshot.png' = 'page.html'): string {
  return `/api/projects/${encodeURIComponent(projectId)}/mirrors/${encodeURIComponent(artifactId)}/${file}`;
}

export interface CompileMirrorRequest { mode: 'mirror'; source: { kind: 'url'; payload: string }; artifactId?: string; }
export interface CompileTextRequest { mode?: 'pure-text' | 'ast'; requirement: string; artifactId?: string; }
export type CompileRequest = CompileMirrorRequest | CompileTextRequest;

export async function compile(projectId: string, body: CompileRequest): Promise<CompileResponse> {
  const r = await fetch(`/api/projects/${encodeURIComponent(projectId)}/compile`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  return r.json();
}
```

- [ ] **Step 5:** Run tests → PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/lib/api.ts packages/client/src/stores/useCompilerStore.ts packages/client/src/stores/__tests__/useCompilerStore.mirror.test.ts
git commit -m "feat(client): api + store support mirror kind (Plan 10a Phase 3)"
```

---

### Task 10: `MirrorIntentCard.tsx`

**Files:**
- Create: `packages/client/src/components/compiler/MirrorIntentCard.tsx`
- Create: `packages/client/src/components/compiler/__tests__/MirrorIntentCard.test.tsx`

- [ ] **Step 1: Failing test**

```typescript
// packages/client/src/components/compiler/__tests__/MirrorIntentCard.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MirrorIntentCard from '../MirrorIntentCard';

describe('MirrorIntentCard', () => {
  it('renders detected URL + two mode options', () => {
    render(<MirrorIntentCard source={{ kind: 'url', payload: 'https://stripe.com/pricing' }} suggestedMode={undefined} onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByText(/https:\/\/stripe\.com\/pricing/)).toBeTruthy();
    expect(screen.getByLabelText(/Mirror/i)).toBeTruthy();
    expect(screen.getByLabelText(/AST/i)).toBeTruthy();
  });

  it('pre-selects Mirror when suggestedMode is mirror', () => {
    render(<MirrorIntentCard source={{ kind: 'url', payload: 'x' }} suggestedMode="mirror" onConfirm={() => {}} onCancel={() => {}} />);
    expect((screen.getByLabelText(/Mirror/i) as HTMLInputElement).checked).toBe(true);
  });

  it('confirm calls callback with selected mode', () => {
    const onConfirm = vi.fn();
    render(<MirrorIntentCard source={{ kind: 'url', payload: 'x' }} suggestedMode="mirror" onConfirm={onConfirm} onCancel={() => {}} />);
    fireEvent.click(screen.getByText(/Confirm/i));
    expect(onConfirm).toHaveBeenCalledWith('mirror');
  });

  it('cancel calls onCancel', () => {
    const onCancel = vi.fn();
    render(<MirrorIntentCard source={{ kind: 'url', payload: 'x' }} suggestedMode={undefined} onConfirm={() => {}} onCancel={onCancel} />);
    fireEvent.click(screen.getByText(/Cancel/i));
    expect(onCancel).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3: Implement**

```tsx
// packages/client/src/components/compiler/MirrorIntentCard.tsx
import { useState } from 'react';

export interface MirrorIntentCardProps {
  source: { kind: 'url'; payload: string } | { kind: 'image'; mimeType: string; base64: string };
  suggestedMode: 'mirror' | 'ast' | undefined;
  onConfirm: (mode: 'mirror' | 'ast') => void;
  onCancel: () => void;
}

export default function MirrorIntentCard({ source, suggestedMode, onConfirm, onCancel }: MirrorIntentCardProps): JSX.Element {
  const [mode, setMode] = useState<'mirror' | 'ast' | null>(suggestedMode ?? null);

  return (
    <div
      style={{
        border: '1px solid var(--border-primary, #e2e8f0)', borderRadius: 8, padding: 12, margin: '8px 0',
        background: 'var(--bg-secondary, #fff)', fontSize: 13,
      }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 8 }}>
        {source.kind === 'url'
          ? <div style={{ fontSize: 12, color: 'var(--text-secondary, #64748b)' }}>Detected URL: <code>{source.payload}</code></div>
          : <img src={`data:${source.mimeType};base64,${source.base64.slice(0, 200)}`} alt="" style={{ maxWidth: 120, maxHeight: 80, borderRadius: 4 }} />}
      </div>
      <div style={{ marginBottom: 8 }}>Reproduce as:</div>
      <label style={{ display: 'block', marginBottom: 4 }}>
        <input type="radio" name="mirror-mode" checked={mode === 'mirror'} onChange={() => setMode('mirror')} /> Mirror — 1:1, not editable
      </label>
      <label style={{ display: 'block', marginBottom: 8 }}>
        <input type="radio" name="mirror-mode" checked={mode === 'ast'} onChange={() => setMode('ast')} /> AST — ~95%, chat-editable
      </label>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button onClick={onCancel}>Cancel</button>
        <button onClick={() => mode && onConfirm(mode)} disabled={mode === null}>Confirm</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4:** Run → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/compiler/MirrorIntentCard.tsx packages/client/src/components/compiler/__tests__/MirrorIntentCard.test.tsx
git commit -m "feat(client): MirrorIntentCard — inline mirror/ast picker (Plan 10a Phase 3)"
```

---

### Task 11: `CompilerChat` URL detect + intent card hookup

**Files:**
- Modify: `packages/client/src/components/compiler/CompilerChat.tsx`
- Modify: `packages/client/src/components/compiler/__tests__/CompilerChat.test.tsx` (or create if absent)

Detect URL pattern in the chat input. When the user clicks Send and a URL is present, render `MirrorIntentCard` inline instead of submitting. After confirm:
- `mode === 'mirror'`: call `compile(projectId, { mode: 'mirror', source })`
- `mode === 'ast'`: in 10a, fall back to the existing requirement compile (the URL is ignored — Plan 10b will wire it). Show a small note in chat: "AST mode for URLs lands in Plan 10b — falling back to text-only generation."

- [ ] **Step 1: Failing test**

```typescript
describe('CompilerChat — mirror flow', () => {
  it('shows MirrorIntentCard when input contains a URL and user clicks Send', async () => {
    render(<CompilerChat />);
    const input = screen.getByPlaceholderText(/describe/i) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'https://stripe.com' } });
    fireEvent.click(screen.getByText(/Send/i));
    expect(await screen.findByText(/Reproduce as/i)).toBeTruthy();
  });

  it('confirm Mirror calls api.compile with mode=mirror', async () => {
    const compileSpy = vi.spyOn(api, 'compile').mockResolvedValue({ ok: true, artifact: { kind: 'mirror', id: 'ar_1', sourceUrl: 'https://x' } } as any);
    render(<CompilerChat />);
    fireEvent.change(screen.getByPlaceholderText(/describe/i), { target: { value: 'mirror this https://x' } });
    fireEvent.click(screen.getByText(/Send/i));
    fireEvent.click(await screen.findByText(/Confirm/i));
    await waitFor(() => expect(compileSpy).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ mode: 'mirror', source: { kind: 'url', payload: 'https://x' } })));
  });
});
```

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3: Modify `CompilerChat.tsx`**

Sketch (preserve existing chat features):

```tsx
import { useState } from 'react';
import MirrorIntentCard from './MirrorIntentCard';
import * as api from '../../lib/api';
import { useCompilerStore } from '../../stores/useCompilerStore';

const URL_RE = /https?:\/\/[^\s<>"']+/;
const MIRROR_HINTS = [/照著抄/, /完整複製/, /仿這個/, /1\s*:\s*1/, /mirror/i, /pixel[-\s]*perfect/i];
const AST_HINTS = [/參考/, /像這個風格/, /套這個感/, /inspired\s*by/i];

export default function CompilerChat(): JSX.Element {
  const [text, setText] = useState('');
  const [pending, setPending] = useState<null | { source: { kind: 'url'; payload: string }; suggestedMode: 'mirror' | 'ast' | undefined }>(null);
  const projectId = useCompilerStore(s => s.projectId);
  const refreshArtifacts = useCompilerStore(s => s.refreshArtifacts);

  function suggested(t: string): 'mirror' | 'ast' | undefined {
    if (MIRROR_HINTS.some(r => r.test(t))) return 'mirror';
    if (AST_HINTS.some(r => r.test(t))) return 'ast';
    return undefined;
  }

  function onSend(): void {
    const m = text.match(URL_RE);
    if (m && projectId) {
      setPending({ source: { kind: 'url', payload: m[0] }, suggestedMode: suggested(text) });
      return;
    }
    // pure-text path (existing)
    void api.compile(projectId!, { mode: 'pure-text', requirement: text }).then(() => refreshArtifacts());
    setText('');
  }

  async function onConfirm(mode: 'mirror' | 'ast'): Promise<void> {
    if (!projectId || !pending) return;
    if (mode === 'mirror') {
      await api.compile(projectId, { mode: 'mirror', source: pending.source });
    } else {
      // 10a fallback: requirement only
      await api.compile(projectId, { mode: 'pure-text', requirement: text });
    }
    setText(''); setPending(null); await refreshArtifacts();
  }

  return (
    <div>
      {/* existing message list... */}
      {pending && (
        <MirrorIntentCard source={pending.source} suggestedMode={pending.suggestedMode} onConfirm={onConfirm} onCancel={() => setPending(null)} />
      )}
      <textarea value={text} onChange={e => setText(e.target.value)} placeholder="describe what you want…" />
      <button onClick={onSend}>Send</button>
    </div>
  );
}
```

- [ ] **Step 4:** Run → PASS. Existing CompilerChat tests still green.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/compiler/CompilerChat.tsx packages/client/src/components/compiler/__tests__/CompilerChat.test.tsx
git commit -m "feat(client): CompilerChat detects URL + invokes MirrorIntentCard (Plan 10a Phase 3)"
```

---

### Task 12: `ArtifactRail` 🔒 + `PreviewPane` mirror mode + `InspectorPane` mirror metadata + upgrade stub

**Files:**
- Modify: `packages/client/src/components/compiler/ArtifactRail.tsx`
- Modify: `packages/client/src/components/compiler/PreviewPane.tsx`
- Modify: `packages/client/src/components/compiler/InspectorPane.tsx`

- [ ] **Step 1: Tests**

Add or extend snapshot/behavior tests:

- `ArtifactRail`: mirror item renders a 🔒 prefix.
- `PreviewPane`: when active artifact has `kind === 'mirror'`, renders `<iframe src={getMirrorUrl(...)}>`.
- `InspectorPane`: mirror artifact shows `sourceUrl` and a disabled `Upgrade to AST` button with a tooltip.

(Reuse existing test scaffolding — `render(<X />)` + assertions.)

- [ ] **Step 2:** Implement changes:

```tsx
// ArtifactRail.tsx — minimal patch
{artifacts.map(a => (
  <button key={a.id} onClick={() => selectArtifact(a.id)}>
    {a.kind === 'mirror' && <span title="Mirror — read-only" style={{ marginRight: 4 }}>🔒</span>}
    {a.id}
  </button>
))}
```

```tsx
// PreviewPane.tsx — minimal patch
import { getMirrorUrl } from '../../lib/api';
// ...
const active = useCompilerStore(s => s.activeArtifact);
if (active?.kind === 'mirror' && projectId) {
  return <iframe src={getMirrorUrl(projectId, active.id)} title="Mirror preview" style={{ width: '100%', height: '100%', border: 0 }} sandbox="allow-same-origin" />;
}
// existing PreviewHtml flow continues for ast
```

```tsx
// InspectorPane.tsx — minimal patch
if (active?.kind === 'mirror') {
  return (
    <div>
      <div>Source: <a href={active.sourceUrl} target="_blank" rel="noreferrer">{active.sourceUrl}</a></div>
      <div>Crawled: {active.crawledAt}</div>
      {active.warnings?.length > 0 && <div>Warnings: {active.warnings.length}</div>}
      <button disabled title="Available after Plan 10b">Upgrade to AST</button>
    </div>
  );
}
```

- [ ] **Step 3:** Run client tests + manual visual confirm in the browser: `pnpm dev:client` + `pnpm dev:server`, create a fake mirror artifact via API directly (curl) or wait for Phase 4 E2E.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/components/compiler/
git commit -m "feat(client): rail 🔒, preview iframe, inspector mirror panel + upgrade stub (Plan 10a Phase 3)"
```

---

## Phase 4 — E2E + verify

### Task 13: `compiler-mirror-journey.spec.ts`

**Files:**
- Create: `packages/e2e/tests/e2e/compiler-mirror-journey.spec.ts`

Route-mocked. Does NOT hit a real site or run the real crawler.

- [ ] **Step 1: Write the spec**

```typescript
// packages/e2e/tests/e2e/compiler-mirror-journey.spec.ts
import { test, expect } from '@playwright/test';

test('compiler mirror journey — paste URL → MirrorIntentCard → mirror artifact in rail', async ({ page }) => {
  await page.route('**/api/projects/*/compile', async route => {
    const body = await route.request().postDataJSON();
    if (body?.mode === 'mirror') {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ ok: true, artifact: { kind: 'mirror', id: 'ar_mirror_1', sourceUrl: body.source.payload, sourceType: 'url', crawledAt: new Date().toISOString(), files: { html: 'page.html', css: 'styles.css', screenshot: 'screenshot.png' }, warnings: [], editable: false } }),
      });
    } else { await route.continue(); }
  });
  await page.route('**/api/projects/*/artifacts', route => route.fulfill({ status: 200, body: JSON.stringify({ artifacts: [{ id: 'ar_mirror_1', kind: 'mirror', sourceUrl: 'https://example.com' }] }) }));
  await page.route('**/api/projects/*/mirrors/ar_mirror_1/page.html', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body><h1>Mirrored page</h1></body></html>' }));

  await page.goto('/project/p1');
  await page.locator('textarea').fill('mirror this https://example.com');
  await page.getByText(/Send/i).click();
  await expect(page.getByText(/Reproduce as/i)).toBeVisible();
  await page.getByLabel(/Mirror/i).check();
  await page.getByText(/Confirm/i).click();
  await expect(page.locator('text=ar_mirror_1')).toBeVisible();
  await expect(page.frameLocator('iframe[title="Mirror preview"]').locator('h1')).toHaveText('Mirrored page');
});
```

- [ ] **Step 2:** Run E2E locally: `pnpm test:e2e -- compiler-mirror-journey` → PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/e2e/tests/e2e/compiler-mirror-journey.spec.ts
git commit -m "test(e2e): compiler-mirror-journey route-mocked (Plan 10a Phase 4)"
```

---

### Task 14: Final verify + manual smoke

- [ ] `pnpm --filter @designbridge/ast build && pnpm --filter @designbridge/codegen build && pnpm --filter server build && pnpm --filter client build` → all green.
- [ ] `pnpm --filter @designbridge/codegen test && pnpm --filter server test && pnpm --filter client test` → all green.
- [ ] `pnpm test:e2e -- compiler-mirror-journey` → green.
- [ ] **Manual smoke**: `pnpm dev:server` + `pnpm dev:client`. In browser:
  - Open a new project.
  - Paste `https://example.com` (a tiny known-good static page).
  - Confirm MirrorIntentCard appears, pick Mirror, Confirm.
  - Artifact rail shows new entry with 🔒.
  - Preview pane shows the mirrored page inside an iframe.
  - Inspector shows source URL + disabled "Upgrade to AST" button.
- [ ] **Record observations** (Mirror visual fidelity, any visible asset breaks) in the PR description / memory.

## Acceptance Criteria

- [ ] `classifyIntent`, `parseWebpage`, `mirrorBuilder`, `mirrorStore`, `renderMirror` all green.
- [ ] `POST /api/projects/:id/compile { mode: 'mirror', source: {...} }` returns Mirror metadata, sidecar files written.
- [ ] `GET /api/projects/:id/mirrors/:artifactId/page.html` returns HTML with `<base href>` injected.
- [ ] `GET /api/projects/:id/artifacts` returns kind discriminator.
- [ ] Client UI: URL detection in chat, MirrorIntentCard renders, Mirror artifact appears in rail with 🔒, PreviewPane iframe loads.
- [ ] `compiler-mirror-journey.spec.ts` passes.
- [ ] Manual browser smoke confirms "looks like the source page" against at least one real URL.
- [ ] Existing pure-text compile flow has 0 regression (all existing Plan 6a tests green).

## Risks / Notes

1. **`cheerio`** is the only new server dep. Keep it; needed for robust HTML rewriting.
2. **Asset rewriting via `String.replace(new RegExp(escapedUrl, 'g'))`** is naïve but works for the URLs we collect (they're exact-match strings extracted from the same document). If we later see false positives (e.g. partial-substring matches), upgrade to a parser-based rewrite.
3. **`<base href>`** is injected at serve time, NOT at build time, so the stored `page.html` stays portable.
4. **Asset concurrency** capped at 6 to avoid overwhelming the target site.
5. **No retry on asset 404** — recorded as warning. Plan 10a's Mirror is best-effort; warnings let the user spot broken assets.
6. **Cheerio + cheerio.html() round-trip** can subtly normalize attributes (e.g. attribute quoting). Acceptable for Mirror — visual identity is the goal, not byte-perfect HTML reproduction.
7. **Iframe sandbox**: `sandbox="allow-same-origin"` only — no scripts (already stripped) and no top-navigation. If a Mirror's CSS depends on web fonts hosted on the source domain, those will load when allow-same-origin is granted; that's intentional.
8. **`crawlWebsiteRaw` shares the singleton `browserInstance`** with `crawlWebsite`. Existing concurrency cap `MAX_BROWSER_SESSIONS` applies. No changes needed there.
9. **Backward compatibility**: `listArtifacts` shape change is a breaking change but only `compile.ts` route consumed it. Client code was already shaped around `{ id, kind }` in the new useCompilerStore.

---

**Plan end.**
