# Plan 6 — Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Accept PDF, DOCX, image, URL, clipboard inputs through `/api/projects/:id/ingest`. Server parses to text (PDF/DOCX) or stores base64 (image), saves files under `data/projects/<projectId>/uploads/`, and returns an `Attachment` record to be attached to the next chat Turn.

**Architecture:** Multer for multipart upload. Parsers: `pdf-parse` for PDF, `mammoth` for DOCX. Images stored as-is (≤ 20 MB / ≤ 5 attachments per turn). URL fetch uses Node 22 `fetch` + a tiny readability-like text extractor. Each upload returns an Attachment record (`{id, kind, originalName, storedPath, parsedText?, mimeType, sizeBytes}`); chat endpoint (Plan 7) attaches these to the Turn.

**Tech Stack:** multer, pdf-parse, mammoth. Image sharp resize is optional (defer to M2 — store original, send to vision as-is).

**Spec:** [`../specs/2026-06-01-designbridge-redesign-design.md`](../specs/2026-06-01-designbridge-redesign-design.md) § 3.8 (ingestion).

**Scope boundary (out of plan):** NO OCR (multimodal vision covers it). NO Excel/PPT (M2). NO image resize (M2). NO antivirus scan. NO clipboard-specific handling (client paste sends as image upload). NO URL crawler beyond fetch + cheap text strip.

---

## File Structure

```
packages/server/src/
  services/
    ingestionService.ts        ← saveAttachment, parsePdf, parseDocx, fetchUrl, listAttachments
    __tests__/
      ingestionService.test.ts
  routes/
    ingest.ts                  ← POST /api/projects/:id/ingest, GET /api/projects/:id/attachments
    __tests__/
      ingest.route.test.ts
  db/migrations/
    008_attachments.sql        ← attachments table
packages/server/package.json   ← add multer, pdf-parse, mammoth + @types/multer
```

`Attachment` table schema (migration 008):

```sql
CREATE TABLE attachments (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK(kind IN ('pdf','docx','image','url-snapshot')),
  original_name TEXT NOT NULL,
  stored_path   TEXT NOT NULL,
  parsed_text   TEXT,
  mime_type     TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_attachments_project ON attachments(project_id, created_at);
```

---

## Task 1: Install deps + migration

- [ ] Add to `packages/server/package.json`:
  - dependencies: `multer ^1.4.5-lts.1`, `pdf-parse ^1.1.1`, `mammoth ^1.7.0`
  - devDependencies: `@types/multer ^1.4.12`
- [ ] `pnpm install`
- [ ] Add migration `packages/server/src/db/migrations/008_attachments.sql` (DDL above)
- [ ] Update the `migrations.test.ts` expected table list to include `attachments`
- [ ] Run tests — all pass (still 125, just one expected list extension)
- [ ] Commit: `feat(server): install ingestion deps + add attachments table (Plan 6 Task 1)`

---

## Task 2: ingestionService — parsers + storage (TDD)

**Files:**
- Create `packages/server/src/services/ingestionService.ts`
- Create `packages/server/src/services/__tests__/ingestionService.test.ts`

API surface:

```typescript
export interface Attachment {
  id: string;
  projectId: string;
  kind: 'pdf' | 'docx' | 'image' | 'url-snapshot';
  originalName: string;
  storedPath: string;          // path relative to data/
  parsedText?: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export async function ingestFile(db, opts: {
  projectId: string;
  uploadsRoot: string;          // <dataDir>/projects/<projectId>/uploads
  originalName: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<Attachment>

export async function ingestUrl(db, opts: { projectId: string; uploadsRoot: string; url: string }): Promise<Attachment>

export function listAttachments(db, projectId: string): Attachment[]
export function getAttachment(db, id: string): Attachment | null
export function readAttachmentBytes(dataDir: string, attachment: Attachment): Buffer
```

`ingestFile` decides kind by mime: `application/pdf` → 'pdf' + pdf-parse; `vnd.openxmlformats...document` → 'docx' + mammoth; `image/*` → 'image', no text. Returns full Attachment record. Writes file to `uploadsRoot/<uuid>.<ext>`.

`ingestUrl` does `fetch(url)`, takes `text/html` → strip via `string.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style...etc>/g, '').replace(/<[^>]+>/g, ' ')` → returns text (cheap; no readability library). Stores raw HTML in file, parsed text in DB.

- [ ] Tests with fixture PDF/DOCX/image bytes (inline tiny buffers for unit test, no real files needed):
  - `ingestFile(image/png)` → kind=image, no parsedText
  - `ingestFile(text/plain disguised as pdf)` → parses (or errors gracefully — null parsedText, kind still 'pdf')
  - `ingestUrl(html)` mocking fetch → kind='url-snapshot', parsedText has stripped text
  - `listAttachments` returns chronological
  - `readAttachmentBytes` returns the original buffer back

For PDF/DOCX, use the minimum valid byte structures OR skip those tests with `.skip` and rely on integration testing (the file-format parsing libraries handle their own tests).

- [ ] Implement
- [ ] Tests pass
- [ ] Commit: `feat(server): add ingestionService (PDF/DOCX/image/URL parsing + storage) (Plan 6 Task 2)`

---

## Task 3: REST route `/api/projects/:id/ingest`

**Files:**
- Create `packages/server/src/routes/ingest.ts`
- Create `packages/server/src/routes/__tests__/ingest.route.test.ts`
- Modify `packages/server/src/index.ts`

```typescript
import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import type Database from 'better-sqlite3';
import { requireAuth } from '../middleware/auth.js';
import { getProject } from '../services/projectService.js';
import { ingestFile, ingestUrl, listAttachments } from '../services/ingestionService.js';
import { join } from 'node:path';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

export function buildIngestRouter(db: Database.Database, dataDir: string): Router {
  const r = Router({ mergeParams: true });
  r.use(requireAuth);

  r.post('/', upload.array('files', 5), async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const project = getProject(db, projectId);
    if (!project || project.ownerId !== req.user!.id) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } });
      return;
    }
    const uploadsRoot = join(dataDir, 'projects', projectId, 'uploads');
    const out = [];
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    for (const f of files) {
      out.push(await ingestFile(db, {
        projectId, uploadsRoot,
        originalName: f.originalname, mimeType: f.mimetype, buffer: f.buffer,
      }));
    }
    const url = typeof req.body?.url === 'string' ? req.body.url : null;
    if (url) out.push(await ingestUrl(db, { projectId, uploadsRoot, url }));
    if (out.length === 0) {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: '需要 files 或 url' } });
      return;
    }
    res.status(201).json({ attachments: out });
  });

  r.get('/', (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const project = getProject(db, projectId);
    if (!project || project.ownerId !== req.user!.id) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } });
      return;
    }
    res.json({ attachments: listAttachments(db, projectId) });
  });

  return r;
}
```

Wire in `index.ts`:
```typescript
import { buildIngestRouter } from './routes/ingest.js';
// after plugin/mcp routers:
app.use('/api/projects/:id/ingest', buildIngestRouter(db, deps.dataDir));
app.use('/api/projects/:id/attachments', buildIngestRouter(db, deps.dataDir));  // same router for GET
```

Actually use TWO mounts only if needed for path semantics — alternatively keep `/ingest` POST + `/ingest` GET to list, or split. Simplest: keep one router at `/ingest` handling both. Update test accordingly.

- [ ] Tests:
  - POST text/plain file → 201 + attachment record
  - POST with url → 201 + url-snapshot attachment (mock fetch)
  - POST with no files and no url → 400
  - GET lists prior uploads
  - 401 without auth
- [ ] Implement
- [ ] Tests pass
- [ ] Commit: `feat(server): add /api/projects/:id/ingest route (multer + parsers) (Plan 6 Task 3)`

---

## Task 4: Verify + push

- Total tests: ~135 (125 prior + ~5 ingestion + ~5 routes)
- All 4 builds green
- Push

---

## Acceptance Criteria

- [ ] migration 008 creates attachments table
- [ ] ingestionService parses PDF/DOCX, stores images as-is, fetches URL + strips HTML
- [ ] POST /api/projects/:id/ingest accepts multipart files + optional url, returns 201 with Attachment records
- [ ] GET lists attachments in chronological order
- [ ] file size limit 20MB; max 5 files per request
- [ ] all builds + tests + push clean

---

## Risks / Notes

1. `pdf-parse` has a known require-time fixture lookup that may need `pdf-parse/lib/pdf-parse.js` import path. If runtime crashes on require, use the deep import.
2. `mammoth` works on DOCX buffers via `mammoth.extractRawText({buffer})`.
3. URL fetch with no User-Agent may be blocked by some servers. Add `User-Agent: DesignBridge/2.0` header.
4. Multer memory storage holds the whole 20MB in memory per request. For M1 this is fine (single-user setup). M2 may stream to disk via diskStorage.
5. Plan 7 chat endpoint will load attachments associated with the user's current message and feed parsedText / images into the AI call.

---

**Plan end. 4 Tasks.**
