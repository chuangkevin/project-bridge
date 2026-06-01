import type Database from 'better-sqlite3';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const META_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename   TEXT PRIMARY KEY,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`;

export function runMigrations(db: Database.Database, migrationsDir: string): void {
  if (!existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found: ${migrationsDir}`);
  }
  db.exec(META_SQL);

  const files = readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql') && f !== '000_migrations_meta.sql')
    .sort();

  const stmt = db.prepare('SELECT 1 FROM schema_migrations WHERE filename = ?');
  const mark = db.prepare('INSERT INTO schema_migrations (filename) VALUES (?)');

  for (const file of files) {
    if (stmt.get(file)) continue;
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    const tx = db.transaction(() => {
      db.exec(sql);
      mark.run(file);
    });
    tx();
  }
}

export function defaultMigrationsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, 'migrations');
}
