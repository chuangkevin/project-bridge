/**
 * ingestionService — parse and store uploaded files / URL snapshots.
 *
 * Supported kinds:
 *   pdf          — application/pdf → pdf-parse text extraction
 *   docx         — application/vnd.openxmlformats-officedocument.wordprocessingml.document → mammoth
 *   image        — image/* → stored as-is, no text (vision handled by AI call)
 *   url-snapshot — fetched HTML → cheap tag-strip for parsedText, raw HTML stored on disk
 *
 * Files are written to: <uploadsRoot>/<uuid>.<ext>
 * DB record stored in `attachments` table.
 */
import type Database from 'better-sqlite3';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { v4 as uuid } from 'uuid';

// ─── pdf-parse: use deep import to avoid require-time test-file fixture lookup ───
// The package's index.js does `require('./test/...') ` in some versions which crashes
// in ESM unless we bypass it.
let _pdfParse: ((buf: Buffer) => Promise<{ text: string }>) | null = null;
async function getPdfParse() {
  if (!_pdfParse) {
    try {
      // Try deep import first to skip the fixture-loading side-effect
      const mod = await import('pdf-parse/lib/pdf-parse.js' as string);
      _pdfParse = mod.default ?? mod;
    } catch {
      const mod = await import('pdf-parse');
      _pdfParse = mod.default ?? mod;
    }
  }
  return _pdfParse!;
}

let _mammoth: typeof import('mammoth') | null = null;
async function getMammoth() {
  if (!_mammoth) {
    const mod = await import('mammoth');
    _mammoth = (mod.default ?? mod) as typeof import('mammoth');
  }
  return _mammoth!;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Attachment {
  id: string;
  projectId: string;
  kind: 'pdf' | 'docx' | 'image' | 'url-snapshot';
  originalName: string;
  storedPath: string;   // path relative to dataDir (e.g. "projects/<id>/uploads/<uuid>.pdf")
  parsedText?: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

// ─── Row <-> Camel ────────────────────────────────────────────────────────────

interface AttachmentRow {
  id: string;
  project_id: string;
  kind: string;
  original_name: string;
  stored_path: string;
  parsed_text: string | null;
  mime_type: string;
  size_bytes: number;
  created_at: string;
}

function rowToAttachment(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    projectId: row.project_id,
    kind: row.kind as Attachment['kind'],
    originalName: row.original_name,
    storedPath: row.stored_path,
    parsedText: row.parsed_text ?? undefined,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extForMime(mimeType: string, originalName: string): string {
  const fromName = extname(originalName);
  if (fromName) return fromName;
  const map: Record<string, string> = {
    'application/pdf': '.pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'text/html': '.html',
    'text/plain': '.txt',
  };
  return map[mimeType] ?? '.bin';
}

function kindForMime(mimeType: string): Attachment['kind'] {
  if (mimeType === 'application/pdf') return 'pdf';
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword'
  ) return 'docx';
  if (mimeType.startsWith('image/')) return 'image';
  return 'image'; // fallback: store as opaque binary
}

/** Very cheap HTML → readable text strip (no external dependency) */
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function insertRow(db: Database.Database, a: Attachment): void {
  db.prepare(`
    INSERT INTO attachments (id, project_id, kind, original_name, stored_path, parsed_text, mime_type, size_bytes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(a.id, a.projectId, a.kind, a.originalName, a.storedPath, a.parsedText ?? null, a.mimeType, a.sizeBytes);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface IngestFileOpts {
  projectId: string;
  uploadsRoot: string;   // absolute path: <dataDir>/projects/<projectId>/uploads
  originalName: string;
  mimeType: string;
  buffer: Buffer;
}

/**
 * Ingest an uploaded file buffer. Writes file to uploadsRoot, parses text if
 * applicable, inserts DB record, returns full Attachment.
 */
export async function ingestFile(db: Database.Database, opts: IngestFileOpts): Promise<Attachment> {
  const { projectId, uploadsRoot, originalName, mimeType, buffer } = opts;

  mkdirSync(uploadsRoot, { recursive: true });

  const id = uuid();
  const ext = extForMime(mimeType, originalName);
  const filename = `${id}${ext}`;
  const absPath = join(uploadsRoot, filename);
  // storedPath is relative to dataDir — caller keeps track of dataDir separately
  // We store only the filename-relative portion under uploads/
  const storedPath = join('projects', projectId, 'uploads', filename);

  writeFileSync(absPath, buffer);

  const kind = kindForMime(mimeType);
  let parsedText: string | undefined;

  if (kind === 'pdf') {
    try {
      const pdfParse = await getPdfParse();
      const result = await pdfParse(buffer);
      parsedText = result.text?.trim() || undefined;
    } catch {
      parsedText = undefined;
    }
  } else if (kind === 'docx') {
    try {
      const mammoth = await getMammoth();
      const result = await mammoth.extractRawText({ buffer });
      parsedText = result.value?.trim() || undefined;
    } catch {
      parsedText = undefined;
    }
  }
  // image: no text extraction (vision handled by multimodal AI call)

  const attachment: Attachment = {
    id,
    projectId,
    kind,
    originalName,
    storedPath,
    parsedText,
    mimeType,
    sizeBytes: buffer.length,
    createdAt: new Date().toISOString(),
  };

  insertRow(db, attachment);

  // Re-read to get DB-stamped createdAt
  return getAttachment(db, id) ?? attachment;
}

export interface IngestUrlOpts {
  projectId: string;
  uploadsRoot: string;
  url: string;
}

/**
 * Fetch a URL, strip HTML to text, store raw HTML on disk, return Attachment.
 */
export async function ingestUrl(db: Database.Database, opts: IngestUrlOpts): Promise<Attachment> {
  const { projectId, uploadsRoot, url } = opts;

  mkdirSync(uploadsRoot, { recursive: true });

  const response = await fetch(url, {
    headers: { 'User-Agent': 'DesignBridge/2.0' },
  });
  const html = await response.text();
  const buffer = Buffer.from(html, 'utf8');

  const id = uuid();
  const filename = `${id}.html`;
  const absPath = join(uploadsRoot, filename);
  const storedPath = join('projects', projectId, 'uploads', filename);

  writeFileSync(absPath, buffer);

  const parsedText = stripHtml(html) || undefined;

  const attachment: Attachment = {
    id,
    projectId,
    kind: 'url-snapshot',
    originalName: url,
    storedPath,
    parsedText,
    mimeType: 'text/html',
    sizeBytes: buffer.length,
    createdAt: new Date().toISOString(),
  };

  insertRow(db, attachment);

  return getAttachment(db, id) ?? attachment;
}

/**
 * List all attachments for a project in chronological order (oldest first).
 */
export function listAttachments(db: Database.Database, projectId: string): Attachment[] {
  const rows = db.prepare(
    'SELECT * FROM attachments WHERE project_id = ? ORDER BY created_at ASC, id ASC'
  ).all(projectId) as AttachmentRow[];
  return rows.map(rowToAttachment);
}

/**
 * Get a single attachment by ID.
 */
export function getAttachment(db: Database.Database, id: string): Attachment | null {
  const row = db.prepare('SELECT * FROM attachments WHERE id = ?').get(id) as AttachmentRow | undefined;
  return row ? rowToAttachment(row) : null;
}

/**
 * Read the raw bytes of an attachment from disk.
 * @param dataDir  Absolute path to the server's data directory
 * @param attachment  Attachment record (storedPath is relative to dataDir)
 */
export function readAttachmentBytes(dataDir: string, attachment: Attachment): Buffer {
  const absPath = join(dataDir, attachment.storedPath);
  return readFileSync(absPath);
}
