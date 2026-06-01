import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../../db/connection';
import { runMigrations, defaultMigrationsDir } from '../../db/migrator';
import { createUser } from '../authService';
import { createProject } from '../projectService';
import { appendTurn } from '../turnService';
import { addFact, listFacts, supersedeFact, getFact } from '../factService';

let dataDir: string;
let db: ReturnType<typeof openDb>;
let projectId: string;
let turnId: string;

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'fact-'));
  db = openDb(dataDir);
  runMigrations(db, defaultMigrationsDir());
  const u = await createUser(db, { name: 'A', email: 'a@x.com', password: 'pw12345678' });
  projectId = createProject(db, u.id, 'P').id;
  turnId = appendTurn(db, { projectId, mode: 'consult', userText: 'x', aiResponse: { text: '' } }).id;
});
afterEach(() => { db.close(); rmSync(dataDir, { recursive: true, force: true }); });

describe('factService', () => {
  it('addFact inserts + returns it', () => {
    const f = addFact(db, { projectId, turnId, kind: 'requirement', text: '目標族群 30-50 女性' });
    expect(f.id).toBeDefined();
    expect(f.kind).toBe('requirement');
  });

  it('listFacts returns valid (non-superseded) facts', () => {
    addFact(db, { projectId, turnId, kind: 'requirement', text: 'a' });
    addFact(db, { projectId, turnId, kind: 'page', text: 'b' });
    const r = listFacts(db, projectId, {});
    expect(r).toHaveLength(2);
  });

  it('listFacts with kind filter', () => {
    addFact(db, { projectId, turnId, kind: 'requirement', text: 'a' });
    addFact(db, { projectId, turnId, kind: 'page', text: 'b' });
    expect(listFacts(db, projectId, { kind: 'requirement' })).toHaveLength(1);
  });

  it('supersedeFact links old → new and listFacts excludes the superseded one', () => {
    const old = addFact(db, { projectId, turnId, kind: 'requirement', text: 'old' });
    const newer = addFact(db, { projectId, turnId, kind: 'requirement', text: 'new' });
    supersedeFact(db, old.id, newer.id);
    const list = listFacts(db, projectId, {});
    expect(list).toHaveLength(1);
    expect(list[0].text).toBe('new');
  });

  it('rejects invalid kind', () => {
    expect(() => addFact(db, { projectId, turnId, kind: 'invalid' as never, text: 'x' })).toThrow();
  });

  it('getFact returns the fact even if superseded', () => {
    const old = addFact(db, { projectId, turnId, kind: 'requirement', text: 'old' });
    const newer = addFact(db, { projectId, turnId, kind: 'requirement', text: 'new' });
    supersedeFact(db, old.id, newer.id);
    expect(getFact(db, old.id)?.supersededBy).toBe(newer.id);
  });
});
