# Plan 10b — AST Mode + Theme Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AST mode actually do something useful when given a URL: (1) feed the cached `WebpageIngestion` from Plan 10a's `parseWebpage` into the existing `buildColdStart` semantic builder so the AI produces a `SemanticUIAst` that reproduces the page ~95% in editable form; (2) in parallel, extract a `ThemeProposal` (palette / typography / radius / shadow) from the same ingestion; (3) surface the proposal in a `ThemeMergeDialog` so the user can write `projects/<id>/theme.json`; (4) wire the "Upgrade to AST" button on a Mirror artifact to reuse the cached ingestion and produce a sibling AST artifact (the Mirror stays).

**Architecture:** AST mode in `routes/compile.ts` adds a `source.kind === 'url'` branch that runs `parseWebpage` (cache hit if the URL was already crawled by a recent Mirror — same artifact dir holds the screenshot which we hash-key to detect prior crawl), then calls `buildColdStart` with an extended Ingestion AST consumer (Plan 3's builder is currently `requirement`-only; this plan extends it to accept `webpage`). The compile response gains an optional `themeProposal` field; the client shows `ThemeMergeDialog` when present. `theme.json` lives at `projects/<id>/theme.json` and is managed by a tiny `themeStore.ts`. Mirror→AST upgrade is a POST endpoint that internally reuses the same compile pipeline.

**Tech Stack:** TS 5.6 strict, Vitest 3.2.4, Express. Uses `@designbridge/ast` + existing `semantic/buildColdStart`. No new deps.

**Spec:** `docs/superpowers/specs/2026-05-29-plan-10-design-intelligence-design.md` §2.3 (`ast + url` row), §2.4 (Upgrade to AST), §2.5 (ThemeMergeDialog), §3.3 (theme.json shape), §3.4 (index unchanged from 10a), §4 (themeExtractor, themeMerger, ThemeMergeDialog), §6 (ast+url branch), §7 (rows 6-9: AST repair exhausted / theme conflict / mirrorStore write fail — last two), §8 (ast+URL + upgrade-to-ast rows), §9 (AST DoD + Upgrade DoD).

**Scope boundary (out of plan):**
- **No screenshot input.** That's Plan 10c.
- **No vision call.** The semantic builder gets the DOM (text), not the screenshot bytes.
- **No theme rules / style-aware `SkillRule.assert` predicates.** Spec §1.3 deferred to Plan 11+.
- **No retroactive theme application.** `theme.json` only affects future compiles.
- **No code change to consume `theme.json` in `renderVue` / `renderVueProduction` codegen.** Plan 10b writes `theme.json`; *reading* it in codegen is left as a `theme-tokens-consumption` follow-up (acknowledged in §10 of the design spec). Recommend filing it as a small standalone plan once 10b is merged.
- **Mirror ingestion caching:** to avoid re-crawling on Upgrade, this plan adds a tiny `ingestionCache` keyed by `(projectId, sourceUrl)` that stores the parsed `WebpageIngestion` for 24h. Not a full ingestion-persistence subsystem.

---

## File Structure

```
packages/server/
  src/semantic/
    buildColdStart.ts                    ← MODIFY: accept WebpageIngestion in addition to RequirementIngestion
    __tests__/
      buildColdStart.webpage.test.ts     ← NEW
  src/services/
    themeExtractor.ts                    ← NEW (≈90 LoC) — deterministic, no AI
    themeMerger.ts                       ← NEW (≈70 LoC)
    ingestionCache.ts                    ← NEW (≈60 LoC) — in-memory TTL cache
    __tests__/
      themeExtractor.test.ts             ← NEW
      themeMerger.test.ts                ← NEW
      ingestionCache.test.ts             ← NEW
  src/storage/
    themeStore.ts                        ← NEW (≈50 LoC)
    __tests__/
      themeStore.test.ts                 ← NEW
  src/routes/
    compile.ts                           ← MODIFY: ast+url branch, themeProposal in response
    mirrors.ts                           ← MODIFY: add POST /upgrade-to-ast
    theme.ts                             ← NEW (≈60 LoC) — GET/PUT project theme.json
    __tests__/
      compile.route.test.ts              ← MODIFY (ast+url branch tests)
      mirrors.route.test.ts              ← MODIFY (upgrade-to-ast tests)
      theme.route.test.ts                ← NEW

packages/client/
  src/lib/api.ts                         ← MODIFY: compile() ast+url, getTheme, putTheme, upgradeMirrorToAst
  src/stores/useCompilerStore.ts         ← MODIFY: pendingThemeProposal state
  src/components/compiler/
    ThemeMergeDialog.tsx                 ← NEW (≈140 LoC)
    InspectorPane.tsx                    ← MODIFY: enable Upgrade button
    CompilerChat.tsx                     ← MODIFY: AST option does real ast+url compile, opens ThemeMergeDialog on response
    __tests__/
      ThemeMergeDialog.test.tsx          ← NEW
```

---

## Phase 1 — Theme extraction (pure functions, no I/O)

### Task 1: `themeExtractor` — WebpageIngestion → ThemeProposal

**Files:**
- Create: `packages/server/src/services/themeExtractor.ts`
- Create: `packages/server/src/services/__tests__/themeExtractor.test.ts`

`themeExtractor` reads the same data shapes the legacy `websiteCrawler.aggregateStyles()` produces (already a deterministic-stats job). But we want it tied to the *new* `WebpageIngestion` + a fresh `RawCrawlResult.html` parse so the AST and theme paths share one crawl. Implementation reuses the same DOM-walk technique cheerio gives us.

- [ ] **Step 1: Failing test**

```typescript
// packages/server/src/services/__tests__/themeExtractor.test.ts
import { describe, it, expect } from 'vitest';
import { extractTheme, type ThemeProposal } from '../themeExtractor';

describe('extractTheme', () => {
  it('extracts palette / typography / radius / shadow from a simple DOM + inline CSS', () => {
    const dom = '<html><body style="background:#1A73E8;color:#fff;font-family:Inter,sans-serif;font-size:16px"><h1 style="font-size:48px;font-weight:700;border-radius:8px;box-shadow:0 1px 2px rgba(0,0,0,0.05)">Title</h1></body></html>';
    const css = 'h1{border-radius:8px}';
    const out = extractTheme({ dom, css, sourceUrl: 'https://e.com' });
    expect(out.palette.map(p => p.value)).toEqual(expect.arrayContaining(['#1a73e8', '#ffffff']));
    expect(out.typography.primaryFont).toBe('Inter');
    expect(out.typography.headings.find(h => h.tag === 'h1')).toMatchObject({ fontSize: '48px', fontWeight: '700' });
    expect(out.radius).toContain('8px');
    expect(out.shadow.length).toBeGreaterThan(0);
  });

  it('returns empty arrays when nothing extractable, not crashes', () => {
    const out = extractTheme({ dom: '<html></html>', css: '', sourceUrl: 'https://e.com' });
    expect(out.palette).toEqual([]);
    expect(out.typography.primaryFont).toBeNull();
    expect(out.radius).toEqual([]);
  });
});
```

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3: Implement**

```typescript
// packages/server/src/services/themeExtractor.ts
import * as cheerio from 'cheerio';

export interface ThemeProposalPalette { name?: string; value: string; source?: string; }
export interface ThemeProposalHeading { tag: string; fontSize: string; fontWeight: string; }
export interface ThemeProposalBody { fontFamily: string; fontSize: string; lineHeight?: string; }
export interface ThemeProposal {
  palette: ThemeProposalPalette[];
  typography: { primaryFont: string | null; secondaryFont: string | null; headings: ThemeProposalHeading[]; body: ThemeProposalBody | null; };
  radius: string[];
  shadow: string[];
  source: string;
}

const HEX = /#[0-9a-f]{3,8}\b/gi;
const RGB = /rgba?\([^)]+\)/gi;
const FONT = /font-family\s*:\s*([^;]+);?/gi;
const FONT_SIZE = /font-size\s*:\s*([^;]+);?/gi;
const RADIUS = /border-radius\s*:\s*([^;]+);?/gi;
const SHADOW = /box-shadow\s*:\s*([^;]+);?/gi;

function rgbToHex(rgb: string): string | null {
  const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return null;
  const [r, g, b] = [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])];
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toLowerCase();
}

function normHex(c: string): string { return c.toLowerCase().padEnd(7, '0').slice(0, 7); }

export function extractTheme(params: { dom: string; css: string; sourceUrl: string }): ThemeProposal {
  const $ = cheerio.load(params.dom);
  const styles: string[] = [params.css];
  $('[style]').each((_, el) => styles.push($(el).attr('style') || ''));
  const allCss = styles.join('\n');

  const colorSet = new Set<string>();
  for (const m of allCss.matchAll(HEX)) colorSet.add(normHex(m[0]));
  for (const m of allCss.matchAll(RGB)) { const hex = rgbToHex(m[0]); if (hex) colorSet.add(hex); }

  const fontCounts = new Map<string, number>();
  for (const m of allCss.matchAll(FONT)) {
    const primary = m[1].split(',')[0].trim().replace(/['"]/g, '');
    if (primary && primary.length < 60) fontCounts.set(primary, (fontCounts.get(primary) ?? 0) + 1);
  }
  const sortedFonts = [...fontCounts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);

  const headings: ThemeProposalHeading[] = [];
  for (const tag of ['h1','h2','h3','h4','h5','h6']) {
    const el = $(tag).first();
    if (!el.length) continue;
    const style = el.attr('style') || '';
    const fs = style.match(/font-size\s*:\s*([^;]+)/)?.[1]?.trim() || '';
    const fw = style.match(/font-weight\s*:\s*([^;]+)/)?.[1]?.trim() || '';
    if (fs || fw) headings.push({ tag, fontSize: fs, fontWeight: fw });
  }

  const bodyEl = $('body').first();
  const bodyStyle = bodyEl.attr('style') || '';
  const bodyFont = bodyStyle.match(/font-family\s*:\s*([^;]+)/)?.[1]?.split(',')[0]?.trim().replace(/['"]/g, '');
  const body: ThemeProposalBody | null = bodyFont ? { fontFamily: bodyFont, fontSize: bodyStyle.match(/font-size\s*:\s*([^;]+)/)?.[1]?.trim() || '16px', lineHeight: bodyStyle.match(/line-height\s*:\s*([^;]+)/)?.[1]?.trim() } : null;

  const radii = new Set<string>();
  for (const m of allCss.matchAll(RADIUS)) {
    for (const v of m[1].trim().split(/\s+/)) if (/^\d+(\.\d+)?(px|rem|em|%)$/.test(v)) radii.add(v);
  }
  const shadows = new Set<string>();
  for (const m of allCss.matchAll(SHADOW)) { const v = m[1].trim(); if (v && v !== 'none') shadows.add(v); }

  return {
    palette: [...colorSet].slice(0, 20).map(value => ({ value, source: params.sourceUrl })),
    typography: { primaryFont: sortedFonts[0] ?? null, secondaryFont: sortedFonts[1] ?? null, headings, body },
    radius: [...radii].slice(0, 8),
    shadow: [...shadows].slice(0, 5),
    source: params.sourceUrl,
  };
}
```

- [ ] **Step 4:** Re-run → PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/services/themeExtractor.ts packages/server/src/services/__tests__/themeExtractor.test.ts
git commit -m "feat(theme): themeExtractor — deterministic DOM/CSS → ThemeProposal (Plan 10b Phase 1)"
```

---

### Task 2: `themeMerger` — proposal + current + user picks → merged

**Files:**
- Create: `packages/server/src/services/themeMerger.ts`
- Create: `packages/server/src/services/__tests__/themeMerger.test.ts`

- [ ] **Step 1: Failing test**

```typescript
// packages/server/src/services/__tests__/themeMerger.test.ts
import { describe, it, expect } from 'vitest';
import { mergeTheme, type ThemeFile, type ThemeMergeChoice } from '../themeMerger';
import type { ThemeProposal } from '../themeExtractor';

const proposal: ThemeProposal = {
  palette: [{ value: '#aabbcc', source: 'x' }],
  typography: { primaryFont: 'Inter', secondaryFont: null, headings: [{ tag: 'h1', fontSize: '32px', fontWeight: '700' }], body: { fontFamily: 'Inter', fontSize: '16px' } },
  radius: ['4px'],
  shadow: ['0 1px 2px rgba(0,0,0,0.05)'],
  source: 'https://e.com',
};

describe('mergeTheme', () => {
  it('take-new replaces a section entirely', () => {
    const current: ThemeFile = { schemaVersion: 1, updatedAt: 'x', palette: [{ value: '#000', source: 'old' }], typography: { primaryFont: 'OldFont', secondaryFont: null, headings: [], body: null }, radius: [], shadow: [] };
    const choice: ThemeMergeChoice = { palette: 'take-new', typography: 'keep', radius: 'keep', shadow: 'keep' };
    const out = mergeTheme(current, proposal, choice);
    expect(out.palette).toEqual([{ value: '#aabbcc', source: 'x' }]);
    expect(out.typography.primaryFont).toBe('OldFont'); // kept
  });

  it('union merges palette deduped', () => {
    const current: ThemeFile = { schemaVersion: 1, updatedAt: 'x', palette: [{ value: '#aabbcc', source: 'old' }, { value: '#112233', source: 'old' }], typography: { primaryFont: null, secondaryFont: null, headings: [], body: null }, radius: [], shadow: [] };
    const choice: ThemeMergeChoice = { palette: 'union', typography: 'keep', radius: 'keep', shadow: 'keep' };
    const out = mergeTheme(current, proposal, choice);
    expect(out.palette.map(p => p.value).sort()).toEqual(['#112233', '#aabbcc']);
  });

  it('null current creates a new file from proposal where take-new selected', () => {
    const choice: ThemeMergeChoice = { palette: 'take-new', typography: 'take-new', radius: 'take-new', shadow: 'take-new' };
    const out = mergeTheme(null, proposal, choice);
    expect(out.palette[0].value).toBe('#aabbcc');
    expect(out.typography.primaryFont).toBe('Inter');
    expect(out.radius).toEqual(['4px']);
    expect(out.shadow.length).toBe(1);
  });
});
```

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3: Implement**

```typescript
// packages/server/src/services/themeMerger.ts
import type { ThemeProposal, ThemeProposalPalette, ThemeProposalHeading, ThemeProposalBody } from './themeExtractor';

export interface ThemeFile {
  schemaVersion: 1;
  updatedAt: string;
  palette: ThemeProposalPalette[];
  typography: { primaryFont: string | null; secondaryFont: string | null; headings: ThemeProposalHeading[]; body: ThemeProposalBody | null; };
  radius: string[];
  shadow: string[];
}

export type Section = 'palette' | 'typography' | 'radius' | 'shadow';
export type SectionChoice = 'take-new' | 'keep' | 'union';
export type ThemeMergeChoice = Record<Section, SectionChoice>;

function dedupBy<T>(arr: T[], key: (x: T) => string): T[] {
  const seen = new Set<string>(); const out: T[] = [];
  for (const x of arr) { const k = key(x); if (!seen.has(k)) { seen.add(k); out.push(x); } }
  return out;
}

export function mergeTheme(current: ThemeFile | null, proposal: ThemeProposal, choice: ThemeMergeChoice): ThemeFile {
  const cur: ThemeFile = current ?? {
    schemaVersion: 1, updatedAt: '', palette: [],
    typography: { primaryFont: null, secondaryFont: null, headings: [], body: null }, radius: [], shadow: [],
  };
  const palette = choice.palette === 'keep' ? cur.palette
    : choice.palette === 'take-new' ? proposal.palette
    : dedupBy([...cur.palette, ...proposal.palette], p => p.value);
  const typography = choice.typography === 'keep' ? cur.typography
    : choice.typography === 'take-new' ? proposal.typography
    : {
        primaryFont: cur.typography.primaryFont ?? proposal.typography.primaryFont,
        secondaryFont: cur.typography.secondaryFont ?? proposal.typography.secondaryFont,
        headings: dedupBy([...cur.typography.headings, ...proposal.typography.headings], h => h.tag),
        body: cur.typography.body ?? proposal.typography.body,
      };
  const radius = choice.radius === 'keep' ? cur.radius
    : choice.radius === 'take-new' ? proposal.radius
    : [...new Set([...cur.radius, ...proposal.radius])];
  const shadow = choice.shadow === 'keep' ? cur.shadow
    : choice.shadow === 'take-new' ? proposal.shadow
    : [...new Set([...cur.shadow, ...proposal.shadow])];

  return { schemaVersion: 1, updatedAt: new Date().toISOString(), palette, typography, radius, shadow };
}
```

- [ ] **Step 4:** Re-run → PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/services/themeMerger.ts packages/server/src/services/__tests__/themeMerger.test.ts
git commit -m "feat(theme): themeMerger — section-wise take-new/keep/union (Plan 10b Phase 1)"
```

---

### Task 3: `themeStore` — read/write project theme.json

**Files:**
- Create: `packages/server/src/storage/themeStore.ts`
- Create: `packages/server/src/storage/__tests__/themeStore.test.ts`

- [ ] **Step 1: Failing test**

```typescript
// packages/server/src/storage/__tests__/themeStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveTheme, loadTheme, type ThemeFile } from '../themeStore';

describe('themeStore', () => {
  let baseDir: string;
  beforeEach(() => { baseDir = mkdtempSync(join(tmpdir(), 'themestore-')); });

  it('loads null when no theme yet', () => { expect(loadTheme('p1', { baseDir })).toBeNull(); });

  it('save then load round-trips', () => {
    const theme: ThemeFile = { schemaVersion: 1, updatedAt: 'x', palette: [{ value: '#abc' }], typography: { primaryFont: 'Inter', secondaryFont: null, headings: [], body: null }, radius: ['4px'], shadow: [] };
    saveTheme('p1', theme, { baseDir });
    expect(loadTheme('p1', { baseDir })).toEqual(theme);
  });
});
```

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3: Implement**

```typescript
// packages/server/src/storage/themeStore.ts
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
export type { ThemeFile } from '../services/themeMerger';
import type { ThemeFile } from '../services/themeMerger';

export interface ThemeStoreOpts { baseDir?: string; }
function defaultBaseDir(): string { return resolve(__dirname, '../../data'); }
function slug(id: string): string {
  const s = String(id).replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '_').slice(0, 128);
  return s.length ? s : 'unnamed';
}
function themePath(projectId: string, baseDir?: string): string {
  return join(baseDir ?? defaultBaseDir(), 'projects', slug(projectId), 'theme.json');
}

export function saveTheme(projectId: string, theme: ThemeFile, opts: ThemeStoreOpts = {}): void {
  const p = themePath(projectId, opts.baseDir);
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, JSON.stringify(theme, null, 2), 'utf8');
}

export function loadTheme(projectId: string, opts: ThemeStoreOpts = {}): ThemeFile | null {
  const p = themePath(projectId, opts.baseDir);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
}
```

- [ ] **Step 4:** Re-run → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/storage/themeStore.ts packages/server/src/storage/__tests__/themeStore.test.ts
git commit -m "feat(storage): themeStore — project-level theme.json read/write (Plan 10b Phase 1)"
```

---

## Phase 2 — Ingestion cache + buildColdStart extension

### Task 4: `ingestionCache` — keyed by (projectId, sourceUrl)

**Files:**
- Create: `packages/server/src/services/ingestionCache.ts`
- Create: `packages/server/src/services/__tests__/ingestionCache.test.ts`

- [ ] **Step 1: Failing test**

```typescript
// packages/server/src/services/__tests__/ingestionCache.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ingestionCache } from '../ingestionCache';
import type { WebpageIngestion } from '@designbridge/ast';

describe('ingestionCache', () => {
  it('returns undefined on miss', () => { expect(ingestionCache.get('p1', 'https://e.com')).toBeUndefined(); });

  it('round-trips set/get', () => {
    const ing: WebpageIngestion = { type: 'webpage', url: 'https://e.com', dom: '<x/>' };
    ingestionCache.set('p1', 'https://e.com', ing, { assets: [] });
    const got = ingestionCache.get('p1', 'https://e.com');
    expect(got?.ingestion).toEqual(ing);
  });

  it('expires after TTL', () => {
    vi.useFakeTimers();
    const ing: WebpageIngestion = { type: 'webpage', url: 'https://e.com', dom: '<x/>' };
    ingestionCache.set('p1', 'https://e.com', ing, { assets: [] });
    vi.setSystemTime(Date.now() + 25 * 60 * 60 * 1000); // 25h
    expect(ingestionCache.get('p1', 'https://e.com')).toBeUndefined();
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3: Implement**

```typescript
// packages/server/src/services/ingestionCache.ts
import type { WebpageIngestion } from '@designbridge/ast';

interface CachedEntry { ingestion: WebpageIngestion; assets: string[]; expiresAt: number; }
const TTL_MS = 24 * 60 * 60 * 1000;
const store = new Map<string, CachedEntry>();

function key(projectId: string, url: string): string { return `${projectId}::${url}`; }

export const ingestionCache = {
  get(projectId: string, url: string): { ingestion: WebpageIngestion; assets: string[] } | undefined {
    const e = store.get(key(projectId, url));
    if (!e) return undefined;
    if (Date.now() > e.expiresAt) { store.delete(key(projectId, url)); return undefined; }
    return { ingestion: e.ingestion, assets: e.assets };
  },
  set(projectId: string, url: string, ingestion: WebpageIngestion, extras: { assets: string[] }): void {
    store.set(key(projectId, url), { ingestion, assets: extras.assets, expiresAt: Date.now() + TTL_MS });
  },
  clear(): void { store.clear(); },
};
```

- [ ] **Step 4:** Run → PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/services/ingestionCache.ts packages/server/src/services/__tests__/ingestionCache.test.ts
git commit -m "feat(server): ingestionCache — TTL-keyed (project, url) → WebpageIngestion (Plan 10b Phase 2)"
```

---

### Task 5: Extend `buildColdStart` to accept `WebpageIngestion`

**Files:**
- Modify: `packages/server/src/semantic/buildColdStart.ts`
- Create: `packages/server/src/semantic/__tests__/buildColdStart.webpage.test.ts`

The semantic builder currently builds from `RequirementIngestion`. For `WebpageIngestion`, we feed the DOM to the AI with a different prompt: "translate this DOM into a SemanticUIAst that visually reproduces the page; preserve structure & hierarchy". The repair loop and validator stay the same.

- [ ] **Step 1: Inspect existing `buildColdStart.ts`** to understand prompt shape. (Read-only.)

- [ ] **Step 2: Failing test**

```typescript
// packages/server/src/semantic/__tests__/buildColdStart.webpage.test.ts
import { describe, it, expect, vi } from 'vitest';
import { buildColdStart } from '../buildColdStart';
import type { WebpageIngestion } from '@designbridge/ast';

describe('buildColdStart — webpage source', () => {
  it('produces a SemanticUIAst from a WebpageIngestion using the webpage prompt path', async () => {
    const fakeGenerate = vi.fn(async () => JSON.stringify({
      schemaVersion: 1, artifactId: 'ar_1', kind: 'page',
      root: { id: 'n_root', type: 'Container', props: {}, layout: { kind: 'flow' }, style: {}, bindings: [], events: [], constraints: [], children: [] },
    }));
    const ing: WebpageIngestion = { type: 'webpage', url: 'https://e.com', dom: '<html><body><h1>Hi</h1></body></html>' };
    const ast = await buildColdStart(ing, { artifactId: 'ar_1', generate: fakeGenerate });
    expect(ast.root.type).toBe('Container');
    expect(fakeGenerate).toHaveBeenCalled();
    const call = fakeGenerate.mock.calls[0][0];
    // The prompt should mention the URL and contain a DOM snippet.
    expect(typeof call.prompt === 'string' ? call.prompt : JSON.stringify(call)).toMatch(/https:\/\/e\.com/);
  });
});
```

- [ ] **Step 3:** Run → FAIL.

- [ ] **Step 4: Extend `buildColdStart`**

Add a new ingestion branch. Sketch:

```typescript
// in buildColdStart.ts
import type { RequirementIngestion, WebpageIngestion, IngestionAst } from '@designbridge/ast';
// existing helpers: validateAst, runRepairLoop, defaultGenerate, describeComponentCatalog

const WEBPAGE_PROMPT = (ing: WebpageIngestion) => `You are translating an existing web page into a SemanticUIAst...
Source URL: ${ing.url}
DOM (script & iframe stripped):
${truncateDom(ing.dom, 30_000)}

Constraints: ${describeComponentCatalog()}
Produce ONLY a JSON SemanticUIAst object. No prose.`;

function truncateDom(dom: string, maxChars: number): string {
  if (dom.length <= maxChars) return dom;
  return dom.slice(0, maxChars) + '\n<!-- truncated -->';
}

export async function buildColdStart(ingestion: IngestionAst, opts: BuildColdStartOpts): Promise<SemanticUIAst> {
  const prompt = ingestion.type === 'requirement' ? REQUIREMENT_PROMPT(ingestion)
                : ingestion.type === 'webpage'    ? WEBPAGE_PROMPT(ingestion)
                : (() => { throw new Error(`buildColdStart: unsupported ingestion type ${ingestion.type}`); })();
  // ... rest of existing flow: generate → parse → validate → repair-loop
}
```

- [ ] **Step 5:** Re-run test → PASS. Also re-run existing buildColdStart tests.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/semantic/buildColdStart.ts packages/server/src/semantic/__tests__/buildColdStart.webpage.test.ts
git commit -m "feat(semantic): buildColdStart accepts WebpageIngestion (Plan 10b Phase 2)"
```

---

## Phase 3 — Routes

### Task 6: `compile.ts` AST+URL branch + themeProposal in response

**Files:**
- Modify: `packages/server/src/routes/compile.ts`
- Modify: `packages/server/src/routes/__tests__/compile.route.test.ts`

- [ ] **Step 1: Failing tests**

In `compile.route.test.ts`:

```typescript
describe('POST /:id/compile — ast+url', () => {
  it('crawls (cache miss), builds AST, returns ast + themeProposal', async () => {
    // mock parseWebpage to return a successful ingestion (small DOM)
    // mock buildColdStart to return a tiny valid ast
    // mock themeExtractor to return a non-empty proposal
    const res = await request(app)
      .post('/api/projects/p1/compile')
      .send({ mode: 'ast', source: { kind: 'url', payload: 'https://e.com' }, artifactId: 'ar_a1' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.ast).toBeDefined();
    expect(res.body.themeProposal).toBeDefined();
  });

  it('crawl failure returns ok:false with reason', async () => {
    // mock parseWebpage to return crawl_timeout
    const res = await request(app)
      .post('/api/projects/p1/compile')
      .send({ mode: 'ast', source: { kind: 'url', payload: 'https://e.com' } });
    expect(res.body).toMatchObject({ ok: false, reason: 'crawl_timeout' });
  });

  it('reuses cached ingestion on second call', async () => {
    // first call -> populates cache; verify parseWebpage spy called once total across two requests
  });
});
```

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3: Modify `compile.ts`**

Add an `ast+url` branch:

```typescript
import { parseWebpage } from '../ingestion/parseWebpage';
import { extractTheme } from '../services/themeExtractor';
import { ingestionCache } from '../services/ingestionCache';
import { buildColdStart } from '../semantic/buildColdStart';

// inside compileHandler, before the existing pure-text path:
if (mode === 'ast' && req.body?.source?.kind === 'url') {
  const projectId = req.params.id as string;
  const url = req.body.source.payload as string;
  let parsed = ingestionCache.get(projectId, url);
  let assets: string[] = parsed?.assets ?? [];
  if (!parsed) {
    const r = await parseWebpage(url);
    if (!r.ok) { res.json({ ok: false, reason: r.reason, detail: r.detail }); return; }
    ingestionCache.set(projectId, url, r.ingestion, { assets: r.assets });
    parsed = { ingestion: r.ingestion, assets: r.assets };
    assets = r.assets;
  }
  try {
    const ast = await buildColdStart(parsed.ingestion, { artifactId });
    const themeProposal = extractTheme({ dom: parsed.ingestion.dom, css: '', sourceUrl: url });
    // persist ast via existing saveArtifact
    res.json({ ok: true, ast, themeProposal });
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
git commit -m "feat(routes): compile.ts ast+url branch + themeProposal (Plan 10b Phase 3)"
```

---

### Task 7: `mirrors.ts` POST `/upgrade-to-ast`

**Files:**
- Modify: `packages/server/src/routes/mirrors.ts`
- Modify: `packages/server/src/routes/__tests__/mirrors.route.test.ts`

- [ ] **Step 1: Failing test**

```typescript
describe('POST /:id/mirrors/:artifactId/upgrade-to-ast', () => {
  it('reuses cached ingestion, builds AST artifact, original Mirror stays', async () => {
    // setup: write a Mirror to disk + populate ingestionCache for its sourceUrl
    // mock buildColdStart to return a valid AST
    const r = await request(app).post('/api/projects/p1/mirrors/ar_m/upgrade-to-ast').send({ artifactId: 'ar_a' });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.ast).toBeDefined();
    // Mirror still exists
    expect(loadMirrorMeta('p1', 'ar_m', { baseDir })).toBeTruthy();
  });

  it('returns 404 when mirror does not exist', async () => {
    const r = await request(app).post('/api/projects/p1/mirrors/missing/upgrade-to-ast').send({ artifactId: 'ar_a' });
    expect(r.status).toBe(404);
  });

  it('re-crawls when cache is empty', async () => {
    // setup: Mirror exists, cache cleared. Spy parseWebpage and verify it was called once.
  });
});
```

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3: Implement** (extend `mountMirrorsRoute`)

```typescript
import express from 'express';
import { buildColdStart } from '../semantic/buildColdStart';
import { parseWebpage } from '../ingestion/parseWebpage';
import { ingestionCache } from '../services/ingestionCache';
import { saveArtifact } from '../storage/artifactStore';

app.post('/api/projects/:id/mirrors/:artifactId/upgrade-to-ast', express.json(), async (req, res) => {
  const projectId = req.params.id as string;
  const mirrorId = req.params.artifactId as string;
  const newArtifactId = typeof req.body?.artifactId === 'string' ? req.body.artifactId : `${mirrorId}_ast`;
  const meta = loadMirrorMeta(projectId, mirrorId, { baseDir: opts.baseDir });
  if (!meta) { res.status(404).json({ error: 'mirror not found' }); return; }

  let cached = ingestionCache.get(projectId, meta.sourceUrl);
  if (!cached) {
    const r = await parseWebpage(meta.sourceUrl);
    if (!r.ok) { res.json({ ok: false, reason: r.reason, detail: r.detail }); return; }
    ingestionCache.set(projectId, meta.sourceUrl, r.ingestion, { assets: r.assets });
    cached = { ingestion: r.ingestion, assets: r.assets };
  }
  try {
    const ast = await buildColdStart(cached.ingestion, { artifactId: newArtifactId });
    saveArtifact(projectId, ast, { baseDir: opts.baseDir } as never);
    res.json({ ok: true, ast });
  } catch (err) {
    res.json({ ok: false, reason: 'ast_repair_exhausted', detail: (err as Error).message });
  }
});
```

- [ ] **Step 4:** Run → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/routes/mirrors.ts packages/server/src/routes/__tests__/mirrors.route.test.ts
git commit -m "feat(routes): POST mirrors/:id/upgrade-to-ast — reuse ingestion, keep mirror (Plan 10b Phase 3)"
```

---

### Task 8: `theme.ts` route — GET/PUT project theme.json

**Files:**
- Create: `packages/server/src/routes/theme.ts`
- Create: `packages/server/src/routes/__tests__/theme.route.test.ts`
- Modify: `packages/server/src/index.ts` (mount the route)

- [ ] **Step 1: Failing test**

```typescript
describe('theme route', () => {
  it('GET returns null when no theme', async () => {
    const r = await request(app).get('/api/projects/p1/theme');
    expect(r.body.theme).toBeNull();
  });

  it('PUT writes and GET returns it', async () => {
    const theme = { schemaVersion: 1, updatedAt: '', palette: [{ value: '#abc' }], typography: { primaryFont: 'Inter', secondaryFont: null, headings: [], body: null }, radius: [], shadow: [] };
    await request(app).put('/api/projects/p1/theme').send({ theme }).expect(200);
    const r = await request(app).get('/api/projects/p1/theme');
    expect(r.body.theme).toMatchObject({ palette: [{ value: '#abc' }] });
  });
});
```

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3: Implement**

```typescript
// packages/server/src/routes/theme.ts
import type { Express } from 'express';
import express from 'express';
import { saveTheme, loadTheme } from '../storage/themeStore';
import { mergeTheme, type ThemeFile, type ThemeMergeChoice } from '../services/themeMerger';
import type { ThemeProposal } from '../services/themeExtractor';

export function mountThemeRoute(app: Express, opts: { baseDir?: string } = {}): void {
  app.get('/api/projects/:id/theme', (req, res) => {
    res.json({ theme: loadTheme(req.params.id as string, { baseDir: opts.baseDir }) });
  });

  app.put('/api/projects/:id/theme', express.json(), (req, res) => {
    const theme = req.body?.theme as ThemeFile | undefined;
    if (!theme || typeof theme !== 'object') { res.status(400).json({ error: 'theme required' }); return; }
    saveTheme(req.params.id as string, theme, { baseDir: opts.baseDir });
    res.json({ ok: true });
  });

  app.post('/api/projects/:id/theme/merge', express.json(), (req, res) => {
    const proposal = req.body?.proposal as ThemeProposal | undefined;
    const choice = req.body?.choice as ThemeMergeChoice | undefined;
    if (!proposal || !choice) { res.status(400).json({ error: 'proposal + choice required' }); return; }
    const current = loadTheme(req.params.id as string, { baseDir: opts.baseDir });
    const merged = mergeTheme(current, proposal, choice);
    saveTheme(req.params.id as string, merged, { baseDir: opts.baseDir });
    res.json({ ok: true, theme: merged });
  });
}
```

- [ ] **Step 4: Mount in `index.ts`**:

```typescript
import { mountThemeRoute } from './routes/theme';
// ...
mountThemeRoute(app);
```

- [ ] **Step 5:** Run → PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/routes/theme.ts packages/server/src/routes/__tests__/theme.route.test.ts packages/server/src/index.ts
git commit -m "feat(routes): theme.ts — GET/PUT theme.json + POST merge (Plan 10b Phase 3)"
```

---

## Phase 4 — Client

### Task 9: `ThemeMergeDialog.tsx`

**Files:**
- Create: `packages/client/src/components/compiler/ThemeMergeDialog.tsx`
- Create: `packages/client/src/components/compiler/__tests__/ThemeMergeDialog.test.tsx`

- [ ] **Step 1: Failing test**

```typescript
describe('ThemeMergeDialog', () => {
  it('renders sections + per-section choice dropdowns', () => {
    render(<ThemeMergeDialog current={null} proposal={{ palette: [{ value: '#abc' }], typography: { primaryFont: 'Inter', secondaryFont: null, headings: [], body: null }, radius: ['4px'], shadow: [], source: 'x' }} onApply={() => {}} onCancel={() => {}} />);
    expect(screen.getByText(/palette/i)).toBeTruthy();
    expect(screen.getByText(/typography/i)).toBeTruthy();
  });

  it('Apply calls onApply with chosen sections', () => {
    const onApply = vi.fn();
    render(<ThemeMergeDialog current={null} proposal={/* ... */ as any} onApply={onApply} onCancel={() => {}} />);
    fireEvent.click(screen.getByText(/Apply/i));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ palette: expect.any(String), typography: expect.any(String) }));
  });
});
```

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3: Implement**

```tsx
// packages/client/src/components/compiler/ThemeMergeDialog.tsx
import { useState } from 'react';

interface ThemeMergeDialogProps {
  current: any; proposal: any;
  onApply: (choice: { palette: 'take-new'|'keep'|'union'; typography: 'take-new'|'keep'|'union'; radius: 'take-new'|'keep'|'union'; shadow: 'take-new'|'keep'|'union' }) => void;
  onCancel: () => void;
}

export default function ThemeMergeDialog(props: ThemeMergeDialogProps): JSX.Element {
  const [palette, setPalette] = useState<'take-new'|'keep'|'union'>('take-new');
  const [typography, setTypography] = useState<'take-new'|'keep'|'union'>('take-new');
  const [radius, setRadius] = useState<'take-new'|'keep'|'union'>('take-new');
  const [shadow, setShadow] = useState<'take-new'|'keep'|'union'>('take-new');

  const cell = (label: string, value: any, choice: string, setChoice: (s: any) => void) => (
    <div style={{ borderBottom: '1px solid #eee', padding: '8px 0' }}>
      <div style={{ fontWeight: 600 }}>{label}</div>
      <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#475569' }}>
        <div><b>Current:</b> {JSON.stringify(props.current?.[label.toLowerCase()] ?? null).slice(0, 80)}</div>
        <div><b>Proposed:</b> {JSON.stringify(value).slice(0, 80)}</div>
      </div>
      <select value={choice} onChange={e => setChoice(e.target.value)}>
        <option value="take-new">Take new</option>
        <option value="keep">Keep current</option>
        <option value="union">Union</option>
      </select>
    </div>
  );

  return (
    <div role="dialog" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: '#fff', padding: 16, borderRadius: 8, maxWidth: 720, width: '90%' }}>
        <h3>Theme update from {props.proposal.source}</h3>
        {cell('Palette', props.proposal.palette, palette, setPalette)}
        {cell('Typography', props.proposal.typography, typography, setTypography)}
        {cell('Radius', props.proposal.radius, radius, setRadius)}
        {cell('Shadow', props.proposal.shadow, shadow, setShadow)}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <button onClick={props.onCancel}>Cancel</button>
          <button onClick={() => props.onApply({ palette, typography, radius, shadow })}>Apply</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4:** Run → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/compiler/ThemeMergeDialog.tsx packages/client/src/components/compiler/__tests__/ThemeMergeDialog.test.tsx
git commit -m "feat(client): ThemeMergeDialog — section-wise take/keep/union (Plan 10b Phase 4)"
```

---

### Task 10: Wire ThemeMergeDialog into the AST flow + enable Upgrade-to-AST + lib/api additions

**Files:**
- Modify: `packages/client/src/lib/api.ts`
- Modify: `packages/client/src/components/compiler/CompilerChat.tsx`
- Modify: `packages/client/src/components/compiler/InspectorPane.tsx`
- Modify: `packages/client/src/stores/useCompilerStore.ts`

- [ ] **Step 1:** Add `getTheme`, `mergeTheme`, `upgradeMirrorToAst` to `lib/api.ts`. Add `pendingThemeProposal` state to `useCompilerStore`.

```typescript
// api.ts
export async function getTheme(projectId: string) { return (await fetch(`/api/projects/${projectId}/theme`)).json(); }
export async function mergeThemeApi(projectId: string, proposal: any, choice: any) {
  return (await fetch(`/api/projects/${projectId}/theme/merge`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ proposal, choice }) })).json();
}
export async function upgradeMirrorToAst(projectId: string, mirrorId: string, newArtifactId?: string) {
  return (await fetch(`/api/projects/${projectId}/mirrors/${mirrorId}/upgrade-to-ast`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ artifactId: newArtifactId }) })).json();
}
```

- [ ] **Step 2:** In `CompilerChat.tsx`, when the AST option is chosen with a URL:

```typescript
async function onConfirm(mode: 'mirror' | 'ast'): Promise<void> {
  if (!projectId || !pending) return;
  if (mode === 'mirror') { /* unchanged from 10a */ }
  else {
    const r = await api.compile(projectId, { mode: 'ast', source: pending.source, artifactId: undefined });
    if (r?.ok && r.themeProposal) useCompilerStore.getState().setPendingThemeProposal(r.themeProposal);
    refreshArtifacts();
  }
  setText(''); setPending(null);
}
```

In CompilerWorkspace top-level, render `<ThemeMergeDialog>` when `pendingThemeProposal` is non-null. On Apply, call `mergeThemeApi` then clear the state.

- [ ] **Step 3:** In `InspectorPane.tsx`, change the disabled upgrade button to functional:

```tsx
if (active?.kind === 'mirror') {
  return (
    <div>
      {/* ... source / crawled / warnings ... */}
      <button onClick={async () => { await api.upgradeMirrorToAst(projectId!, active.id); refreshArtifacts(); }}>
        Upgrade to AST
      </button>
    </div>
  );
}
```

- [ ] **Step 4:** Add tests asserting:
- ThemeMergeDialog appears after AST+URL compile that returns a themeProposal.
- Clicking Upgrade to AST calls `api.upgradeMirrorToAst` and refreshes artifacts.

- [ ] **Step 5:** Run all tests → PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/lib/api.ts packages/client/src/components/compiler/CompilerChat.tsx packages/client/src/components/compiler/InspectorPane.tsx packages/client/src/stores/useCompilerStore.ts
git commit -m "feat(client): wire ThemeMergeDialog + enable Upgrade-to-AST button (Plan 10b Phase 4)"
```

---

## Phase 5 — E2E + verify

### Task 11: Extend `compiler-mirror-journey` and add `compiler-ast-theme-journey`

**Files:**
- Modify: `packages/e2e/tests/e2e/compiler-mirror-journey.spec.ts` (add upgrade-to-ast scenario)
- Create: `packages/e2e/tests/e2e/compiler-ast-theme-journey.spec.ts`

- [ ] **Step 1:** Add a route-mocked scenario to the existing mirror journey that:
- Clicks "Upgrade to AST" on the mirror artifact.
- Asserts a new AST artifact (`ar_mirror_1_ast` or similar) appears in rail.
- Mirror artifact `ar_mirror_1` still present.

- [ ] **Step 2:** Write `compiler-ast-theme-journey.spec.ts`: paste URL → pick AST → confirm → assert AST artifact + ThemeMergeDialog appears → Apply → assert dialog closes and `PUT /api/projects/.../theme/merge` was called with the expected payload.

- [ ] **Step 3:** Run both E2E → PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/e2e/tests/e2e/compiler-mirror-journey.spec.ts packages/e2e/tests/e2e/compiler-ast-theme-journey.spec.ts
git commit -m "test(e2e): upgrade-to-ast + ast+theme journeys (Plan 10b Phase 5)"
```

---

### Task 12: Final verify + manual smoke

- [ ] All package builds green.
- [ ] All unit + integration tests green.
- [ ] E2E green.
- [ ] **Manual smoke**: in browser, paste `https://example.com`, pick AST → confirm AST artifact appears, dialog appears, Apply writes a theme.json file (verify on disk: `cat packages/server/data/projects/<id>/theme.json`). Then click Upgrade to AST on a Mirror artifact created via mirror flow → asserts new AST artifact alongside.

## Acceptance Criteria

- [ ] `themeExtractor`, `themeMerger`, `themeStore`, `ingestionCache` all green.
- [ ] `buildColdStart` accepts `WebpageIngestion` — webpage tests green; requirement tests unchanged.
- [ ] `POST /compile { mode: 'ast', source: { kind: 'url' } }` returns `{ ok, ast, themeProposal }`.
- [ ] `POST /mirrors/:id/upgrade-to-ast` returns a new AST artifact, keeps the original Mirror.
- [ ] `GET/PUT /api/projects/:id/theme` + `POST /theme/merge` round-trip.
- [ ] `ThemeMergeDialog` opens after AST+URL compile and writes `theme.json` on Apply.
- [ ] InspectorPane's Upgrade button is functional.
- [ ] Existing Plan 10a tests still green (no regressions).
- [ ] Plan 10a pure-text and Mirror flows unaffected.

## Risks / Notes

1. **AST repair-loop cost.** Building an AST from a complex DOM may eat tokens. Spec §6 — the existing repair loop limit applies. If it exhausts, the response carries `reason: 'ast_repair_exhausted'` and the client falls back gracefully (see Plan 10a's UI: a chat note "AST mode failed, try Mirror?").
2. **DOM truncation at 30 KB.** Large pages get truncated; the AI gets the head + visible structure. If users complain about long pages losing footer content, consider summarizing or splitting (out of scope).
3. **Theme extraction is deterministic** — no AI. This avoids confabulated tokens. The trade-off: only inline-style colors get picked up (most production sites use external stylesheets — collected as assets but not parsed for tokens here). A future "theme-extraction v2" could parse the downloaded CSS too. **Note**: spec §2.3 implies "AI extracts a theme proposal" — Plan 10b implements a *simpler* deterministic version to ship; AI-driven theme inference can be added later without changing the wire shape.
4. **`ingestionCache` is in-process.** Restart loses cache; Upgrade-to-AST then re-crawls. Acceptable for now; if Plan 7 introduces a persistent ingestion store, swap in.
5. **`theme.json` is not consumed by codegen yet.** Spec §10 deferred. After Plan 10b ships, file a small `theme-consumption` plan (read theme.json at compile time, emit a Tailwind config snippet, or inject CSS vars).
6. **Concurrent compile + theme writes.** Two simultaneous compiles on the same project could race on `theme.json`. Acceptable: theme.json is small and the merge dialog gates writes; the worst case is one merge clobbering another. If users hit this, add a simple lock or ETag.

---

**Plan end.**
