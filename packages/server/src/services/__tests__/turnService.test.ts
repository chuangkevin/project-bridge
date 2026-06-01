import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../../db/connection';
import { runMigrations, defaultMigrationsDir } from '../../db/migrator';
import { createUser } from '../authService';
import { createProject } from '../projectService';
import { appendTurn, listTurns, getTurn } from '../turnService';

let dataDir: string;
let db: ReturnType<typeof openDb>;
let projectId: string;

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'turn-'));
  db = openDb(dataDir);
  runMigrations(db, defaultMigrationsDir());
  const u = await createUser(db, { name: 'A', email: 'a@x.com', password: 'pw12345678' });
  projectId = createProject(db, u.id, 'P').id;
});
afterEach(() => { db.close(); rmSync(dataDir, { recursive: true, force: true }); });

describe('turnService', () => {
  it('appendTurn inserts a row + returns it with all fields', () => {
    const t = appendTurn(db, {
      projectId, mode: 'consult', userText: 'hi',
      aiResponse: { text: 'hello there' },
      skillsUsed: ['s1','s2'], modelUsed: 'gemini-2.5-flash',
      tokens: { prompt: 10, completion: 5, total: 15 },
    });
    expect(t.id).toBeDefined();
    expect(t.mode).toBe('consult');
    expect(t.aiResponse.text).toBe('hello there');
    expect(t.skillsUsed).toEqual(['s1','s2']);
  });

  it('listTurns returns turns in chronological order (oldest first by default)', () => {
    appendTurn(db, { projectId, mode: 'consult', userText: 'one', aiResponse: { text: 'a' } });
    appendTurn(db, { projectId, mode: 'architect', userText: 'two', aiResponse: { text: 'b' } });
    const all = listTurns(db, projectId, {});
    expect(all.map(t => t.userText)).toEqual(['one','two']);
  });

  it('listTurns with mode filter only returns that mode', () => {
    appendTurn(db, { projectId, mode: 'consult', userText: 'one', aiResponse: { text: 'a' } });
    appendTurn(db, { projectId, mode: 'design', userText: 'two', aiResponse: { text: 'b' } });
    const consult = listTurns(db, projectId, { mode: 'consult' });
    expect(consult).toHaveLength(1);
    expect(consult[0].userText).toBe('one');
  });

  it('listTurns with limit returns most recent N', () => {
    for (let i = 0; i < 5; i++) appendTurn(db, { projectId, mode: 'consult', userText: `t${i}`, aiResponse: { text: '' } });
    const r = listTurns(db, projectId, { limit: 3, order: 'desc' });
    expect(r).toHaveLength(3);
    expect(r.map(t => t.userText)).toEqual(['t4','t3','t2']);
  });

  it('getTurn returns the turn by id', () => {
    const t = appendTurn(db, { projectId, mode: 'consult', userText: 'x', aiResponse: { text: 'y' } });
    expect(getTurn(db, t.id)?.userText).toBe('x');
  });

  it('getTurn returns null for unknown id', () => {
    expect(getTurn(db, 'nope')).toBeNull();
  });

  it('appendTurn rejects invalid mode via CHECK constraint (sqlite throws)', () => {
    expect(() => appendTurn(db, {
      projectId, mode: 'invalid' as never, userText: 'x', aiResponse: { text: '' },
    })).toThrow();
  });

  it('aiResponse with discussion array round-trips', () => {
    const discussion = [{ round: 1, persona: 'pm', text: 'hi' }, { round: 2, persona: 'designer', text: 'ok' }];
    const t = appendTurn(db, { projectId, mode: 'consult', userText: 'q', aiResponse: { text: 'a', discussion } });
    const r = getTurn(db, t.id);
    expect(r?.aiResponse.discussion).toEqual(discussion);
  });
});
