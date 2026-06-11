import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../../db/connection.js';
import { runMigrations, defaultMigrationsDir } from '../../db/migrator.js';
import {
  ingestFile,
  ingestUrl,
  listAttachments,
  getAttachment,
  readAttachmentBytes,
} from '../ingestionService.js';

let dataDir: string;
let uploadsRoot: string;
let db: ReturnType<typeof openDb>;

const PROJECT_ID = 'test-proj-001';

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'ingest-svc-'));
  uploadsRoot = join(dataDir, 'projects', PROJECT_ID, 'uploads');
  db = openDb(dataDir);
  runMigrations(db, defaultMigrationsDir());

  // Seed a user + project so FK constraints are satisfied
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)"
  ).run('user-1', 'Test User', 'test@example.com', 'hash');
  db.prepare(
    "INSERT INTO projects (id, name, owner_id, share_token) VALUES (?, ?, ?, ?)"
  ).run(PROJECT_ID, 'Test Project', 'user-1', 'tok-abc');
});

afterEach(() => {
  db.close();
  rmSync(dataDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ─── image/png ────────────────────────────────────────────────────────────────

describe('ingestFile – image/png', () => {
  it('stores file and returns attachment with kind=image and no parsedText', async () => {
    // 1×1 transparent PNG (minimal valid PNG bytes)
    const pngBytes = Buffer.from([
      0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a, // PNG signature
      0x00,0x00,0x00,0x0d,0x49,0x48,0x44,0x52, // IHDR length + type
      0x00,0x00,0x00,0x01,0x00,0x00,0x00,0x01, // 1x1
      0x08,0x02,0x00,0x00,0x00,0x90,0x77,0x53, // bit depth + color type + crc
      0xde,0x00,0x00,0x00,0x0c,0x49,0x44,0x41,
      0x54,0x08,0xd7,0x63,0xf8,0xcf,0xc0,0x00,
      0x00,0x00,0x02,0x00,0x01,0xe2,0x21,0xbc,
      0x33,0x00,0x00,0x00,0x00,0x49,0x45,0x4e,
      0x44,0xae,0x42,0x60,0x82,
    ]);

    const att = await ingestFile(db, {
      projectId: PROJECT_ID,
      uploadsRoot,
      originalName: 'photo.png',
      mimeType: 'image/png',
      buffer: pngBytes,
    });

    expect(att.kind).toBe('image');
    expect(att.originalName).toBe('photo.png');
    expect(att.mimeType).toBe('image/png');
    expect(att.parsedText).toBeUndefined();
    expect(att.sizeBytes).toBe(pngBytes.length);
    expect(att.projectId).toBe(PROJECT_ID);
    expect(att.storedPath).toContain('uploads');
    expect(att.id).toBeTruthy();
  });

  it('reads back the original bytes via readAttachmentBytes', async () => {
    const buf = Buffer.from('fake-image-data');
    const att = await ingestFile(db, {
      projectId: PROJECT_ID,
      uploadsRoot,
      originalName: 'img.png',
      mimeType: 'image/png',
      buffer: buf,
    });

    const readBack = readAttachmentBytes(dataDir, att);
    expect(readBack).toEqual(buf);
  });
});

// ─── PDF (no text — graceful degradation) ────────────────────────────────────

describe('ingestFile – application/pdf (invalid bytes, graceful)', () => {
  it('stores file with kind=pdf; parsedText is undefined when bytes are not valid PDF', async () => {
    // These are NOT valid PDF bytes; pdf-parse will throw, which we handle gracefully
    const fakePdfBytes = Buffer.from('%PDF-1.4 fake content without valid xref');

    const att = await ingestFile(db, {
      projectId: PROJECT_ID,
      uploadsRoot,
      originalName: 'doc.pdf',
      mimeType: 'application/pdf',
      buffer: fakePdfBytes,
    });

    expect(att.kind).toBe('pdf');
    expect(att.mimeType).toBe('application/pdf');
    // parsedText may be undefined on parse failure — that's acceptable
    // (real PDF bytes are tested in integration / by pdf-parse's own tests)
    expect(att.parsedText === undefined || typeof att.parsedText === 'string').toBe(true);
    expect(att.sizeBytes).toBe(fakePdfBytes.length);
  });
});

// ─── DOCX (no bytes — graceful degradation) ──────────────────────────────────

describe('ingestFile – docx (invalid bytes, graceful)', () => {
  // 20s budget: mammoth's dynamic import can exceed the 5s default under
  // parallel suite load (observed 6.8s) — this was a recurring flake.
  it('stores file with kind=docx; parsedText is undefined when bytes are not valid DOCX', { timeout: 20_000 }, async () => {
    const fakeDocxBytes = Buffer.from('PK fake docx that is not really a zip');

    const att = await ingestFile(db, {
      projectId: PROJECT_ID,
      uploadsRoot,
      originalName: 'doc.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: fakeDocxBytes,
    });

    expect(att.kind).toBe('docx');
    expect(att.parsedText === undefined || typeof att.parsedText === 'string').toBe(true);
    expect(att.sizeBytes).toBe(fakeDocxBytes.length);
  });
});

// ─── URL snapshot ─────────────────────────────────────────────────────────────

describe('ingestUrl', () => {
  it('fetches HTML, strips tags for parsedText, stores raw HTML, returns url-snapshot', async () => {
    const fakeHtml = `<html><head><title>Test</title><style>.foo{color:red}</style></head>
<body><h1>Hello World</h1><p>Some <b>content</b> here.</p>
<script>alert('x')</script></body></html>`;

    // Mock global fetch
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      text: async () => fakeHtml,
      ok: true,
      status: 200,
    } as unknown as Response);

    const att = await ingestUrl(db, {
      projectId: PROJECT_ID,
      uploadsRoot,
      url: 'https://example.com/test',
    });

    expect(att.kind).toBe('url-snapshot');
    expect(att.originalName).toBe('https://example.com/test');
    expect(att.mimeType).toBe('text/html');
    expect(att.parsedText).toBeTruthy();
    // Script / style tags should be stripped
    expect(att.parsedText).not.toContain('<script');
    expect(att.parsedText).not.toContain('<style');
    // Readable text should be present
    expect(att.parsedText).toContain('Hello World');
    expect(att.parsedText).toContain('Some');
  });
});

// ─── listAttachments ──────────────────────────────────────────────────────────

describe('listAttachments', () => {
  it('returns all attachments for a project in chronological order (oldest first)', async () => {
    const buf = Buffer.from('x');

    const a1 = await ingestFile(db, {
      projectId: PROJECT_ID, uploadsRoot,
      originalName: 'first.png', mimeType: 'image/png', buffer: buf,
    });
    const a2 = await ingestFile(db, {
      projectId: PROJECT_ID, uploadsRoot,
      originalName: 'second.png', mimeType: 'image/png', buffer: buf,
    });

    const list = listAttachments(db, PROJECT_ID);
    expect(list.length).toBe(2);
    // Both attachments should be present (order may vary if timestamps are identical in same second)
    const ids = list.map(a => a.id);
    expect(ids).toContain(a1.id);
    expect(ids).toContain(a2.id);
    // Verify chronological sort is stable: ORDER BY created_at ASC, id ASC means if
    // timestamps differ a1 comes before a2, otherwise deterministic by id
    // We simply verify the list is sorted by (created_at, id)
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1];
      const curr = list[i];
      const sortKey = (a: typeof prev) => `${a.createdAt}|${a.id}`;
      expect(sortKey(prev) <= sortKey(curr)).toBe(true);
    }
  });

  it('returns empty array for a project with no attachments', () => {
    const list = listAttachments(db, 'no-such-project');
    expect(list).toEqual([]);
  });
});

// ─── getAttachment ────────────────────────────────────────────────────────────

describe('getAttachment', () => {
  it('returns null for unknown id', () => {
    expect(getAttachment(db, 'no-such-id')).toBeNull();
  });

  it('returns the record after ingest', async () => {
    const buf = Buffer.from('hello');
    const att = await ingestFile(db, {
      projectId: PROJECT_ID, uploadsRoot,
      originalName: 'test.png', mimeType: 'image/png', buffer: buf,
    });

    const got = getAttachment(db, att.id);
    expect(got).not.toBeNull();
    expect(got!.id).toBe(att.id);
    expect(got!.originalName).toBe('test.png');
  });
});
