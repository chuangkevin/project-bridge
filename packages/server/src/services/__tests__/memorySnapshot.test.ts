import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../../db/connection';
import { runMigrations, defaultMigrationsDir } from '../../db/migrator';
import { createUser } from '../authService';
import { createProject } from '../projectService';
import { appendTurn } from '../turnService';
import { addFact } from '../factService';
import { buildMemorySnapshot } from '../memorySnapshot';

let dataDir: string;
let db: ReturnType<typeof openDb>;
let projectId: string;

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'mem-'));
  db = openDb(dataDir);
  runMigrations(db, defaultMigrationsDir());
  const u = await createUser(db, { name: 'A', email: 'a@x.com', password: 'pw12345678' });
  projectId = createProject(db, u.id, 'P').id;
});
afterEach(() => { db.close(); rmSync(dataDir, { recursive: true, force: true }); });

describe('buildMemorySnapshot', () => {
  it('returns empty arrays for a new project', () => {
    const m = buildMemorySnapshot(db, projectId, {});
    expect(m.facts).toEqual([]);
    expect(m.turns).toEqual([]);
    expect(m.earlierTurnCount).toBe(0);
    expect(m.activeArtifactId).toBeUndefined();
  });

  it('includes all valid facts (not superseded)', () => {
    const turn = appendTurn(db, { projectId, mode: 'consult', userText: 'x', aiResponse: { text: '' } });
    addFact(db, { projectId, turnId: turn.id, kind: 'requirement', text: 'r1' });
    addFact(db, { projectId, turnId: turn.id, kind: 'decision', text: 'd1' });
    const m = buildMemorySnapshot(db, projectId, {});
    expect(m.facts).toHaveLength(2);
  });

  it('returns at most maxRecentTurns turns (most-recent), older turns counted', () => {
    for (let i = 0; i < 25; i++) {
      appendTurn(db, { projectId, mode: 'consult', userText: `t${i}`, aiResponse: { text: '' } });
    }
    const m = buildMemorySnapshot(db, projectId, { maxRecentTurns: 20 });
    expect(m.turns).toHaveLength(20);
    expect(m.turns[0].userText).toBe('t5');     // oldest of the recent window
    expect(m.turns[19].userText).toBe('t24');   // newest
    expect(m.earlierTurnCount).toBe(5);         // 25 total - 20 recent = 5 earlier
  });

  it('default maxRecentTurns is 20', () => {
    for (let i = 0; i < 22; i++) {
      appendTurn(db, { projectId, mode: 'consult', userText: `t${i}`, aiResponse: { text: '' } });
    }
    const m = buildMemorySnapshot(db, projectId, {});
    expect(m.turns).toHaveLength(20);
    expect(m.earlierTurnCount).toBe(2);
  });

  it('honors activeArtifactId pass-through', () => {
    const m = buildMemorySnapshot(db, projectId, { activeArtifactId: 'art_1' });
    expect(m.activeArtifactId).toBe('art_1');
  });
});
