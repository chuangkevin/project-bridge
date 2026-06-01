# Plan 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 v1.5 整包移到 `legacy/`、起新的 `packages/server` + `packages/client` 骨架、跑得起 9 表 SQLite migrations、auth 三路由可登入、project basic CRUD 可建可看，client 能登入並看到 projects 清單。所有後續 plan 的前置。

**Architecture:** Express + better-sqlite3 + TypeScript 5.6 server；Vite + React 18 + zustand + react-router-dom client。Migration runner 掃 `migrations/*.sql` 依序執行並用 `schema_migrations` 表追蹤。Auth 用 cookie-based session token + bcrypt。所有路由前綴 `/api/*`。Dev server 在 server :3001、client :5173，Vite proxy `/api` → :3001。

**Tech Stack:** Node 22、TypeScript 5.6 strict、Express 5、better-sqlite3 11、bcrypt 5、Vite 5、React 18、zustand 4、react-router-dom 6、vitest 3、Playwright（M2 才實際跑）。

**Spec:** `docs/superpowers/specs/2026-06-01-designbridge-redesign-design.md` § 7（持久化 schema）、§ 8（API、auth、error 格式）、§ 1.2（必保留：api_key_* 三表 schema 不變）。

**Scope boundary（out of plan）:** NO provider routing（Plan 2）。NO turn/chat/AI（Plan 3, 6）。NO skill loading（Plan 4）。NO socket.io（Plan 11）。NO 三模式 UI（Plan 7-10）。本 plan 只到「使用者能登入、建專案、看到專案清單」。

---

## File Structure

```
legacy/                                      ← v1.5 整包移到這（保留，便於對照）
  packages/server/    （原本 packages/server 移過來）
  packages/client/    （原本 packages/client 移過來）
  packages/e2e/       （原本 packages/e2e 移過來）

packages/server/                             ← 全新 server，本 plan 內建立
  package.json
  tsconfig.json
  vitest.config.ts
  src/
    index.ts                                 ← Express entry
    db/
      connection.ts                          ← better-sqlite3 singleton
      migrator.ts                            ← 跑 migrations
      migrations/
        001_users_sessions.sql
        002_settings_apikey.sql
        003_projects.sql
        004_turns.sql
        005_facts_artifacts.sql
        006_project_skills_settings.sql
    middleware/
      auth.ts                                ← session token middleware
      errorHandler.ts                        ← 統一 error JSON
      requestId.ts                           ← X-Request-Id
    routes/
      auth.ts                                ← /api/auth/login | logout | me | setup
      health.ts                              ← /api/health
      projects.ts                            ← /api/projects (CRUD)
    services/
      authService.ts                         ← bcrypt + session 處理
      projectService.ts                      ← project CRUD 邏輯
    types/
      index.ts                               ← User, Session, Project shapes
    __tests__/
      auth.test.ts
      projects.test.ts
      migrator.test.ts
  data/
    .gitkeep                                 ← bridge.db 會放在這裡（不上 git）

packages/client/                             ← 全新 client，本 plan 內建立
  package.json
  vite.config.ts
  tsconfig.json
  index.html
  src/
    main.tsx                                 ← React entry
    App.tsx                                  ← Router root
    pages/
      LoginPage.tsx
      ProjectsPage.tsx
      SetupPage.tsx
    components/
      AppShell.tsx                           ← 共用外殼（topbar, user menu）
    stores/
      useAuthStore.ts                        ← session token state
      useProjectsStore.ts                    ← projects list state
    lib/
      api.ts                                 ← fetch wrapper（auto header）
    styles/
      theme.css                              ← dark glass CSS variables
    types/
      index.ts                               ← shared types（與 server 對齊）

packages/server/.env.example                 ← 範例環境變數
package.json                                 ← workspace root（更新 packages list）
pnpm-workspace.yaml                          ← 更新 packages 路徑
```

---

## Task 1: Move v1.5 to legacy/

**Files:**
- Move: `packages/server` → `legacy/packages/server`
- Move: `packages/client` → `legacy/packages/client`
- Move: `packages/e2e` → `legacy/packages/e2e`
- Modify: `pnpm-workspace.yaml`
- Modify: `package.json`（workspace root）

- [ ] **Step 1: Move v1.5 packages**

```bash
mkdir -p legacy
git mv packages/server legacy/packages/server
git mv packages/client legacy/packages/client
git mv packages/e2e legacy/packages/e2e
```

- [ ] **Step 2: Update `pnpm-workspace.yaml`**

```yaml
packages:
  - 'packages/*'
  - 'legacy/packages/*'
```

(Legacy 包暫時保留在 workspace，方便對照；後續 plan 完成後可移出 workspace 但保留檔案。)

- [ ] **Step 3: Update root `package.json` scripts**

把原本指向 packages/server / packages/client 的 root scripts 暫時拿掉或改指向 legacy（避免 root `pnpm dev` 出錯）。詳細：

```json
{
  "scripts": {
    "dev:server-legacy": "pnpm --filter ./legacy/packages/server dev",
    "dev:client-legacy": "pnpm --filter ./legacy/packages/client dev",
    "dev:server": "echo 'new server not yet wired; run pnpm --filter server dev once Plan 1 done'",
    "dev:client": "echo 'new client not yet wired'"
  }
}
```

- [ ] **Step 4: Verify legacy 仍 build**

```bash
pnpm install
pnpm --filter ./legacy/packages/server build
pnpm --filter ./legacy/packages/client build
```

Expected：兩個 legacy build 還是綠的（要驗證我們沒打壞它）。

- [ ] **Step 5: Commit**

```bash
git add legacy/ packages/ pnpm-workspace.yaml package.json
git commit -m "chore: move v1.5 server/client/e2e to legacy/ (Plan 1 Task 1)"
```

---

## Task 2: Create fresh server skeleton

**Files:**
- Create: `packages/server/package.json`
- Create: `packages/server/tsconfig.json`
- Create: `packages/server/vitest.config.ts`
- Create: `packages/server/src/index.ts`

- [ ] **Step 1: `packages/server/package.json`**

```json
{
  "name": "server",
  "version": "2.0.0-alpha.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "better-sqlite3": "^11.5.0",
    "bcrypt": "^5.1.1",
    "express": "^5.0.0",
    "uuid": "^10.0.0"
  },
  "devDependencies": {
    "@types/bcrypt": "^5.0.2",
    "@types/better-sqlite3": "^7.6.11",
    "@types/express": "^5.0.0",
    "@types/node": "^22.0.0",
    "@types/supertest": "^6.0.2",
    "supertest": "^7.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.3",
    "vitest": "^3.2.4"
  }
}
```

- [ ] **Step 2: `packages/server/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "dist",
    "rootDir": "src",
    "resolveJsonModule": true,
    "declaration": false,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: `packages/server/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: `packages/server/src/index.ts`**（最簡 Express）

```typescript
import express, { type Express } from 'express';

export function createApp(): Express {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT) || 3001;
  const host = process.env.HOST || '127.0.0.1';
  createApp().listen(port, host, () => {
    console.log(`[server] listening on http://${host}:${port}`);
  });
}
```

- [ ] **Step 5: `packages/server/.env.example`**

```
PORT=3001
HOST=127.0.0.1
DATA_DIR=./data
```

- [ ] **Step 6: 安裝依賴 + 跑起 dev server 確認 health 通**

```bash
cd packages/server
pnpm install
pnpm dev
# 另一個 terminal：
curl http://127.0.0.1:3001/api/health
```

Expected：`{"ok":true}`。Ctrl+C 結束 dev。

- [ ] **Step 7: Commit**

```bash
git add packages/server/
git commit -m "feat(server): scaffold new server package with health endpoint (Plan 1 Task 2)"
```

---

## Task 3: SQLite connection helper

**Files:**
- Create: `packages/server/src/db/connection.ts`
- Create: `packages/server/src/db/__tests__/connection.test.ts`

- [ ] **Step 1: Failing test — `connection.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../connection';

let dataDir: string;
beforeEach(() => { dataDir = mkdtempSync(join(tmpdir(), 'db-')); });
afterEach(() => { rmSync(dataDir, { recursive: true, force: true }); });

describe('openDb', () => {
  it('opens a sqlite database at <dataDir>/bridge.db with WAL mode', () => {
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
```

- [ ] **Step 2: Run → FAIL**

```bash
pnpm --filter server test
```

Expected: cannot find `../connection`.

- [ ] **Step 3: Implement `connection.ts`**

```typescript
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export function openDb(dataDir: string): Database.Database {
  mkdirSync(dataDir, { recursive: true });
  const db = new Database(join(dataDir, 'bridge.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');
  return db;
}
```

- [ ] **Step 4: Run → PASS**

```bash
pnpm --filter server test
```

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/db/
git commit -m "feat(server): add sqlite connection helper (WAL + FK) (Plan 1 Task 3)"
```

---

## Task 4: Migration runner

**Files:**
- Create: `packages/server/src/db/migrator.ts`
- Create: `packages/server/src/db/__tests__/migrator.test.ts`
- Create: `packages/server/src/db/migrations/000_migrations_meta.sql`

- [ ] **Step 1: `000_migrations_meta.sql` — internal tracking table**

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename   TEXT PRIMARY KEY,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

- [ ] **Step 2: Failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
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
```

- [ ] **Step 3: Run → FAIL**

- [ ] **Step 4: Implement `migrator.ts`**

```typescript
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
```

- [ ] **Step 5: Run → PASS**

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/db/
git commit -m "feat(server): add migration runner with idempotency + transactional apply (Plan 1 Task 4)"
```

---

## Task 5: Write the 6 migration SQL files

**Files:**
- Create: `packages/server/src/db/migrations/001_users_sessions.sql`
- Create: `packages/server/src/db/migrations/002_settings_apikey.sql`
- Create: `packages/server/src/db/migrations/003_projects.sql`
- Create: `packages/server/src/db/migrations/004_turns.sql`
- Create: `packages/server/src/db/migrations/005_facts_artifacts.sql`
- Create: `packages/server/src/db/migrations/006_project_skills_settings.sql`

- [ ] **Step 1: `001_users_sessions.sql`**

```sql
CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sessions (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
```

- [ ] **Step 2: `002_settings_apikey.sql`**

```sql
-- 全域 settings（沿用 v1.5）
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ai-core ProjectBridgeAdapter 期待這 3 表 schema 不變
CREATE TABLE api_key_leases (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  provider    TEXT NOT NULL,
  key_hash    TEXT NOT NULL,
  leased_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  released_at TIMESTAMP
);
CREATE INDEX idx_apikey_leases_active ON api_key_leases(provider, released_at);

CREATE TABLE api_key_cooldowns (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  provider       TEXT NOT NULL,
  key_hash       TEXT NOT NULL,
  cooldown_until TIMESTAMP NOT NULL,
  reason         TEXT
);
CREATE INDEX idx_apikey_cooldowns_provider ON api_key_cooldowns(provider, cooldown_until);

CREATE TABLE api_key_usage (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  provider          TEXT NOT NULL,
  key_hash          TEXT NOT NULL,
  call_type         TEXT,
  prompt_tokens     INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  recorded_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_apikey_usage_recorded ON api_key_usage(provider, recorded_at);
```

- [ ] **Step 3: `003_projects.sql`**

```sql
CREATE TABLE projects (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  owner_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  share_token     TEXT UNIQUE,
  council_config  TEXT,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_projects_owner ON projects(owner_id);
```

- [ ] **Step 4: `004_turns.sql`**

```sql
CREATE TABLE turns (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  mode        TEXT NOT NULL CHECK(mode IN ('consult','architect','design')),
  user_text   TEXT NOT NULL,
  ai_response TEXT NOT NULL,
  skills_used TEXT,
  model_used  TEXT,
  tokens      TEXT,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_turns_project ON turns(project_id, created_at);
CREATE INDEX idx_turns_mode    ON turns(project_id, mode);
```

- [ ] **Step 5: `005_facts_artifacts.sql`**

```sql
CREATE TABLE extracted_facts (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  turn_id       TEXT NOT NULL REFERENCES turns(id)    ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK(kind IN ('requirement','page','constraint','decision')),
  text          TEXT NOT NULL,
  superseded_by TEXT REFERENCES extracted_facts(id),
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_facts_project ON extracted_facts(project_id, kind);

CREATE TABLE artifacts (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_by_turn TEXT NOT NULL REFERENCES turns(id),
  kind            TEXT NOT NULL CHECK(kind IN ('vue-sfc','page-graph','design-tokens')),
  name            TEXT NOT NULL,
  payload_path    TEXT NOT NULL,
  metadata        TEXT,
  superseded_by   TEXT REFERENCES artifacts(id),
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_artifacts_project ON artifacts(project_id, kind, created_at);
```

- [ ] **Step 6: `006_project_skills_settings.sql`**

```sql
CREATE TABLE project_skills (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  content    TEXT NOT NULL,
  enabled    INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, name)
);

CREATE TABLE project_settings (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  PRIMARY KEY(project_id, key)
);
```

- [ ] **Step 7: Migration integration test**

Create `packages/server/src/db/__tests__/migrations.test.ts`:

```typescript
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
```

- [ ] **Step 8: Run → PASS**

```bash
pnpm --filter server test
```

- [ ] **Step 9: Commit**

```bash
git add packages/server/src/db/migrations/ packages/server/src/db/__tests__/migrations.test.ts
git commit -m "feat(server): add 6 migration SQL files (9 tables matching spec §7.2) (Plan 1 Task 5)"
```

---

## Task 6: Wire migrations into server startup

**Files:**
- Modify: `packages/server/src/index.ts`

- [ ] **Step 1: Update `index.ts` to open DB + run migrations on boot**

```typescript
import express, { type Express } from 'express';
import { openDb } from './db/connection.js';
import { runMigrations, defaultMigrationsDir } from './db/migrator.js';

export interface AppDeps {
  dataDir: string;
}

export function createApp(deps: AppDeps): Express {
  const db = openDb(deps.dataDir);
  runMigrations(db, defaultMigrationsDir());

  const app = express();
  app.use(express.json({ limit: '10mb' }));
  // 之後 task 加 auth middleware、routes
  (app as Express & { locals: { db: ReturnType<typeof openDb> } }).locals.db = db;

  app.get('/api/health', (_req, res) => {
    const userCount = db.prepare('SELECT COUNT(*) as n FROM users').get() as { n: number };
    res.json({ ok: true, db: 'ok', userCount: userCount.n });
  });

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT) || 3001;
  const host = process.env.HOST || '127.0.0.1';
  const dataDir = process.env.DATA_DIR || './data';
  createApp({ dataDir }).listen(port, host, () => {
    console.log(`[server] listening on http://${host}:${port}  (dataDir=${dataDir})`);
  });
}
```

- [ ] **Step 2: Run dev server, hit health endpoint**

```bash
pnpm --filter server dev
# another terminal
curl http://127.0.0.1:3001/api/health
```

Expected：`{"ok":true,"db":"ok","userCount":0}`。檢查 `packages/server/data/bridge.db` 有被建立。

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/index.ts
git commit -m "feat(server): wire DB + migrations into app startup (Plan 1 Task 6)"
```

---

## Task 7: Auth service + middleware

**Files:**
- Create: `packages/server/src/services/authService.ts`
- Create: `packages/server/src/middleware/auth.ts`
- Create: `packages/server/src/services/__tests__/authService.test.ts`

- [ ] **Step 1: Failing test `authService.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../../db/connection';
import { runMigrations, defaultMigrationsDir } from '../../db/migrator';
import { createUser, login, getSessionUser } from '../authService';

let dataDir: string;
let db: ReturnType<typeof openDb>;
beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'auth-'));
  db = openDb(dataDir);
  runMigrations(db, defaultMigrationsDir());
});
afterEach(() => { db.close(); rmSync(dataDir, { recursive: true, force: true }); });

describe('authService', () => {
  it('createUser hashes the password and returns id+email', async () => {
    const u = await createUser(db, { name: 'A', email: 'a@x.com', password: 'pw12345678' });
    expect(u.id).toBeDefined();
    expect(u.email).toBe('a@x.com');
    const row = db.prepare('SELECT password_hash FROM users WHERE id=?').get(u.id) as { password_hash: string };
    expect(row.password_hash).not.toBe('pw12345678');
    expect(row.password_hash.length).toBeGreaterThan(20);
  });

  it('login returns a session token on correct password', async () => {
    await createUser(db, { name: 'A', email: 'a@x.com', password: 'pw12345678' });
    const r = await login(db, 'a@x.com', 'pw12345678');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.token.length).toBeGreaterThan(20);
  });

  it('login fails on wrong password', async () => {
    await createUser(db, { name: 'A', email: 'a@x.com', password: 'pw12345678' });
    const r = await login(db, 'a@x.com', 'wrong');
    expect(r.ok).toBe(false);
  });

  it('getSessionUser returns user for a valid token', async () => {
    const u = await createUser(db, { name: 'A', email: 'a@x.com', password: 'pw12345678' });
    const r = await login(db, 'a@x.com', 'pw12345678');
    if (!r.ok) throw new Error('login failed');
    const user = getSessionUser(db, r.token);
    expect(user?.id).toBe(u.id);
    expect(user?.email).toBe('a@x.com');
  });

  it('getSessionUser returns null for an unknown token', () => {
    expect(getSessionUser(db, 'nope')).toBeNull();
  });
});
```

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Implement `authService.ts`**

```typescript
import type Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { v4 as uuid } from 'uuid';

const SESSION_TTL_DAYS = 30;
const BCRYPT_ROUNDS = 10;

export interface User { id: string; name: string; email: string; }

export interface CreateUserInput { name: string; email: string; password: string; }

export async function createUser(db: Database.Database, input: CreateUserInput): Promise<User> {
  const hash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const id = uuid();
  db.prepare('INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)')
    .run(id, input.name, input.email, hash);
  return { id, name: input.name, email: input.email };
}

export type LoginResult = { ok: true; token: string; user: User } | { ok: false; reason: 'no_user' | 'bad_password' };

export async function login(db: Database.Database, email: string, password: string): Promise<LoginResult> {
  const row = db.prepare('SELECT id, name, email, password_hash FROM users WHERE email = ?').get(email) as
    | { id: string; name: string; email: string; password_hash: string }
    | undefined;
  if (!row) return { ok: false, reason: 'no_user' };
  const match = await bcrypt.compare(password, row.password_hash);
  if (!match) return { ok: false, reason: 'bad_password' };

  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
    .run(token, row.id, expires);
  return { ok: true, token, user: { id: row.id, name: row.name, email: row.email } };
}

export function logout(db: Database.Database, token: string): void {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function getSessionUser(db: Database.Database, token: string): User | null {
  const row = db.prepare(`
    SELECT u.id, u.name, u.email FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > datetime('now')
  `).get(token) as User | undefined;
  return row ?? null;
}
```

- [ ] **Step 4: Run → PASS**

- [ ] **Step 5: Implement `middleware/auth.ts`**

```typescript
import type { Request, Response, NextFunction } from 'express';
import type Database from 'better-sqlite3';
import { getSessionUser, type User } from '../services/authService.js';

declare global {
  namespace Express {
    interface Request { user?: User; }
  }
}

export function authMiddleware(db: Database.Database) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const token = extractToken(req);
    if (token) {
      const user = getSessionUser(db, token);
      if (user) req.user = user;
    }
    next();
  };
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: '尚未登入', requestId: req.header('X-Request-Id') ?? '' } });
    return;
  }
  next();
}

function extractToken(req: Request): string | null {
  const header = req.header('Authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7);
  const cookie = req.header('Cookie') ?? '';
  const m = cookie.match(/db_session=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}
```

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/services/authService.ts packages/server/src/middleware/auth.ts packages/server/src/services/__tests__/authService.test.ts
git commit -m "feat(server): add bcrypt auth service + session middleware (Plan 1 Task 7)"
```

---

## Task 8: Auth routes

**Files:**
- Create: `packages/server/src/routes/auth.ts`
- Create: `packages/server/src/routes/__tests__/auth.route.test.ts`
- Modify: `packages/server/src/index.ts`

- [ ] **Step 1: Failing route test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../index';

let dataDir: string;
let app: ReturnType<typeof createApp>;
beforeEach(() => { dataDir = mkdtempSync(join(tmpdir(), 'rt-')); app = createApp({ dataDir }); });
afterEach(() => { rmSync(dataDir, { recursive: true, force: true }); });

describe('POST /api/auth/setup', () => {
  it('creates the first admin user and returns a session token', async () => {
    const r = await request(app).post('/api/auth/setup').send({ name: 'A', email: 'a@x.com', password: 'pw12345678' });
    expect(r.status).toBe(200);
    expect(r.body.token).toBeDefined();
    expect(r.body.user.email).toBe('a@x.com');
  });
  it('refuses if a user already exists', async () => {
    await request(app).post('/api/auth/setup').send({ name: 'A', email: 'a@x.com', password: 'pw12345678' });
    const r = await request(app).post('/api/auth/setup').send({ name: 'B', email: 'b@x.com', password: 'pw12345678' });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('SETUP_ALREADY_DONE');
  });
});

describe('POST /api/auth/login + GET /api/auth/me + POST /api/auth/logout', () => {
  it('full session lifecycle', async () => {
    await request(app).post('/api/auth/setup').send({ name: 'A', email: 'a@x.com', password: 'pw12345678' });

    const login = await request(app).post('/api/auth/login').send({ email: 'a@x.com', password: 'pw12345678' });
    expect(login.status).toBe(200);
    const token = login.body.token as string;

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.email).toBe('a@x.com');

    const logout = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`);
    expect(logout.status).toBe(200);

    const meAfter = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(meAfter.status).toBe(401);
  });
  it('login with wrong password returns 401', async () => {
    await request(app).post('/api/auth/setup').send({ name: 'A', email: 'a@x.com', password: 'pw12345678' });
    const r = await request(app).post('/api/auth/login').send({ email: 'a@x.com', password: 'wrong' });
    expect(r.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Implement `routes/auth.ts`**

```typescript
import { Router, type Request, type Response } from 'express';
import type Database from 'better-sqlite3';
import { createUser, login as loginService, logout as logoutService, getSessionUser } from '../services/authService.js';
import { requireAuth } from '../middleware/auth.js';

export function buildAuthRouter(db: Database.Database): Router {
  const r = Router();

  r.post('/setup', async (req: Request, res: Response) => {
    const { name, email, password } = req.body ?? {};
    if (!name || !email || !password || password.length < 8) {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: '需要 name / email / password (>= 8)' } });
      return;
    }
    const existing = db.prepare('SELECT 1 FROM users LIMIT 1').get();
    if (existing) {
      res.status(409).json({ error: { code: 'SETUP_ALREADY_DONE', message: '系統已初始化過' } });
      return;
    }
    const user = await createUser(db, { name, email, password });
    const login = await loginService(db, email, password);
    if (!login.ok) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'setup login failed' } });
      return;
    }
    res.json({ token: login.token, user });
  });

  r.post('/login', async (req: Request, res: Response) => {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: '需要 email + password' } });
      return;
    }
    const r2 = await loginService(db, email, password);
    if (!r2.ok) {
      res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: '帳號或密碼錯誤' } });
      return;
    }
    res.json({ token: r2.token, user: r2.user });
  });

  r.post('/logout', requireAuth, (req: Request, res: Response) => {
    const token = extractToken(req);
    if (token) logoutService(db, token);
    res.json({ ok: true });
  });

  r.get('/me', requireAuth, (req: Request, res: Response) => {
    res.json(req.user);
  });

  return r;
}

function extractToken(req: Request): string | null {
  const header = req.header('Authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return null;
}
```

- [ ] **Step 4: Wire into `index.ts`**

```typescript
// 在 createApp() 內，express.json() 之後：
import { authMiddleware } from './middleware/auth.js';
import { buildAuthRouter } from './routes/auth.js';

app.use(authMiddleware(db));
app.use('/api/auth', buildAuthRouter(db));
```

- [ ] **Step 5: Run → PASS** all auth route tests.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/routes/auth.ts packages/server/src/routes/__tests__/auth.route.test.ts packages/server/src/index.ts
git commit -m "feat(server): add auth routes (setup/login/logout/me) with session middleware (Plan 1 Task 8)"
```

---

## Task 9: Projects CRUD

**Files:**
- Create: `packages/server/src/services/projectService.ts`
- Create: `packages/server/src/routes/projects.ts`
- Create: `packages/server/src/routes/__tests__/projects.route.test.ts`
- Modify: `packages/server/src/index.ts`

- [ ] **Step 1: Failing test for routes** (covers list / create / get / patch / delete + share rotate)

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../index';

let dataDir: string;
let app: ReturnType<typeof createApp>;
let token: string;

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'proj-'));
  app = createApp({ dataDir });
  const r = await request(app).post('/api/auth/setup').send({ name: 'A', email: 'a@x.com', password: 'pw12345678' });
  token = r.body.token;
});
afterEach(() => { rmSync(dataDir, { recursive: true, force: true }); });

const auth = () => ({ Authorization: `Bearer ${token}` });

describe('projects CRUD', () => {
  it('POST /api/projects creates and returns it', async () => {
    const r = await request(app).post('/api/projects').set(auth()).send({ name: '房仲網站' });
    expect(r.status).toBe(201);
    expect(r.body.id).toBeDefined();
    expect(r.body.name).toBe('房仲網站');
    expect(r.body.shareToken).toBeDefined();
  });
  it('GET /api/projects lists owner projects only', async () => {
    await request(app).post('/api/projects').set(auth()).send({ name: 'P1' });
    await request(app).post('/api/projects').set(auth()).send({ name: 'P2' });
    const r = await request(app).get('/api/projects').set(auth());
    expect(r.body.projects).toHaveLength(2);
  });
  it('GET /api/projects/:id returns the project', async () => {
    const c = await request(app).post('/api/projects').set(auth()).send({ name: 'P' });
    const r = await request(app).get(`/api/projects/${c.body.id}`).set(auth());
    expect(r.status).toBe(200);
    expect(r.body.name).toBe('P');
  });
  it('PATCH /api/projects/:id updates name', async () => {
    const c = await request(app).post('/api/projects').set(auth()).send({ name: 'A' });
    const r = await request(app).patch(`/api/projects/${c.body.id}`).set(auth()).send({ name: 'B' });
    expect(r.status).toBe(200);
    expect(r.body.name).toBe('B');
  });
  it('DELETE /api/projects/:id removes it', async () => {
    const c = await request(app).post('/api/projects').set(auth()).send({ name: 'P' });
    const r = await request(app).delete(`/api/projects/${c.body.id}`).set(auth());
    expect(r.status).toBe(200);
    const g = await request(app).get(`/api/projects/${c.body.id}`).set(auth());
    expect(g.status).toBe(404);
  });
  it('POST /api/projects/:id/share/rotate issues a new token', async () => {
    const c = await request(app).post('/api/projects').set(auth()).send({ name: 'P' });
    const old = c.body.shareToken;
    const r = await request(app).post(`/api/projects/${c.body.id}/share/rotate`).set(auth());
    expect(r.body.shareToken).not.toBe(old);
  });
  it('unauthenticated requests return 401', async () => {
    const r = await request(app).get('/api/projects');
    expect(r.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Implement `projectService.ts`**

```typescript
import type Database from 'better-sqlite3';
import { randomBytes } from 'node:crypto';
import { v4 as uuid } from 'uuid';

export interface Project {
  id: string;
  name: string;
  ownerId: string;
  shareToken: string;
  createdAt: string;
  updatedAt: string;
}

function shareToken(): string { return randomBytes(16).toString('hex'); }

export function createProject(db: Database.Database, ownerId: string, name: string): Project {
  const id = uuid();
  const token = shareToken();
  db.prepare('INSERT INTO projects (id, name, owner_id, share_token) VALUES (?, ?, ?, ?)')
    .run(id, name, ownerId, token);
  return getProject(db, id)!;
}

export function listProjects(db: Database.Database, ownerId: string): Project[] {
  const rows = db.prepare('SELECT * FROM projects WHERE owner_id = ? ORDER BY updated_at DESC').all(ownerId) as Array<{
    id: string; name: string; owner_id: string; share_token: string; created_at: string; updated_at: string;
  }>;
  return rows.map(toCamel);
}

export function getProject(db: Database.Database, id: string): Project | null {
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as
    | { id: string; name: string; owner_id: string; share_token: string; created_at: string; updated_at: string }
    | undefined;
  return row ? toCamel(row) : null;
}

export function updateProject(db: Database.Database, id: string, patch: { name?: string }): Project | null {
  if (patch.name !== undefined) {
    db.prepare("UPDATE projects SET name = ?, updated_at = datetime('now') WHERE id = ?").run(patch.name, id);
  }
  return getProject(db, id);
}

export function deleteProject(db: Database.Database, id: string): void {
  db.prepare('DELETE FROM projects WHERE id = ?').run(id);
}

export function rotateShareToken(db: Database.Database, id: string): Project | null {
  const token = shareToken();
  db.prepare("UPDATE projects SET share_token = ?, updated_at = datetime('now') WHERE id = ?").run(token, id);
  return getProject(db, id);
}

function toCamel(r: { id: string; name: string; owner_id: string; share_token: string; created_at: string; updated_at: string }): Project {
  return { id: r.id, name: r.name, ownerId: r.owner_id, shareToken: r.share_token, createdAt: r.created_at, updatedAt: r.updated_at };
}
```

- [ ] **Step 4: Implement `routes/projects.ts`**

```typescript
import { Router, type Request, type Response } from 'express';
import type Database from 'better-sqlite3';
import { requireAuth } from '../middleware/auth.js';
import {
  createProject, listProjects, getProject, updateProject, deleteProject, rotateShareToken,
} from '../services/projectService.js';

export function buildProjectsRouter(db: Database.Database): Router {
  const r = Router();
  r.use(requireAuth);

  r.get('/', (req: Request, res: Response) => {
    res.json({ projects: listProjects(db, req.user!.id) });
  });

  r.post('/', (req: Request, res: Response) => {
    const name = String(req.body?.name ?? '').trim();
    if (!name) { res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: '需要 name' } }); return; }
    const p = createProject(db, req.user!.id, name);
    res.status(201).json(p);
  });

  r.get('/:id', (req: Request, res: Response) => {
    const p = getProject(db, req.params.id as string);
    if (!p || p.ownerId !== req.user!.id) { res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } }); return; }
    res.json(p);
  });

  r.patch('/:id', (req: Request, res: Response) => {
    const existing = getProject(db, req.params.id as string);
    if (!existing || existing.ownerId !== req.user!.id) { res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } }); return; }
    const updated = updateProject(db, req.params.id as string, { name: req.body?.name });
    res.json(updated);
  });

  r.delete('/:id', (req: Request, res: Response) => {
    const existing = getProject(db, req.params.id as string);
    if (!existing || existing.ownerId !== req.user!.id) { res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } }); return; }
    deleteProject(db, req.params.id as string);
    res.json({ ok: true });
  });

  r.post('/:id/share/rotate', (req: Request, res: Response) => {
    const existing = getProject(db, req.params.id as string);
    if (!existing || existing.ownerId !== req.user!.id) { res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } }); return; }
    const rotated = rotateShareToken(db, req.params.id as string);
    res.json(rotated);
  });

  return r;
}
```

- [ ] **Step 5: Wire into `index.ts`**

```typescript
import { buildProjectsRouter } from './routes/projects.js';
// after auth router:
app.use('/api/projects', buildProjectsRouter(db));
```

- [ ] **Step 6: Run → PASS** all projects route tests.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/services/projectService.ts packages/server/src/routes/projects.ts packages/server/src/routes/__tests__/projects.route.test.ts packages/server/src/index.ts
git commit -m "feat(server): add projects CRUD routes with share token rotation (Plan 1 Task 9)"
```

---

## Task 10: Create fresh client skeleton

**Files:**
- Create: `packages/client/package.json`
- Create: `packages/client/vite.config.ts`
- Create: `packages/client/tsconfig.json`
- Create: `packages/client/index.html`
- Create: `packages/client/src/main.tsx`
- Create: `packages/client/src/App.tsx`
- Create: `packages/client/src/styles/theme.css`
- Create: `packages/client/src/lib/api.ts`
- Create: `packages/client/src/stores/useAuthStore.ts`

- [ ] **Step 1: `package.json`**

```json
{
  "name": "client",
  "version": "2.0.0-alpha.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.27.0",
    "zustand": "^4.5.5"
  },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.3",
    "typescript": "^5.6.3",
    "vite": "^5.4.10"
  }
}
```

- [ ] **Step 2: `vite.config.ts`**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:3001',
    },
  },
});
```

- [ ] **Step 3: `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "useDefineForClassFields": true,
    "allowImportingTsExtensions": false,
    "noEmit": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: `index.html`**

```html
<!doctype html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>DesignBridge</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

- [ ] **Step 5: `src/main.tsx`**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles/theme.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
```

- [ ] **Step 6: `src/styles/theme.css`**（dark glass tokens 從 spec § 3 vs v1.5 同套）

```css
:root, [data-theme="dark"] {
  --bg-root: #060d1a;
  --bg-card: #0f172a;
  --bg-elevated: #1e293b;
  --bg-input: #334155;
  --accent: #7c5cbf;
  --accent-glass: rgba(124, 92, 191, 0.22);
  --accent-grad-start: #7c5cbf;
  --accent-grad-end: #c084fc;
  --text-primary: #f1f5f9;
  --text-secondary: #cbd5e1;
  --text-muted: #94a3b8;
  --text-accent: #e9d5ff;
  --border-primary: #334155;
  --border-subtle: #1e293b;
  --border-accent: rgba(192, 132, 252, 0.3);
}

* { box-sizing: border-box; }

html, body, #root {
  margin: 0; padding: 0;
  height: 100%;
  background: var(--bg-root);
  color: var(--text-primary);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang TC", "Microsoft JhengHei", sans-serif;
  font-size: 14px;
  line-height: 1.6;
}

a { color: var(--text-accent); text-decoration: none; }
a:hover { text-decoration: underline; }
```

- [ ] **Step 7: `src/lib/api.ts`**

```typescript
const TOKEN_KEY = 'db_session_token';

export function getToken(): string | null { return localStorage.getItem(TOKEN_KEY); }
export function setToken(t: string | null): void {
  if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY);
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const r = await fetch(path, { ...init, headers });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new ApiError(r.status, body.error?.code ?? 'UNKNOWN', body.error?.message ?? r.statusText);
  }
  return r.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}
```

- [ ] **Step 8: `src/stores/useAuthStore.ts`**

```typescript
import { create } from 'zustand';
import { api, getToken, setToken } from '../lib/api';

interface User { id: string; name: string; email: string; }

interface State {
  user: User | null;
  loading: boolean;
  setup: (input: { name: string; email: string; password: string }) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
}

export const useAuthStore = create<State>((set) => ({
  user: null,
  loading: true,
  setup: async (input) => {
    const r = await api<{ token: string; user: User }>('/api/auth/setup', { method: 'POST', body: JSON.stringify(input) });
    setToken(r.token);
    set({ user: r.user, loading: false });
  },
  login: async (email, password) => {
    const r = await api<{ token: string; user: User }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    setToken(r.token);
    set({ user: r.user, loading: false });
  },
  logout: async () => {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
    setToken(null);
    set({ user: null, loading: false });
  },
  hydrate: async () => {
    if (!getToken()) { set({ user: null, loading: false }); return; }
    try {
      const user = await api<User>('/api/auth/me');
      set({ user, loading: false });
    } catch {
      setToken(null);
      set({ user: null, loading: false });
    }
  },
}));
```

- [ ] **Step 9: `src/App.tsx`** — 最簡，只 hydrate + 顯示「Hello, <user>」或「Please log in」

```tsx
import { useEffect } from 'react';
import { useAuthStore } from './stores/useAuthStore';

export default function App() {
  const { user, loading, hydrate, logout } = useAuthStore();
  useEffect(() => { void hydrate(); }, [hydrate]);

  if (loading) return <div style={{ padding: 24 }}>載入中…</div>;

  return (
    <div style={{ padding: 24 }}>
      {user ? (
        <>
          <h1>Hello, {user.name}</h1>
          <p>{user.email}</p>
          <button onClick={() => void logout()}>登出</button>
        </>
      ) : (
        <p>尚未登入</p>
      )}
    </div>
  );
}
```

- [ ] **Step 10: Install + verify dev server**

```bash
cd packages/client
pnpm install
pnpm dev
```

開 `http://localhost:5173`，應該看到「尚未登入」（因為沒設定 token 也沒 hydrate 到使用者）。沒爆 console error。

- [ ] **Step 11: Commit**

```bash
git add packages/client/
git commit -m "feat(client): scaffold new client (Vite + React + zustand + theme) (Plan 1 Task 10)"
```

---

## Task 11: Setup + Login + Projects pages

**Files:**
- Create: `packages/client/src/pages/SetupPage.tsx`
- Create: `packages/client/src/pages/LoginPage.tsx`
- Create: `packages/client/src/pages/ProjectsPage.tsx`
- Create: `packages/client/src/stores/useProjectsStore.ts`
- Modify: `packages/client/src/App.tsx`

- [ ] **Step 1: `useProjectsStore.ts`**

```typescript
import { create } from 'zustand';
import { api } from '../lib/api';

interface Project { id: string; name: string; createdAt: string; updatedAt: string; shareToken: string; }

interface State {
  projects: Project[];
  loading: boolean;
  list: () => Promise<void>;
  create: (name: string) => Promise<Project>;
}

export const useProjectsStore = create<State>((set, get) => ({
  projects: [],
  loading: false,
  list: async () => {
    set({ loading: true });
    const r = await api<{ projects: Project[] }>('/api/projects');
    set({ projects: r.projects, loading: false });
  },
  create: async (name) => {
    const p = await api<Project>('/api/projects', { method: 'POST', body: JSON.stringify({ name }) });
    set({ projects: [p, ...get().projects] });
    return p;
  },
}));
```

- [ ] **Step 2: `SetupPage.tsx`** — 第一次安裝建立 admin

```tsx
import { useState, type CSSProperties, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/useAuthStore';

export default function SetupPage() {
  const setup = useAuthStore((s) => s.setup);
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    try { await setup({ name, email, password }); navigate('/projects'); }
    catch (e) { setErr((e as Error).message); }
  };

  return (
    <form onSubmit={submit} style={form}>
      <h1>初次安裝</h1>
      <input placeholder="姓名" value={name} onChange={(e) => setName(e.target.value)} required style={input} />
      <input placeholder="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={input} />
      <input placeholder="密碼（>= 8 字）" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} style={input} />
      {err && <div style={{ color: '#fca5a5' }}>{err}</div>}
      <button type="submit" style={btn}>建立並登入</button>
    </form>
  );
}

const form: CSSProperties = { maxWidth: 360, margin: '80px auto', display: 'flex', flexDirection: 'column', gap: 12, padding: 24, background: 'var(--bg-card)', borderRadius: 12 };
const input: CSSProperties = { padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-primary)', background: 'var(--bg-input)', color: 'var(--text-primary)' };
const btn: CSSProperties = { padding: '10px 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, var(--accent-grad-start), var(--accent-grad-end))', color: '#fff', cursor: 'pointer', fontWeight: 600 };
```

- [ ] **Step 3: `LoginPage.tsx`** — 結構同 SetupPage 但呼叫 `login`

```tsx
import { useState, type CSSProperties, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/useAuthStore';

export default function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    try { await login(email, password); navigate('/projects'); }
    catch (e) { setErr((e as Error).message); }
  };

  return (
    <form onSubmit={submit} style={form}>
      <h1>登入</h1>
      <input placeholder="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={input} />
      <input placeholder="密碼" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={input} />
      {err && <div style={{ color: '#fca5a5' }}>{err}</div>}
      <button type="submit" style={btn}>登入</button>
    </form>
  );
}

const form: CSSProperties = { maxWidth: 360, margin: '80px auto', display: 'flex', flexDirection: 'column', gap: 12, padding: 24, background: 'var(--bg-card)', borderRadius: 12 };
const input: CSSProperties = { padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-primary)', background: 'var(--bg-input)', color: 'var(--text-primary)' };
const btn: CSSProperties = { padding: '10px 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, var(--accent-grad-start), var(--accent-grad-end))', color: '#fff', cursor: 'pointer', fontWeight: 600 };
```

- [ ] **Step 4: `ProjectsPage.tsx`** — list + create

```tsx
import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { useProjectsStore } from '../stores/useProjectsStore';
import { useAuthStore } from '../stores/useAuthStore';

export default function ProjectsPage() {
  const { projects, list, create } = useProjectsStore();
  const logout = useAuthStore((s) => s.logout);
  const [name, setName] = useState('');

  useEffect(() => { void list(); }, [list]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await create(name.trim());
    setName('');
  };

  return (
    <div style={{ maxWidth: 720, margin: '40px auto', padding: 24 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>專案</h1>
        <button onClick={() => void logout()} style={ghostBtn}>登出</button>
      </header>
      <form onSubmit={submit} style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <input placeholder="新專案名稱" value={name} onChange={(e) => setName(e.target.value)} style={input} />
        <button type="submit" style={btn}>建立</button>
      </form>
      <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {projects.map((p) => (
          <li key={p.id} style={{ padding: 14, background: 'var(--bg-card)', borderRadius: 8 }}>
            <strong>{p.name}</strong>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.id}</div>
          </li>
        ))}
        {projects.length === 0 && <li style={{ color: 'var(--text-muted)' }}>尚無專案</li>}
      </ul>
    </div>
  );
}

const input: CSSProperties = { flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-primary)', background: 'var(--bg-input)', color: 'var(--text-primary)' };
const btn: CSSProperties = { padding: '10px 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, var(--accent-grad-start), var(--accent-grad-end))', color: '#fff', cursor: 'pointer', fontWeight: 600 };
const ghostBtn: CSSProperties = { padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border-primary)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' };
```

- [ ] **Step 5: Update `App.tsx` to add routing**

```tsx
import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/useAuthStore';
import { api } from './lib/api';
import LoginPage from './pages/LoginPage';
import SetupPage from './pages/SetupPage';
import ProjectsPage from './pages/ProjectsPage';

export default function App() {
  const { user, loading, hydrate } = useAuthStore();
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);

  useEffect(() => { void hydrate(); }, [hydrate]);

  useEffect(() => {
    // 偵測是否需要 setup（無使用者時 health 回 userCount=0）
    api<{ ok: boolean; userCount: number }>('/api/health')
      .then((h) => setNeedsSetup(h.userCount === 0))
      .catch(() => setNeedsSetup(false));
  }, []);

  if (loading || needsSetup === null) return <div style={{ padding: 24 }}>載入中…</div>;

  return (
    <Routes>
      <Route path="/setup" element={needsSetup ? <SetupPage /> : <Navigate to="/login" />} />
      <Route path="/login" element={user ? <Navigate to="/projects" /> : <LoginPage />} />
      <Route path="/projects" element={user ? <ProjectsPage /> : <Navigate to={needsSetup ? '/setup' : '/login'} />} />
      <Route path="*" element={<Navigate to={user ? '/projects' : (needsSetup ? '/setup' : '/login')} />} />
    </Routes>
  );
}
```

- [ ] **Step 6: 手動 smoke 全流程**

```bash
# Terminal 1
pnpm --filter server dev

# Terminal 2
pnpm --filter client dev
```

開 `http://localhost:5173`：
1. 首次應該轉到 `/setup`
2. 填表 → 進到 `/projects`
3. 建立一個專案 → 看到在清單裡
4. 登出 → 回到 `/login`
5. 用同 email/密碼登入 → 看到剛才的專案

- [ ] **Step 7: Commit**

```bash
git add packages/client/
git commit -m "feat(client): add setup/login/projects pages with routing (Plan 1 Task 11)"
```

---

## Task 12: Final verify

- [ ] **Step 1: 所有測試綠**

```bash
pnpm --filter server test
```

Expected：所有 connection / migrator / authService / auth route / projects route 測試通過。

- [ ] **Step 2: 兩個 build 都過**

```bash
pnpm --filter server build
pnpm --filter client build
```

Expected：server 產出 `dist/`、client 產出 `dist/`。皆 exit 0。

- [ ] **Step 3: legacy 還能 build（確認沒打壞舊版）**

```bash
pnpm --filter ./legacy/packages/server build
pnpm --filter ./legacy/packages/client build
```

Expected：exit 0。

- [ ] **Step 4: 完成 commit + push**

```bash
git push origin main
```

---

## Acceptance Criteria

- [ ] v1.5 整包安全搬到 `legacy/`，仍 build 得起來
- [ ] 新 `packages/server` 跑 dev 可開（port 3001），`/api/health` 回 `{ok:true,db:'ok',userCount:N}`
- [ ] 6 個 migration 跑得起來，`bridge.db` 內有 spec § 7.2 的 13 個 table（含 `schema_migrations`）
- [ ] 新 `packages/client` 跑 dev 可開（port 5173），proxy `/api` 到 server
- [ ] 首次訪問轉到 `/setup`，填表後建立 admin + 自動登入 + 進到 `/projects`
- [ ] 建立、列出、登出、登入、再列出仍看到專案
- [ ] 所有 server 測試綠（連接 / 遷移 / authService / auth route / projects route）
- [ ] 兩個 package build 皆綠
- [ ] 一個 commit 一個 Task（共 12 個 commit）

---

## Compiler Invariant（M1 起手概念）

> 從這 plan 起，所有後續 plan 都建在這套骨架上：Express + better-sqlite3 + bcrypt session + zustand client + dark glass theme + `/api/*` 路由前綴 + 統一錯誤 JSON。Plan 2+ 不再改這些基礎決定。

---

## Risks / Notes

1. **better-sqlite3 native 編譯**：在 dev / docker 切換時可能要 `pnpm rebuild better-sqlite3`。M1 docker image 重建時注意。
2. **legacy 仍在 workspace**：暫時 OK，但 `pnpm install` 會把 legacy deps 也裝下來。M2 完工後可考慮從 workspace 移出（保留檔案但不參與 install）。
3. **CORS / cookie**：dev 走 Vite proxy 所以 same-origin；M2 deploy 後若 client / server 跨網域要補 CORS。
4. **bcrypt 在 alpine docker**：legacy v1.5 已踩過 musl/glibc 切換 rebuild 的坑。M2 deploy 時 server stage 改用 ubuntu base 或 prod stage rebuild bcrypt。
5. **`/api/health` 暴露 userCount**：M2 後改成 admin only（或拿掉），避免攻擊面。
6. **Setup race condition**：兩個 client 同時點 setup 會有一個失敗。現在用 `SELECT 1 FROM users LIMIT 1` 檢查不是 atomic — 但 race 機率低且失敗 fail-safe，M2 可以加 unique constraint or app-level lock。

---

**Plan end. 12 Tasks，產出獨立可驗證的 foundation。執行完看到登入後可以建專案 = 全 plan 通過。**
