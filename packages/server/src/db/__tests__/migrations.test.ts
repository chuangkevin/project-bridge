import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../connection';
import { runMigrations, defaultMigrationsDir } from '../migrator';

let dataDir: string;
beforeEach(() => { dataDir = mkdtempSync(join(tmpdir(), 'fullmig-')); });
afterEach(() => { rmSync(dataDir, { recursive: true, force: true }); });

describe('all 6 migrations', () => {
  it('applies cleanly and creates expected tables', () => {
    const db = openDb(dataDir);
    runMigrations(db, defaultMigrationsDir());

    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]).map(r => r.name);
    expect(tables).toEqual([
      'api_key_cooldowns', 'api_key_leases', 'api_key_usage',
      'artifacts', 'extracted_facts',
      'project_settings', 'project_skills', 'projects',
      'schema_migrations',
      'sessions', 'settings',
      'turns', 'users',
    ]);
    db.close();
  });
});
