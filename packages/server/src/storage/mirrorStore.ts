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

export function writeMirrorFiles(
  projectId: string,
  artifactId: string,
  input: MirrorWriteInput,
  opts: MirrorStoreOpts = {},
): void {
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

export function readMirrorFile(
  projectId: string,
  artifactId: string,
  filename: string,
  opts: MirrorStoreOpts = {},
): Buffer {
  if (
    filename !== 'page.html' &&
    filename !== 'styles.css' &&
    filename !== 'screenshot.png' &&
    !/^assets\/[A-Za-z0-9._-]{1,128}$/.test(filename)
  ) {
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
