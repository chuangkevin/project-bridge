#!/usr/bin/env node
/**
 * DesignBridge maintenance: WAL checkpoint + VACUUM + size report.
 *
 * Usage:
 *   pnpm --filter @designbridge/server maintenance [dataDir]
 *
 * dataDir defaults to env DATA_DIR or ./data.
 *
 * NOTE: Run this script only when the server is stopped.
 * better-sqlite3 does not support concurrent writers — running VACUUM while
 * the server holds the DB open will fail.
 */
import Database from 'better-sqlite3';
import { join } from 'node:path';
import { statSync, existsSync, readdirSync } from 'node:fs';

function fmtBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)}GB`;
}

function dirSize(dir: string): number {
  if (!existsSync(dir)) return 0;
  let total = 0;
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else total += statSync(p).size;
    }
  };
  walk(dir);
  return total;
}

async function main() {
  const dataDir = process.argv[2] ?? process.env.DATA_DIR ?? './data';
  const dbPath = join(dataDir, 'app.db');
  if (!existsSync(dbPath)) {
    console.error(`DB not found at ${dbPath}`);
    process.exit(1);
  }
  console.log(`[maintenance] dataDir = ${dataDir}`);

  const before = statSync(dbPath).size;
  console.log(`  DB size before: ${fmtBytes(before)}`);

  const db = new Database(dbPath);
  console.log('  Running WAL checkpoint (TRUNCATE)...');
  db.pragma('wal_checkpoint(TRUNCATE)');
  console.log('  Running VACUUM...');
  db.exec('VACUUM');
  db.close();

  const after = statSync(dbPath).size;
  console.log(`  DB size after:  ${fmtBytes(after)} (saved ${fmtBytes(Math.max(0, before - after))})`);

  const projectsDir = join(dataDir, 'projects');
  const projectsSize = dirSize(projectsDir);
  console.log(`  Project files:  ${fmtBytes(projectsSize)}`);
  console.log('[maintenance] done.');
}

main().catch((err) => { console.error('[maintenance] failed:', err); process.exit(1); });
