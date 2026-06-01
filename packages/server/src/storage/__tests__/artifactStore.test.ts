import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { saveArtifact, loadArtifact, listArtifacts, deleteArtifact } from '../artifactStore';
import { AST_SCHEMA_VERSION, type SemanticUIAst } from '@designbridge/ast';

let baseDir: string;
beforeEach(() => { baseDir = mkdtempSync(join(tmpdir(), 'astore-')); });
afterEach(() => { rmSync(baseDir, { recursive: true, force: true }); });

const ast = (artifactId: string): SemanticUIAst => ({
  schemaVersion: AST_SCHEMA_VERSION, artifactId, kind: 'page',
  root: { id: 'n_root', type: 'Container', props: {}, layout: { kind: 'flow' }, style: {}, bindings: [], events: [], constraints: [], children: [] },
});

describe('artifactStore', () => {
  it('saves and loads an artifact (round-trip)', () => {
    saveArtifact('proj1', ast('home'), { baseDir });
    const loaded = loadArtifact('proj1', 'home', { baseDir });
    expect(loaded?.artifactId).toBe('home');
    expect(loaded?.root.type).toBe('Container');
  });
  it('returns null for a missing artifact', () => {
    expect(loadArtifact('proj1', 'nope', { baseDir })).toBeNull();
  });
  it('lists artifact ids for a project', () => {
    saveArtifact('proj1', ast('home'), { baseDir });
    saveArtifact('proj1', ast('list-page'), { baseDir });
    expect(listArtifacts('proj1', { baseDir }).sort((a, b) => a.id.localeCompare(b.id))).toEqual([
      { id: 'home', kind: 'ast' },
      { id: 'list-page', kind: 'ast' },
    ]);
  });
  it('lists empty for an unknown project', () => {
    expect(listArtifacts('ghost', { baseDir })).toEqual([]);
  });
  it('lists both AST and Mirror artifacts', () => {
    saveArtifact('proj1', ast('home'), { baseDir });
    const mirrorPath = join(baseDir, 'projects', 'proj1', 'artifacts', 'ar_m.mirror.json');
    mkdirSync(dirname(mirrorPath), { recursive: true });
    writeFileSync(mirrorPath, '{}');
    expect(listArtifacts('proj1', { baseDir }).sort((a, b) => a.id.localeCompare(b.id))).toEqual([
      { id: 'ar_m', kind: 'mirror' },
      { id: 'home', kind: 'ast' },
    ]);
  });
  it('deletes an artifact', () => {
    saveArtifact('proj1', ast('home'), { baseDir });
    deleteArtifact('proj1', 'home', { baseDir });
    expect(loadArtifact('proj1', 'home', { baseDir })).toBeNull();
  });
  it('sanitizes ids so nothing escapes baseDir (path traversal)', () => {
    saveArtifact('../../evil', ast('../escape'), { baseDir });
    // The escape sequence must NOT create anything outside baseDir.
    expect(existsSync(join(baseDir, '..', '..', 'evil'))).toBe(false);
    // And the same raw ids resolve back to the sanitized location.
    expect(loadArtifact('../../evil', '../escape', { baseDir })).not.toBeNull();
  });
  it('writes deterministic JSON (stable across re-saves)', () => {
    saveArtifact('p', ast('a'), { baseDir });
    const first = JSON.stringify(loadArtifact('p', 'a', { baseDir }));
    saveArtifact('p', ast('a'), { baseDir });
    const second = JSON.stringify(loadArtifact('p', 'a', { baseDir }));
    expect(second).toBe(first);
  });
});
