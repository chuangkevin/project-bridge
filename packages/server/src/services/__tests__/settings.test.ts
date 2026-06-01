import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../../db/connection';
import { runMigrations, defaultMigrationsDir } from '../../db/migrator';
import { readSetting, writeSetting, deleteSetting } from '../settings';

let dataDir: string;
let db: ReturnType<typeof openDb>;
beforeEach(() => { dataDir = mkdtempSync(join(tmpdir(), 'set-')); db = openDb(dataDir); runMigrations(db, defaultMigrationsDir()); });
afterEach(() => { db.close(); rmSync(dataDir, { recursive: true, force: true }); });

describe('settings', () => {
  it('readSetting returns null when key missing', () => { expect(readSetting(db, 'x')).toBeNull(); });
  it('writeSetting + readSetting round-trip', () => { writeSetting(db, 'k', 'v'); expect(readSetting(db, 'k')).toBe('v'); });
  it('writeSetting upserts existing key', () => { writeSetting(db, 'k', 'v1'); writeSetting(db, 'k', 'v2'); expect(readSetting(db, 'k')).toBe('v2'); });
  it('deleteSetting removes the key', () => { writeSetting(db, 'k', 'v'); deleteSetting(db, 'k'); expect(readSetting(db, 'k')).toBeNull(); });
});
