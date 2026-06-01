import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../../db/connection';
import { runMigrations, defaultMigrationsDir } from '../../db/migrator';
import { createUser } from '../authService';
import { createProject } from '../projectService';
import { appendTurn } from '../turnService';
import {
  createArtifact,
  listArtifacts,
  getArtifact,
  readArtifactPayload,
} from '../artifactService';

let dataDir: string;
let db: ReturnType<typeof openDb>;
let projectId: string;
let turnId: string;

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'art-'));
  db = openDb(dataDir);
  runMigrations(db, defaultMigrationsDir());
  const u = await createUser(db, { name: 'A', email: 'a@x.com', password: 'pw12345678' });
  projectId = createProject(db, u.id, 'P').id;
  turnId = appendTurn(db, { projectId, mode: 'consult', userText: 'x', aiResponse: { text: '' } }).id;
});
afterEach(() => { db.close(); rmSync(dataDir, { recursive: true, force: true }); });

function artifactsRoot() {
  return join(dataDir, 'projects', projectId, 'artifacts');
}

describe('artifactService', () => {
  it('createArtifact writes file + row', () => {
    const a = createArtifact(db, {
      projectId, createdByTurn: turnId,
      kind: 'page-graph', name: 'ia',
      payload: '{"nodes":[],"edges":[]}', payloadExt: 'json',
      artifactsRoot: artifactsRoot(),
    });
    expect(a.id).toBeDefined();
    expect(a.kind).toBe('page-graph');
    expect(a.name).toBe('ia');
    // file exists on disk
    expect(existsSync(join(dataDir, a.payloadPath))).toBe(true);
    // row in DB
    const row = db.prepare('SELECT * FROM artifacts WHERE id = ?').get(a.id);
    expect(row).toBeTruthy();
  });

  it('second createArtifact with same kind+name supersedes the first', () => {
    const first = createArtifact(db, {
      projectId, createdByTurn: turnId,
      kind: 'page-graph', name: 'ia',
      payload: '{"nodes":[],"edges":[]}', payloadExt: 'json',
      artifactsRoot: artifactsRoot(),
    });
    const second = createArtifact(db, {
      projectId, createdByTurn: turnId,
      kind: 'page-graph', name: 'ia',
      payload: '{"nodes":[{"id":"home","label":"首頁"}],"edges":[]}', payloadExt: 'json',
      artifactsRoot: artifactsRoot(),
    });
    // first should now have superseded_by = second.id
    const firstRow = db.prepare('SELECT superseded_by FROM artifacts WHERE id = ?').get(first.id) as { superseded_by: string };
    expect(firstRow.superseded_by).toBe(second.id);
    // second is still active
    expect(second.supersededBy).toBeNull();
  });

  it('listArtifacts excludes superseded by default', () => {
    createArtifact(db, {
      projectId, createdByTurn: turnId,
      kind: 'page-graph', name: 'ia',
      payload: 'v1', payloadExt: 'json',
      artifactsRoot: artifactsRoot(),
    });
    createArtifact(db, {
      projectId, createdByTurn: turnId,
      kind: 'page-graph', name: 'ia',
      payload: 'v2', payloadExt: 'json',
      artifactsRoot: artifactsRoot(),
    });
    const list = listArtifacts(db, projectId, { kind: 'page-graph' });
    expect(list).toHaveLength(1);
    expect(list[0].supersededBy).toBeNull();
  });

  it('listArtifacts includeSuperseded includes all', () => {
    createArtifact(db, {
      projectId, createdByTurn: turnId,
      kind: 'page-graph', name: 'ia',
      payload: 'v1', payloadExt: 'json',
      artifactsRoot: artifactsRoot(),
    });
    createArtifact(db, {
      projectId, createdByTurn: turnId,
      kind: 'page-graph', name: 'ia',
      payload: 'v2', payloadExt: 'json',
      artifactsRoot: artifactsRoot(),
    });
    const all = listArtifacts(db, projectId, { kind: 'page-graph', includeSuperseded: true });
    expect(all).toHaveLength(2);
  });

  it('getArtifact returns artifact by id', () => {
    const a = createArtifact(db, {
      projectId, createdByTurn: turnId,
      kind: 'page-graph', name: 'ia',
      payload: '{}', payloadExt: 'json',
      artifactsRoot: artifactsRoot(),
    });
    const found = getArtifact(db, a.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(a.id);
    expect(found!.kind).toBe('page-graph');
  });

  it('readArtifactPayload reads file content', () => {
    const content = '{"nodes":[{"id":"home","label":"首頁"}],"edges":[]}';
    const a = createArtifact(db, {
      projectId, createdByTurn: turnId,
      kind: 'page-graph', name: 'ia',
      payload: content, payloadExt: 'json',
      artifactsRoot: artifactsRoot(),
    });
    const read = readArtifactPayload(dataDir, a);
    expect(read).toBe(content);
  });
});
