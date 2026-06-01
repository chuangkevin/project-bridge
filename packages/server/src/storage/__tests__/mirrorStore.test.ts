import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  writeMirrorFiles, mirrorBaseDir, readMirrorFile,
  saveMirrorMeta, loadMirrorMeta, deleteMirror,
  type MirrorArtifactMeta,
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

  it('slug sanitizes traversal in artifactId', () => {
    writeMirrorFiles('proj1', '../../escape', { html: 'x', css: '', screenshot: Buffer.from(''), assets: [] }, { baseDir });
    expect(existsSync(join(baseDir, 'projects'))).toBe(true);
    expect(existsSync(join(baseDir, '..', 'escape'))).toBe(false);
  });

  it('readMirrorFile blocks invalid file paths', () => {
    writeMirrorFiles('proj1', 'ar_1', { html: 'x', css: '', screenshot: Buffer.from(''), assets: [] }, { baseDir });
    expect(() => readMirrorFile('proj1', 'ar_1', '../../etc/passwd', { baseDir })).toThrow(/invalid/i);
    expect(() => readMirrorFile('proj1', 'ar_1', 'page.html', { baseDir })).not.toThrow();
    expect(() => readMirrorFile('proj1', 'ar_1', 'assets/a.png', { baseDir })).toThrow(); // not present
  });

  it('readMirrorFile allows valid asset filenames', () => {
    writeMirrorFiles('proj1', 'ar_1', {
      html: 'x', css: '', screenshot: Buffer.from(''),
      assets: [{ filename: 'logo.png', bytes: Buffer.from([1, 2, 3]) }],
    }, { baseDir });
    expect(readMirrorFile('proj1', 'ar_1', 'assets/logo.png', { baseDir })).toEqual(Buffer.from([1, 2, 3]));
  });

  it('saveMirrorMeta / loadMirrorMeta round-trips', () => {
    const meta: MirrorArtifactMeta = {
      kind: 'mirror', id: 'ar_1', sourceUrl: 'https://e.com', sourceType: 'url',
      crawledAt: '2026-05-29T00:00:00Z',
      files: { html: 'page.html', css: 'styles.css', screenshot: 'screenshot.png' },
      warnings: [], editable: false,
    };
    saveMirrorMeta('proj1', meta, { baseDir });
    expect(loadMirrorMeta('proj1', 'ar_1', { baseDir })).toEqual(meta);
  });

  it('loadMirrorMeta returns null when absent', () => {
    expect(loadMirrorMeta('proj1', 'missing', { baseDir })).toBeNull();
  });

  it('deleteMirror removes the directory + meta', () => {
    writeMirrorFiles('proj1', 'ar_1', { html: 'x', css: '', screenshot: Buffer.from(''), assets: [] }, { baseDir });
    saveMirrorMeta('proj1', {
      kind: 'mirror', id: 'ar_1', sourceUrl: 'x', sourceType: 'url', crawledAt: 'x',
      files: { html: 'page.html', css: 'styles.css', screenshot: 'screenshot.png' },
      warnings: [], editable: false,
    }, { baseDir });
    deleteMirror('proj1', 'ar_1', { baseDir });
    expect(loadMirrorMeta('proj1', 'ar_1', { baseDir })).toBeNull();
    expect(existsSync(mirrorBaseDir('proj1', 'ar_1', baseDir))).toBe(false);
  });

  it('rejects asset filenames with traversal or dots', () => {
    writeMirrorFiles('proj1', 'ar_1', {
      html: 'x', css: '', screenshot: Buffer.from(''),
      assets: [
        { filename: '../escape.png', bytes: Buffer.from('escape') },
        { filename: '.hidden', bytes: Buffer.from('hidden') },
        { filename: 'safe.png', bytes: Buffer.from('safe') },
      ],
    }, { baseDir });
    const root = mirrorBaseDir('proj1', 'ar_1', baseDir);
    expect(existsSync(join(root, 'assets', 'safe.png'))).toBe(true);
    expect(existsSync(join(root, 'assets', '..', 'escape.png'))).toBe(false);
  });
});
