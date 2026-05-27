# Plan 2 — Ingestion AST + Parsers (requirement + PDF) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the **Ingestion AST** — the first IR in the dual-IR pipeline — as a complete, typed discriminated union plus *deterministic* per-input-type parsers. Implement the `requirement` (chat text) and `pdf` parsers first (spec §10), with the full 5-variant union defined from day 1 so later parsers (screenshot/clipboard/webpage) need no schema migration. The AI never touches this layer — parsing is pure mechanical code (spec §4.3); AI semantic interpretation is Plan 3.

**Architecture:** IngestionAst **types** live in `@designbridge/ast` (new `src/ingestion/` subtree) — pure framework-agnostic types + type guards, no runtime deps, importable by both server and client (the client renders the "Ingestion" pipeline stage per spec §5.2). The **parsers** live in a new `packages/server/src/ingestion/` module because they need node-only libraries (pdf-parse). Each parser is a pure async function `(rawInput) → IngestionAst`; a `parseInput` dispatcher routes by input kind. The PDF parser takes its page-extraction backend via dependency injection so the page-structuring logic is unit-testable without a binary fixture. This module is **standalone** — it does NOT rewire the existing `routes/upload.ts` / `chat.ts` flow (that migration is Plan 7), so the current system keeps running untouched.

**Tech Stack:** TypeScript 5.6 strict; Vitest 3.2.4 (NOT 4 — vite 5 incompatibility, see Plan 1); `@designbridge/ast` (workspace dep, already wired into server). PDF parsing reuses the existing `pdf-parse` dep (already in `packages/server`). No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-05-26-ai-ui-compiler-redesign.md` (§1, §4.2, §4.3, §6.13). Builds on Plan 1 (`docs/superpowers/plans/2026-05-26-plan-01-semantic-ui-ast-schema.md`).

**Upstream dependency:** Plan 1 (`@designbridge/ast` package exists, wired into server + client).

**Downstream consumers:** Plan 3 (AI Semantic Builder — consumes IngestionAst, produces SemanticUIAst). Plan 6 (client UI — renders the Ingestion stage). Plan 7 (project migration — rewires `routes/upload.ts`/`chat.ts` to call `parseInput`).

**Scope boundary (out of plan):**
- NO AI calls in any parser — deterministic only (spec §4.3). AI is Plan 3.
- NO parsers for screenshot/clipboard/webpage yet — their union variants are DEFINED but `parseInput` only routes requirement + pdf; others throw "not yet implemented".
- NO rewiring of existing `routes/upload.ts` / `routes/chat.ts` / `documentAnalysisAgent.ts` — that's Plan 7. Plan 2 ships a standalone, tested `ingestion/` module.
- NO removal of the existing `textExtractor.ts` / `documentAnalysisAgent.ts` — they keep serving the current (old) flow until Plan 7 migrates it.

---

## Design grounding (from codebase exploration)

- Existing `packages/server/src/services/textExtractor.ts` wraps `pdf-parse`/`mammoth`/`tesseract` but returns FLAT strings; the new `pdf` parser needs per-page structure, so it uses `pdf-parse`'s `pagerender` callback (per-page text), not the flat `.text`.
- Existing services are functional (named `export function`/`async function`), with `*Result` interfaces colocated; tests in `__tests__/`. Plan 2 follows this.
- `@designbridge/ast` builds dual CJS/ESM; adding pure types to it is dependency-free. The server already depends on it (`workspace:*`).

---

## File Structure

```
packages/ast/src/ingestion/
  ingestionAst.ts          ← the 5-variant discriminated union + sub-types
  guards.ts                ← type-guard predicates (isPdfIngestion, ...)
packages/ast/src/index.ts  ← + re-export ingestion types & guards
packages/ast/src/__tests__/
  ingestion.test.ts        ← union construction + guards

packages/server/src/ingestion/
  parseRequirement.ts      ← chat text → RequirementIngestion (deterministic)
  parsePdf.ts              ← PDF buffer → PdfIngestion (pdf-parse pagerender, DI-testable)
  parseInput.ts            ← dispatcher: RawInput → IngestionAst
  index.ts                 ← barrel re-export of the parser API
packages/server/src/ingestion/__tests__/
  parseRequirement.test.ts
  parsePdf.test.ts
  parseInput.test.ts
```

No new dependencies. No existing files modified except `packages/ast/src/index.ts` (re-exports).

---

## Phase 1 — Ingestion AST types (in `@designbridge/ast`)

### Task 1: Define the IngestionAst union + sub-types

**Files:**
- Create: `packages/ast/src/ingestion/ingestionAst.ts`
- Test: `packages/ast/src/__tests__/ingestion.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/ast/src/__tests__/ingestion.test.ts
import { describe, it, expect } from 'vitest';
import type {
  IngestionAst, RequirementIngestion, PdfIngestion,
  ScreenshotIngestion, ClipboardIngestion, WebpageIngestion, PdfPage,
} from '../ingestion/ingestionAst';

describe('IngestionAst union', () => {
  it('accepts a requirement variant', () => {
    const r: RequirementIngestion = { type: 'requirement', paragraphs: ['a', 'b'], source: 'chat' };
    const a: IngestionAst = r;
    expect(a.type).toBe('requirement');
  });

  it('accepts a pdf variant with per-page text', () => {
    const pages: PdfPage[] = [{ pageNumber: 1, text: 'p1' }, { pageNumber: 2, text: 'p2' }];
    const p: PdfIngestion = { type: 'pdf', pages, pageCount: 2, rawText: 'p1\n\np2' };
    const a: IngestionAst = p;
    expect(a.type).toBe('pdf');
    if (a.type === 'pdf') expect(a.pages[1]?.pageNumber).toBe(2);
  });

  it('accepts screenshot / clipboard / webpage variants', () => {
    const s: ScreenshotIngestion = { type: 'screenshot', ocrText: 'hi', regions: [] };
    const c: ClipboardIngestion = { type: 'clipboard', format: 'text', payload: 'x' };
    const w: WebpageIngestion = { type: 'webpage', url: 'https://x', dom: '<html></html>' };
    const all: IngestionAst[] = [s, c, w];
    expect(all.map(a => a.type)).toEqual(['screenshot', 'clipboard', 'webpage']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @designbridge/ast test`
Expected: FAIL — `Cannot find module '../ingestion/ingestionAst'`.

- [ ] **Step 3: Write `ingestionAst.ts`**

```typescript
// packages/ast/src/ingestion/ingestionAst.ts
// The Ingestion AST — first IR in the dual-IR pipeline. Produced by DETERMINISTIC parsers
// (no AI). The AI Semantic Builder (Plan 3) consumes this to produce the Semantic UI AST.
// The full 5-variant union is defined now; Plan 2 implements only the requirement + pdf parsers.

export interface PdfPage {
  /** 1-based page number. */
  pageNumber: number;
  /** Plain text extracted from the page (whitespace-trimmed). */
  text: string;
}

/** Chat text or pasted free-text → split into paragraphs. */
export interface RequirementIngestion {
  type: 'requirement';
  paragraphs: string[];
  source?: 'chat' | 'pasted-text';
}

/** A parsed PDF document. */
export interface PdfIngestion {
  type: 'pdf';
  pages: PdfPage[];
  pageCount: number;
  /** All page text joined with blank lines — convenience for consumers that want flat text. */
  rawText: string;
}

/** Forward-looking — parser implemented in a later plan. Sub-shape kept minimal until then. */
export interface ScreenshotRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
}

/** A screenshot/image: OCR text + coarse layout regions. Parser is a later plan. */
export interface ScreenshotIngestion {
  type: 'screenshot';
  ocrText: string;
  regions: ScreenshotRegion[];
}

/** Clipboard paste. Parser is a later plan. */
export interface ClipboardIngestion {
  type: 'clipboard';
  format: 'html' | 'image' | 'text';
  /** HTML string, base64 image, or plain text depending on `format`. */
  payload: string;
}

/** A crawled web page. Parser is a later plan (wraps the existing websiteCrawler). */
export interface WebpageIngestion {
  type: 'webpage';
  url: string;
  /** Serialized DOM / outer HTML. */
  dom: string;
  /** Base64 screenshot, optional. */
  screenshot?: string;
}

export type IngestionAst =
  | RequirementIngestion
  | PdfIngestion
  | ScreenshotIngestion
  | ClipboardIngestion
  | WebpageIngestion;

export type IngestionType = IngestionAst['type'];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @designbridge/ast test`
Expected: PASS — IngestionAst union describe block green.

- [ ] **Step 5: Commit**

```bash
git add packages/ast/src/ingestion/ingestionAst.ts packages/ast/src/__tests__/ingestion.test.ts
git commit -m "feat(ast): define IngestionAst discriminated union (5 variants)"
```

---

### Task 2: Type guards + index re-export

**Files:**
- Create: `packages/ast/src/ingestion/guards.ts`
- Modify: `packages/ast/src/index.ts`
- Modify: `packages/ast/src/__tests__/ingestion.test.ts` (append)

- [ ] **Step 1: Append the failing test**

```typescript
import {
  isRequirementIngestion, isPdfIngestion, isScreenshotIngestion,
  isClipboardIngestion, isWebpageIngestion,
} from '../ingestion/guards';

describe('ingestion type guards', () => {
  const req: IngestionAst = { type: 'requirement', paragraphs: [] };
  const pdf: IngestionAst = { type: 'pdf', pages: [], pageCount: 0, rawText: '' };

  it('isRequirementIngestion narrows correctly', () => {
    expect(isRequirementIngestion(req)).toBe(true);
    expect(isRequirementIngestion(pdf)).toBe(false);
    if (isRequirementIngestion(req)) expect(Array.isArray(req.paragraphs)).toBe(true);
  });

  it('isPdfIngestion narrows correctly', () => {
    expect(isPdfIngestion(pdf)).toBe(true);
    expect(isPdfIngestion(req)).toBe(false);
  });

  it('other guards return correct booleans', () => {
    expect(isScreenshotIngestion(req)).toBe(false);
    expect(isClipboardIngestion(req)).toBe(false);
    expect(isWebpageIngestion(req)).toBe(false);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `Cannot find module '../ingestion/guards'`.

- [ ] **Step 3: Write `guards.ts`**

```typescript
// packages/ast/src/ingestion/guards.ts
import type {
  IngestionAst, RequirementIngestion, PdfIngestion,
  ScreenshotIngestion, ClipboardIngestion, WebpageIngestion,
} from './ingestionAst';

export function isRequirementIngestion(a: IngestionAst): a is RequirementIngestion {
  return a.type === 'requirement';
}
export function isPdfIngestion(a: IngestionAst): a is PdfIngestion {
  return a.type === 'pdf';
}
export function isScreenshotIngestion(a: IngestionAst): a is ScreenshotIngestion {
  return a.type === 'screenshot';
}
export function isClipboardIngestion(a: IngestionAst): a is ClipboardIngestion {
  return a.type === 'clipboard';
}
export function isWebpageIngestion(a: IngestionAst): a is WebpageIngestion {
  return a.type === 'webpage';
}
```

- [ ] **Step 4: Append ingestion re-exports to `packages/ast/src/index.ts`**

```typescript
export type {
  IngestionAst, IngestionType,
  RequirementIngestion, PdfIngestion, PdfPage,
  ScreenshotIngestion, ScreenshotRegion, ClipboardIngestion, WebpageIngestion,
} from './ingestion/ingestionAst';
export {
  isRequirementIngestion, isPdfIngestion, isScreenshotIngestion,
  isClipboardIngestion, isWebpageIngestion,
} from './ingestion/guards';
```

- [ ] **Step 5: Run tests + build**

Run: `pnpm --filter @designbridge/ast test` → expect PASS (guards block green).
Run: `pnpm --filter @designbridge/ast build` → expect clean CJS+ESM.

- [ ] **Step 6: Commit**

```bash
git add packages/ast/src/ingestion/guards.ts packages/ast/src/index.ts packages/ast/src/__tests__/ingestion.test.ts
git commit -m "feat(ast): add ingestion type guards + public re-exports"
```

---

## Phase 2 — Requirement parser (server)

### Task 3: `parseRequirement` — chat text → paragraphs

**Files:**
- Create: `packages/server/src/ingestion/parseRequirement.ts`
- Test: `packages/server/src/ingestion/__tests__/parseRequirement.test.ts`

> Server tests run via `pnpm --filter server test` (vitest, configured in Plan 1 with `globals: true`). The smoke tests import explicitly so globals aren't required, but the config is harmless.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/server/src/ingestion/__tests__/parseRequirement.test.ts
import { describe, it, expect } from 'vitest';
import { parseRequirement } from '../parseRequirement';

describe('parseRequirement', () => {
  it('splits on blank lines into trimmed paragraphs', () => {
    const r = parseRequirement('First para.\n\n  Second para.  \n\n\nThird.');
    expect(r.type).toBe('requirement');
    expect(r.paragraphs).toEqual(['First para.', 'Second para.', 'Third.']);
  });

  it('treats a single block as one paragraph', () => {
    const r = parseRequirement('just one line');
    expect(r.paragraphs).toEqual(['just one line']);
  });

  it('drops empty/whitespace-only input to zero paragraphs', () => {
    expect(parseRequirement('   \n\n  ').paragraphs).toEqual([]);
    expect(parseRequirement('').paragraphs).toEqual([]);
  });

  it('defaults source to "chat" and respects an explicit source', () => {
    expect(parseRequirement('x').source).toBe('chat');
    expect(parseRequirement('x', 'pasted-text').source).toBe('pasted-text');
  });

  it('collapses single newlines within a paragraph but keeps paragraph breaks', () => {
    const r = parseRequirement('line one\nline two\n\nnext para');
    expect(r.paragraphs).toEqual(['line one\nline two', 'next para']);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `pnpm --filter server test`
Expected: FAIL — `Cannot find module '../parseRequirement'`.

- [ ] **Step 3: Write `parseRequirement.ts`**

```typescript
// packages/server/src/ingestion/parseRequirement.ts
import type { RequirementIngestion } from '@designbridge/ast';

/**
 * Deterministically parse free text (chat message or pasted text) into a RequirementIngestion.
 * Splits on blank lines (one or more) into paragraphs; trims each; drops empties.
 * No AI — pure mechanical parsing (spec §4.3).
 */
export function parseRequirement(
  text: string,
  source: 'chat' | 'pasted-text' = 'chat',
): RequirementIngestion {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0);
  return { type: 'requirement', paragraphs, source };
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `pnpm --filter server test`
Expected: PASS — 5 parseRequirement tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/ingestion/parseRequirement.ts packages/server/src/ingestion/__tests__/parseRequirement.test.ts
git commit -m "feat(server): add deterministic parseRequirement (chat text → IngestionAst)"
```

---

## Phase 3 — PDF parser (server)

### Task 4: `parsePdf` — PDF buffer → per-page IngestionAst (DI-testable)

**Files:**
- Create: `packages/server/src/ingestion/parsePdf.ts`
- Test: `packages/server/src/ingestion/__tests__/parsePdf.test.ts`

> The page-structuring logic is unit-tested via an injected `extractPages` fake — no binary PDF fixture needed. The default `extractPages` uses `pdf-parse`'s `pagerender` callback (pages are rendered sequentially in order). `pdf-parse` is already a server dependency.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/server/src/ingestion/__tests__/parsePdf.test.ts
import { describe, it, expect } from 'vitest';
import { parsePdf } from '../parsePdf';

describe('parsePdf', () => {
  // Inject a fake page extractor so we test our structuring logic, not pdf-parse internals.
  const fakeExtract = (pages: string[]) => async (_buf: Buffer) => pages;

  it('maps extracted page texts to 1-based PdfPage[] with trimmed text', async () => {
    const result = await parsePdf(Buffer.from('ignored'), {
      extractPages: fakeExtract(['  page one  ', 'page two']),
    });
    expect(result.type).toBe('pdf');
    expect(result.pageCount).toBe(2);
    expect(result.pages).toEqual([
      { pageNumber: 1, text: 'page one' },
      { pageNumber: 2, text: 'page two' },
    ]);
  });

  it('builds rawText by joining page text with blank lines', async () => {
    const result = await parsePdf(Buffer.from('x'), {
      extractPages: fakeExtract(['a', 'b', 'c']),
    });
    expect(result.rawText).toBe('a\n\nb\n\nc');
  });

  it('handles an empty PDF (zero pages)', async () => {
    const result = await parsePdf(Buffer.from('x'), { extractPages: fakeExtract([]) });
    expect(result.pageCount).toBe(0);
    expect(result.pages).toEqual([]);
    expect(result.rawText).toBe('');
  });

  it('propagates extractor errors', async () => {
    const boom = async (_b: Buffer) => { throw new Error('corrupt pdf'); };
    await expect(parsePdf(Buffer.from('x'), { extractPages: boom })).rejects.toThrow(/corrupt pdf/);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `Cannot find module '../parsePdf'`.

- [ ] **Step 3: Write `parsePdf.ts`**

```typescript
// packages/server/src/ingestion/parsePdf.ts
import type { PdfIngestion, PdfPage } from '@designbridge/ast';

export interface ParsePdfDeps {
  /** Returns the plain text of each page, in page order. */
  extractPages: (buffer: Buffer) => Promise<string[]>;
}

/** Default page extractor — pdf-parse with a per-page `pagerender` hook. */
async function defaultExtractPages(buffer: Buffer): Promise<string[]> {
  // pdf-parse is CommonJS; default import under esModuleInterop.
  const pdfParse = (await import('pdf-parse')).default;
  const pages: string[] = [];
  await pdfParse(buffer, {
    // pdf-parse calls pagerender once per page, sequentially in page order.
    pagerender: async (pageData: { getTextContent: () => Promise<{ items: Array<{ str: string }> }> }) => {
      const content = await pageData.getTextContent();
      const text = content.items.map(it => it.str).join(' ');
      pages.push(text);
      return text;
    },
  });
  return pages;
}

/**
 * Deterministically parse a PDF buffer into a PdfIngestion (per-page text). No AI (spec §4.3).
 * The page-extraction backend is injectable for testing; defaults to pdf-parse.
 */
export async function parsePdf(
  buffer: Buffer,
  deps: Partial<ParsePdfDeps> = {},
): Promise<PdfIngestion> {
  const extractPages = deps.extractPages ?? defaultExtractPages;
  const rawPages = await extractPages(buffer);
  const pages: PdfPage[] = rawPages.map((text, i) => ({ pageNumber: i + 1, text: text.trim() }));
  return {
    type: 'pdf',
    pages,
    pageCount: pages.length,
    rawText: pages.map(p => p.text).join('\n\n'),
  };
}
```

- [ ] **Step 4: Run, expect PASS** — 4 parsePdf tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/ingestion/parsePdf.ts packages/server/src/ingestion/__tests__/parsePdf.test.ts
git commit -m "feat(server): add deterministic parsePdf (per-page, DI-testable)"
```

---

## Phase 4 — Dispatcher

### Task 5: `parseInput` dispatcher + barrel export

**Files:**
- Create: `packages/server/src/ingestion/parseInput.ts`
- Create: `packages/server/src/ingestion/index.ts`
- Test: `packages/server/src/ingestion/__tests__/parseInput.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/server/src/ingestion/__tests__/parseInput.test.ts
import { describe, it, expect } from 'vitest';
import { parseInput } from '../parseInput';

describe('parseInput dispatcher', () => {
  it('routes requirement input', async () => {
    const a = await parseInput({ kind: 'requirement', text: 'hello\n\nworld' });
    expect(a.type).toBe('requirement');
    if (a.type === 'requirement') expect(a.paragraphs).toEqual(['hello', 'world']);
  });

  it('routes pdf input (via injected extractor through parsePdf default path)', async () => {
    // Use the requirement path for routing assertion; pdf routing is covered by shape:
    const a = await parseInput({ kind: 'pdf', buffer: Buffer.from('x'),
      // test seam: allow passing extractPages through for routing test
      extractPages: async () => ['only page'] } as any);
    expect(a.type).toBe('pdf');
    if (a.type === 'pdf') expect(a.pages[0]?.text).toBe('only page');
  });

  it('throws for a not-yet-implemented input kind', async () => {
    await expect(parseInput({ kind: 'screenshot' } as any)).rejects.toThrow(/not.*implemented|unsupported/i);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `Cannot find module '../parseInput'`.

- [ ] **Step 3: Write `parseInput.ts`**

```typescript
// packages/server/src/ingestion/parseInput.ts
import type { IngestionAst } from '@designbridge/ast';
import { parseRequirement } from './parseRequirement';
import { parsePdf } from './parsePdf';

export type RawInput =
  | { kind: 'requirement'; text: string; source?: 'chat' | 'pasted-text' }
  | { kind: 'pdf'; buffer: Buffer; extractPages?: (buffer: Buffer) => Promise<string[]> };

/**
 * Routes a raw input to its deterministic parser, producing an IngestionAst.
 * Only `requirement` and `pdf` are implemented in Plan 2; screenshot/clipboard/webpage
 * are defined in the union but throw here until their parsers land.
 */
export async function parseInput(input: RawInput): Promise<IngestionAst> {
  switch (input.kind) {
    case 'requirement':
      return parseRequirement(input.text, input.source);
    case 'pdf':
      return parsePdf(input.buffer, input.extractPages ? { extractPages: input.extractPages } : {});
    default: {
      // Exhaustiveness for implemented kinds; other IngestionAst variants are not yet wired.
      throw new Error(`parseInput: input kind "${(input as { kind: string }).kind}" is not yet implemented`);
    }
  }
}
```

- [ ] **Step 4: Write the barrel `index.ts`**

```typescript
// packages/server/src/ingestion/index.ts
export { parseRequirement } from './parseRequirement';
export { parsePdf } from './parsePdf';
export type { ParsePdfDeps } from './parsePdf';
export { parseInput } from './parseInput';
export type { RawInput } from './parseInput';
```

- [ ] **Step 5: Run, expect PASS** — 3 parseInput tests green.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/ingestion/parseInput.ts packages/server/src/ingestion/index.ts packages/server/src/ingestion/__tests__/parseInput.test.ts
git commit -m "feat(server): add parseInput dispatcher + ingestion barrel"
```

---

## Phase 5 — Verify

### Task 6: Full build + test verification

**Files:** none (verification only).

- [ ] **Step 1: ast build + test**

Run: `pnpm --filter @designbridge/ast build && pnpm --filter @designbridge/ast test`
Expected: clean build; all ast tests pass (Plan 1's 69 + new ingestion tests).

- [ ] **Step 2: server build + test**

Run: `pnpm --filter server build && pnpm --filter server test`
Expected: server `tsc` exits 0 (resolves `@designbridge/ast` ingestion types); server tests pass for the new ingestion suites.
Note: the pre-existing `htmlSanitizer.test.ts > injectConventionColors` failure (documented in Plan 1) is UNRELATED to this plan and may still fail — confirm no NEW failures are introduced by Plan 2.

- [ ] **Step 3: confirm no route/old-service files were touched**

Run: `git diff --stat 598b7c7..HEAD -- packages/server/src/routes packages/server/src/services`
Expected: EMPTY — Plan 2 adds only `packages/server/src/ingestion/` and does not modify routes or existing services (the old flow is untouched; migration is Plan 7).

---

## Acceptance Criteria

The plan is **done** when:
- [ ] `@designbridge/ast` exports the full `IngestionAst` union (5 variants: requirement/pdf/screenshot/clipboard/webpage) + sub-types (`PdfPage`, `ScreenshotRegion`) + 5 type guards, all re-exported from `index.ts`.
- [ ] `packages/server/src/ingestion/` provides `parseRequirement`, `parsePdf` (DI-testable), and `parseInput` dispatcher, all deterministic (NO AI calls, NO provider import).
- [ ] `parseRequirement` splits on blank lines, trims, drops empties; defaults source to `chat`.
- [ ] `parsePdf` produces 1-based `PdfPage[]` + `rawText` + `pageCount`; unit-tested with an injected extractor; default path uses `pdf-parse` `pagerender`.
- [ ] `parseInput` routes requirement + pdf; throws a clear "not yet implemented" for the other three kinds.
- [ ] `pnpm --filter @designbridge/ast test` and `pnpm --filter server test` pass for all new suites (no NEW failures; the pre-existing htmlSanitizer failure is the only tolerated red).
- [ ] `pnpm --filter @designbridge/ast build` and `pnpm --filter server build` exit 0.
- [ ] Plan 2 introduced ZERO new runtime dependencies and modified NO route/old-service files (verified by `git diff --stat`).
- [ ] Every task committed separately with `feat(ast)`/`feat(server)` convention.

## Compiler Invariant (held by this plan)

> **Ingestion is deterministic; the AI never sees raw input — only the Ingestion AST (spec §4.3).**

Plan 2 enforces this in code shape: no parser imports the provider or makes an AI call. The parsers are pure functions of their input. Plan 3's AI Semantic Builder will take an `IngestionAst` (never a raw buffer/string) as its input contract.

---

## Risks / Notes for Executor

1. **`pdf-parse` import form:** it's CommonJS; under the server's `esModuleInterop` the `(await import('pdf-parse')).default` form works. If TS complains about types, `pdf-parse` ships `@types/pdf-parse` (already a server devDep). The `pagerender` option is typed loosely — the inline structural type in `parsePdf.ts` avoids `any` where possible.
2. **`pagerender` page order:** pdf-parse invokes `pagerender` sequentially per page in document order, so pushing to an array preserves order. This is the documented behavior; the DI seam means the unit tests don't depend on it, but the default path does.
3. **No binary fixture:** the PDF parser's real `pdf-parse` integration is NOT exercised by a committed binary fixture (DI fake covers the logic). If you want one real-PDF smoke, generate a minimal PDF at test time — but this is OPTIONAL and not required by the acceptance criteria; do not block on it.
4. **`as any` in the parseInput pdf test:** the `extractPages` field on the pdf `RawInput` is a real optional test-seam field (declared on the `RawInput` pdf variant), so the `as any` in the test can be dropped if the field is properly typed — prefer typing it. (The implementation declares `extractPages?` on the pdf variant for exactly this reason.)
5. **Do NOT wire into routes:** resist the temptation to hook `parseInput` into `routes/upload.ts` or `chat.ts`. That is Plan 7 (migration) and would disturb the running old system. Plan 2 ships a standalone, tested module only.
6. **vitest must stay `^3.2.4`** (vite 5). Do not upgrade.

---

**Plan end.** Ready for execution.
