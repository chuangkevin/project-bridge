import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import type { ThemeFile } from '../services/themeMerger';
export type { ThemeFile } from '../services/themeMerger';

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
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(theme, null, 2), 'utf8');
}

export function loadTheme(projectId: string, opts: ThemeStoreOpts = {}): ThemeFile | null {
  const p = themePath(projectId, opts.baseDir);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
}
