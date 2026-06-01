import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../connection';
import { runMigrations } from '../migrator';

let dataDir: string;
let migrationsDir: string;
beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'mig-'));
  migrationsDir = mkdtempSync(join(tmpdir(), 'sql-'));
});
afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(migrationsDir, { recursive: true, force: true });
});

describe('runMigrations', () => {
  it('applies *.sql in lexical order and records each in schema_migrations', () => {
    writeFileSync(join(migrationsDir, '001_a.sql'), 'CREATE TABLE a (id INTEGER);');
    writeFileSync(join(migrationsDir, '002_b.sql'), 'CREATE TABLE b (id INTEGER);');

    const db = openDb(dataDir);
    runMigrations(db, migrationsDir);

    const applied = db.prepare('SELECT filename FROM schema_migrations ORDER BY filename').all() as { filename: string }[];
    expect(applied.map(r => r.filename)).toEqual(['001_a.sql', '002_b.sql']);

    expect(db.prepare("SELECT name FROM sqlite_master WHERE name='a'").get()).toBeDefined();
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name='b'").get()).toBeDefined();
    db.close();
  });

  it('does not re-apply already-applied migrations', () => {
    writeFileSync(join(migrationsDir, '001_a.sql'), 'CREATE TABLE a (id INTEGER);');
    const db = openDb(dataDir);
    runMigrations(db, migrationsDir);
    runMigrations(db, migrationsDir);  // 第二次跑不該爆
    const rows = db.prepare('SELECT COUNT(*) as n FROM schema_migrations').get() as { n: number };
    expect(rows.n).toBe(1);
    db.close();
  });

  it('throws if a migration file errors and does NOT mark it as applied', () => {
    writeFileSync(join(migrationsDir, '001_bad.sql'), 'NOT VALID SQL;');
    const db = openDb(dataDir);
    expect(() => runMigrations(db, migrationsDir)).toThrow();
    const rows = db.prepare("SELECT * FROM schema_migrations WHERE filename='001_bad.sql'").all();
    expect(rows).toHaveLength(0);
    db.close();
  });
});
