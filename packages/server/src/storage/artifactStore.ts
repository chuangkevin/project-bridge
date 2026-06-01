import { mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { toJson, fromJson, BASE_COMPONENTS, type SemanticUIAst } from '@designbridge/ast';

export interface StoreOpts {
  /** Base data dir. Defaults to the server's data/ dir (sibling of bridge.db). */
  baseDir?: string;
}

function defaultBaseDir(): string {
  return resolve(__dirname, '../../data');
}

/** Sanitize an id into a safe single path segment (no traversal, no separators). */
function slug(id: string): string {
  const s = String(id).replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '_').slice(0, 128);
  return s.length ? s : 'unnamed';
}

function artifactsDir(baseDir: string, projectId: string): string {
  return join(baseDir, 'projects', slug(projectId), 'artifacts');
}
function artifactPath(baseDir: string, projectId: string, artifactId: string): string {
  return join(artifactsDir(baseDir, projectId), `${slug(artifactId)}.ast.json`);
}

/** Persist an AST artifact as deterministic JSON. */
export function saveArtifact(projectId: string, ast: SemanticUIAst, opts: StoreOpts = {}): void {
  const baseDir = opts.baseDir ?? defaultBaseDir();
  mkdirSync(artifactsDir(baseDir, projectId), { recursive: true });
  writeFileSync(artifactPath(baseDir, projectId, ast.artifactId), toJson(ast, { pretty: true }), 'utf8');
}

/** Load + validate an artifact, or null if absent. Throws if the file exists but is invalid. */
export function loadArtifact(projectId: string, artifactId: string, opts: StoreOpts = {}): SemanticUIAst | null {
  const baseDir = opts.baseDir ?? defaultBaseDir();
  const p = artifactPath(baseDir, projectId, artifactId);
  if (!existsSync(p)) return null;
  return fromJson(readFileSync(p, 'utf8'), { registry: BASE_COMPONENTS });
}

export interface ArtifactListEntry {
  id: string;
  kind: 'ast' | 'mirror';
}

/** List artifacts (AST + Mirror) stored for a project, with kind discriminator. */
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

export function deleteArtifact(projectId: string, artifactId: string, opts: StoreOpts = {}): void {
  const baseDir = opts.baseDir ?? defaultBaseDir();
  const p = artifactPath(baseDir, projectId, artifactId);
  if (existsSync(p)) rmSync(p);
}
