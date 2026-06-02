import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../connection';

let dataDir: string;
beforeEach(() => { dataDir = mkdtempSync(join(tmpdir(), 'db-')); });
afterEach(() => { rmSync(dataDir, { recursive: true, force: true }); });

describe('openDb', () => {
  it('opens a sqlite database at <dataDir>/designbridge.db with WAL mode', () => {
    const db = openDb(dataDir);
    const mode = db.pragma('journal_mode', { simple: true }) as string;
    expect(mode).toBe('wal');
    db.close();
  });

  it('enables foreign keys', () => {
    const db = openDb(dataDir);
    const fk = db.pragma('foreign_keys', { simple: true }) as number;
    expect(fk).toBe(1);
    db.close();
  });
});
