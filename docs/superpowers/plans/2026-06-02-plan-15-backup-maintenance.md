# Plan 15 — Backup + Maintenance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** A user can download a full backup of a project (DB rows + attachment files + artifact payloads) as a single `.tar.gz`, and a maintenance script can vacuum/checkpoint the SQLite DB. After this plan, the user can preserve a project before risky changes and the DB stays compact over time.

**Architecture:** Server side — a `backupService` that streams a project's DB rows (turns, facts, artifacts, skills, attachments metadata) plus the contents of `data/projects/<id>/{uploads,artifacts}/` into a tar archive on the fly. The REST endpoint `GET /api/projects/:id/backup` streams `application/gzip`. A `scripts/maintenance.ts` CLI runs `PRAGMA wal_checkpoint(TRUNCATE)` + `VACUUM`. No restore in M1 (backup-only — restore is M2 once we have multi-project import semantics).

**Tech Stack:** `tar-stream ^3` (new server dep — pure JS, ~30KB). `zlib` (built-in). No new client deps.

**Spec:** [`../specs/2026-06-01-designbridge-redesign-design.md`](../specs/2026-06-01-designbridge-redesign-design.md) § 11 (operations).

**Scope boundary (out of plan):** NO restore endpoint. NO backup encryption (export is plain — user is responsible for securing the file). NO scheduled backups (M2 cron). NO incremental backups. NO multi-project bulk backup.

---

## File Structure

```
packages/server/
  package.json                  ← add tar-stream ^3
  src/
    services/
      backupService.ts          ← buildProjectBackup(projectId) → Readable
      __tests__/backupService.test.ts
    routes/
      backup.ts                 ← GET /api/projects/:id/backup
      __tests__/backup.route.test.ts
    index.ts                    ← MODIFY: mount route
  scripts/
    maintenance.ts              ← npm-runnable: pnpm tsx scripts/maintenance.ts <dataDir>
```

---

## Task 1: backupService

**Files:**
- Add to `packages/server/package.json`: `"tar-stream": "^3.1.7"` and `"@types/tar-stream": "^3.1.3"`
- `pnpm install`
- Create `packages/server/src/services/backupService.ts`
- Create `packages/server/src/services/__tests__/backupService.test.ts`

### backupService.ts

```typescript
import { pack, type Pack } from 'tar-stream';
import { createGzip } from 'node:zlib';
import { createReadStream, existsSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Readable, PassThrough } from 'node:stream';
import type Database from 'better-sqlite3';

interface BackupManifest {
  version: 1;
  generatedAt: string;
  project: Record<string, unknown>;
  turns: Array<Record<string, unknown>>;
  facts: Array<Record<string, unknown>>;
  artifacts: Array<Record<string, unknown>>;
  attachments: Array<Record<string, unknown>>;
  projectSkills: Array<Record<string, unknown>>;
}

/**
 * Streams a gzipped tar archive of a project: manifest.json + uploads/ + artifacts/.
 * Returns the gzip stream end of the pipeline (consumer pipes to response or file).
 */
export function buildProjectBackup(db: Database.Database, projectId: string, dataDir: string): Readable {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) throw new Error('project not found');

  const manifest: BackupManifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    project: project as Record<string, unknown>,
    turns: db.prepare('SELECT * FROM turns WHERE project_id = ? ORDER BY created_at').all(projectId) as Array<Record<string, unknown>>,
    facts: db.prepare('SELECT * FROM extracted_facts WHERE project_id = ?').all(projectId) as Array<Record<string, unknown>>,
    artifacts: db.prepare('SELECT * FROM artifacts WHERE project_id = ?').all(projectId) as Array<Record<string, unknown>>,
    attachments: db.prepare('SELECT * FROM attachments WHERE project_id = ?').all(projectId) as Array<Record<string, unknown>>,
    projectSkills: db.prepare('SELECT * FROM project_skills WHERE project_id = ?').all(projectId) as Array<Record<string, unknown>>,
  };

  const tarPack: Pack = pack();
  const gzip = createGzip({ level: 6 });
  tarPack.pipe(gzip);

  // Write manifest synchronously (small)
  tarPack.entry({ name: 'manifest.json' }, JSON.stringify(manifest, null, 2));

  // Stream files
  const projectDir = join(dataDir, 'projects', projectId);
  const filesAdded: Array<{ archivePath: string; absPath: string; size: number }> = [];

  for (const sub of ['uploads', 'artifacts']) {
    const absDir = join(projectDir, sub);
    if (!existsSync(absDir)) continue;
    for (const file of readdirSync(absDir)) {
      const abs = join(absDir, file);
      const st = statSync(abs);
      if (!st.isFile()) continue;
      filesAdded.push({ archivePath: `${sub}/${file}`, absPath: abs, size: st.size });
    }
  }

  // Sequentially add files using tar-stream's API
  void (async () => {
    for (const f of filesAdded) {
      await new Promise<void>((resolve, reject) => {
        const entry = tarPack.entry({ name: f.archivePath, size: f.size }, (err) => {
          if (err) reject(err); else resolve();
        });
        createReadStream(f.absPath).on('error', reject).pipe(entry);
      });
    }
    tarPack.finalize();
  })().catch((err) => tarPack.destroy(err));

  return gzip;
}
```

### Tests

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extract } from 'tar-stream';
import { createGunzip } from 'node:zlib';
import { createApp } from '../../index';
import { buildProjectBackup } from '../backupService';

let dataDir: string;
let app: ReturnType<typeof createApp>;
let projectId: string;

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'bk-'));
  app = createApp({ dataDir });
  const db = app.locals.db;
  // seed user + project + turn + attachment
  // ... use direct service calls or insert SQL …
  // (provide concise seeding code in implementation)
});
afterEach(() => { app.locals.db?.close(); rmSync(dataDir, { recursive: true, force: true }); });

describe('buildProjectBackup', () => {
  it('creates a tar.gz containing manifest + files', async () => {
    // create an uploads file
    const uploadsDir = join(dataDir, 'projects', projectId, 'uploads');
    mkdirSync(uploadsDir, { recursive: true });
    writeFileSync(join(uploadsDir, 'test.txt'), 'hello');

    const stream = buildProjectBackup(app.locals.db, projectId, dataDir);
    const entries: Array<{ name: string; content: string }> = [];
    await new Promise<void>((resolve, reject) => {
      const ex = extract();
      ex.on('entry', (header, body, next) => {
        const chunks: Buffer[] = [];
        body.on('data', (c) => chunks.push(c));
        body.on('end', () => { entries.push({ name: header.name, content: Buffer.concat(chunks).toString('utf8') }); next(); });
      });
      ex.on('finish', resolve);
      ex.on('error', reject);
      stream.pipe(createGunzip()).pipe(ex);
    });

    const manifest = entries.find(e => e.name === 'manifest.json');
    expect(manifest).toBeDefined();
    const m = JSON.parse(manifest!.content);
    expect(m.version).toBe(1);
    expect(m.project.id).toBe(projectId);

    const upload = entries.find(e => e.name === 'uploads/test.txt');
    expect(upload?.content).toBe('hello');
  });

  it('throws on missing project', () => {
    expect(() => buildProjectBackup(app.locals.db, 'no-such', dataDir)).toThrow();
  });
});
```

- [ ] Implement + tests pass (target ~210)
- [ ] Commit: `feat(server): add backupService streaming tar.gz of project (Plan 15 Task 1)`

---

## Task 2: backup REST route

**Files:**
- Create `packages/server/src/routes/backup.ts`
- Create `packages/server/src/routes/__tests__/backup.route.test.ts`
- Modify `packages/server/src/index.ts`

### backup.ts

```typescript
import { Router, type Request, type Response } from 'express';
import type Database from 'better-sqlite3';
import { requireAuth } from '../middleware/auth.js';
import { getProject } from '../services/projectService.js';
import { buildProjectBackup } from '../services/backupService.js';

export function buildBackupRouter(db: Database.Database, dataDir: string): Router {
  const r = Router({ mergeParams: true });
  r.use(requireAuth);

  r.get('/', (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const project = getProject(db, projectId);
    if (!project || project.ownerId !== req.user!.id) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } });
      return;
    }

    const safeName = project.name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'project';
    const ts = new Date().toISOString().replace(/[:T.]/g, '-').slice(0, 16);
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="designbridge-${safeName}-${ts}.tar.gz"`);

    try {
      buildProjectBackup(db, projectId, dataDir).pipe(res);
    } catch (err) {
      res.status(500).json({ error: { code: 'BACKUP_FAILED', message: (err as Error).message } });
    }
  });

  return r;
}
```

### Wire in index.ts

```typescript
import { buildBackupRouter } from './routes/backup.js';
app.use('/api/projects/:id/backup', buildBackupRouter(db, deps.dataDir));
```

### Tests

- GET as owner → 200, content-type `application/gzip`, content-disposition has filename
- GET cross-user → 404
- GET unknown project → 404
- 401 without auth

- [ ] Implement + tests pass (target ~214)
- [ ] Commit: `feat(server): add /api/projects/:id/backup tar.gz download (Plan 15 Task 2)`

---

## Task 3: maintenance CLI script

**Files:**
- Create `packages/server/scripts/maintenance.ts`
- Modify `packages/server/package.json` scripts: add `"maintenance": "tsx scripts/maintenance.ts"`
- Add `tsx` to devDependencies if not already present

### maintenance.ts

```typescript
#!/usr/bin/env node
/**
 * DesignBridge maintenance: WAL checkpoint + VACUUM + size report.
 *
 * Usage:
 *   pnpm --filter @designbridge/server maintenance [dataDir]
 *
 * dataDir defaults to env DATA_DIR or ./data.
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
  console.log('  Running WAL checkpoint (TRUNCATE)…');
  db.pragma('wal_checkpoint(TRUNCATE)');
  console.log('  Running VACUUM…');
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
```

- [ ] Implement
- [ ] Verify by running `pnpm --filter @designbridge/server maintenance ./packages/server/data` against any existing dev DB (or skip if none)
- [ ] Commit: `feat(server): add maintenance CLI (VACUUM + WAL checkpoint + size report) (Plan 15 Task 3)`

---

## Task 4: Client — backup button on ProjectsPage

**Files:**
- Modify `packages/client/src/pages/ProjectsPage.tsx`

Add a small "下載備份" link per project row. The download must include auth — easiest: use `fetch` with token then construct a blob URL:

```tsx
const downloadBackup = async (project: { id: string; name: string }) => {
  const token = getToken();   // import from lib/api or wherever it's defined
  const res = await fetch(`/api/projects/${project.id}/backup`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    alert('備份失敗：' + res.status);
    return;
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `designbridge-${project.name}-${new Date().toISOString().slice(0,10)}.tar.gz`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
```

UI: small button next to "刪除" or in a dropdown. Simplest: a 13px "下載備份" button.

- [ ] Implement
- [ ] Build passes
- [ ] Commit: `feat(client): add backup download button on ProjectsPage (Plan 15 Task 4)`

---

## Task 5: Verify + push

- All 4 builds green
- Server tests ~214 (was 208 + ~4 service + ~4 route)
- Manual smoke: visit /projects, click "下載備份" → file downloads + opens as tar.gz with manifest.json + uploads/artifacts files
- Push

---

## Acceptance Criteria

- [ ] buildProjectBackup produces a valid tar.gz containing manifest.json + all uploads + all artifacts
- [ ] manifest.json includes project metadata + all turn/fact/artifact/attachment rows
- [ ] GET /api/projects/:id/backup streams gzip with proper headers
- [ ] 404 cross-user; 401 unauthenticated
- [ ] maintenance CLI runs without error, reports size delta
- [ ] ProjectsPage "下載備份" button works
- [ ] all builds + tests + push clean

---

## Risks / Notes

1. **Memory for in-flight backup**: tar-stream uses async streams; files are streamed not loaded. Project with 1GB of uploads still backs up with low memory. The manifest itself is JSON-stringified in-memory but small (~rows × KB).
2. **No restore**: a backup with no restore is half a feature. Decision: M1 ships export-only because import semantics need design (merge vs replace? which existing turns to supersede?). M2 plan should add `POST /api/projects/restore` with explicit conflict rules.
3. **Plain text export**: no encryption. Document: backup contains AI conversations + uploads (which may contain sensitive material). Treat the file as confidential.
4. **VACUUM is blocking**: maintenance CLI shouldn't run while the server is up — `better-sqlite3` doesn't support concurrent writers. Document in CLAUDE.md / DEPLOY.md.
5. **Permissions**: backup is per-project, owner-only — matches the rest of the M1 access model. M2 (multi-user invites) will need a role check.

---

**Plan end. 5 Tasks. Backup + maintenance ready.**
