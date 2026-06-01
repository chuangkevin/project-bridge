# Plan 2 — Provider Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Port v1.5 `provider.ts` (ai-core v3.4.1 MultiProviderClient + adapters + key pool + OpenAI OAuth) into the new `@designbridge/server` package and add a `callProvider({mode, ...})` unified helper + an SSE keepalive helper. After this plan, server can call OpenCode → Gemini → OpenAI/Codex with fallback, and unit tests cover the routing decisions.

**Architecture:** Copy 3 service files (`provider.ts`, `codexResponsesAdapter.ts`, `projectBridgeAdapter.ts`) from legacy into the new server with import path updates only. Add `routes/openaiOAuth.ts` (port). Add new `services/callProvider.ts` (thin wrapper that prep system prompt + thinking instruction + invokes provider). Add `utils/sseKeepalive.ts`. Tests mock the ai-core adapters and verify RoutePolicy outcomes + JSON-instruction injection + keepalive emits heartbeat.

**Tech Stack:** ai-core v3.4.1 (from Gitea internal URL — already in legacy lockfile), bcrypt 5 (no), better-sqlite3 11, `@google/generative-ai` (kept ONLY for settings.ts key validation per CLAUDE.md — but we skip settings.ts in this plan; key validation moves to Plan 12), uuid, supertest. Vitest 3.2.4.

**Spec:** [`../specs/2026-06-01-designbridge-redesign-design.md`](../specs/2026-06-01-designbridge-redesign-design.md) § 5 AI Provider Routing + § 1.2 hard constraints (api_key_* schema unchanged).

**Scope boundary (out of plan):** NO settings UI (Plan 14). NO chat SSE endpoint (Plan 6). NO Gemini-key add/validate UI (Plan 14). NO multi-server OpenCode UI (Plan 14). NO actual streaming integration (just helper + adapter capability). NO Anthropic native extended thinking (added in Plan 6 chat endpoint).

---

## File Structure

```
packages/server/src/
  services/
    provider.ts                      ← PORT from legacy/packages/server/src/services/provider.ts (modify imports)
    codexResponsesAdapter.ts         ← PORT (~as-is)
    projectBridgeAdapter.ts          ← PORT (already uses our 3 api_key_* tables — schema matches)
    callProvider.ts                  ← NEW: { mode, prompt, history?, streaming? } → AsyncIterable<token>
    __tests__/
      provider.test.ts               ← NEW: route policy + adapter selection
      callProvider.test.ts           ← NEW: mocked provider call
  routes/
    openaiOAuth.ts                   ← PORT from legacy/packages/server/src/routes/openaiOAuth.ts
    __tests__/
      openaiOAuth.route.test.ts      ← NEW (basic 200/302/400 checks via supertest)
  utils/
    sseKeepalive.ts                  ← NEW: helper to emit `: heartbeat\n\n` every N ms on SSE res
    __tests__/
      sseKeepalive.test.ts           ← NEW
  middleware/
    settings.ts                      ← NEW: read settings(key) helper (used by provider.ts replacement)
  db/migrations/
    007_openai_oauth_state.sql       ← NEW: small table for PKCE state during OAuth flow

packages/server/package.json         ← MODIFY: add @kevinsisi/ai-core, @anthropic-ai/sdk, openai (if needed)
```

---

## Task 1: Install AI provider dependencies

**Files:**
- Modify: `packages/server/package.json`

- [ ] **Step 1** — Inspect legacy deps to find exact versions

```bash
cd D:/Projects/_HomeProject/project-bridge
grep -E '@kevinsisi/ai-core|@anthropic-ai/sdk|openai|@google/generative-ai' legacy/packages/server/package.json
```

Capture the exact version specs (especially `@kevinsisi/ai-core` which uses a Git URL).

- [ ] **Step 2** — Add to `packages/server/package.json` dependencies (keep alphabetical):

```json
"dependencies": {
  "@kevinsisi/ai-core": "<COPY EXACT SPEC FROM LEGACY>",
  ...
}
```

If legacy uses a Git URL like `https://gitea.housefun.com.tw/H1114/ai-core#v3.4.1`, copy verbatim. Do NOT add `@google/generative-ai` in this plan — its only use in legacy was key validation in `routes/settings.ts` which is out of scope here (Plan 14 will add it back if needed).

- [ ] **Step 3** — Install + verify no errors

```bash
pnpm install
pnpm --filter @designbridge/server build           # type check should pass even without using ai-core yet
```

- [ ] **Step 4** — Commit

```bash
git add packages/server/package.json pnpm-lock.yaml
git commit -m "feat(server): add ai-core v3.4.1 dependency (Plan 2 Task 1)"
```

---

## Task 2: Port `projectBridgeAdapter.ts`

**Files:**
- Create: `packages/server/src/services/projectBridgeAdapter.ts`

- [ ] **Step 1** — Read `legacy/packages/server/src/services/projectBridgeAdapter.ts` and copy into the new path.

- [ ] **Step 2** — Update imports:
- Replace any import of `../db/connection` or similar legacy paths with the new server's equivalent (`../db/connection.js` — note `.js` extension required for ESM `NodeNext`).
- Replace any path that pointed to `../config` or v1.5-specific helpers with explicit equivalents OR leave a TODO comment IF the helper isn't yet ported (this plan focuses on routing, not config plumbing).

- [ ] **Step 3** — Update any DB query that referenced columns we don't have. Our schema for `api_key_leases` / `api_key_cooldowns` / `api_key_usage` matches v1.5 (per Plan 1 migration 002). If anything references a different table name, FIX it; if it references columns we don't have, STOP and report BLOCKED.

- [ ] **Step 4** — Type check passes

```bash
pnpm --filter @designbridge/server build
```

- [ ] **Step 5** — Commit

```bash
git add packages/server/src/services/projectBridgeAdapter.ts
git commit -m "feat(server): port ProjectBridgeAdapter (ai-core storage) from v1.5 (Plan 2 Task 2)"
```

---

## Task 3: Port `codexResponsesAdapter.ts`

**Files:**
- Create: `packages/server/src/services/codexResponsesAdapter.ts`

- [ ] **Step 1** — Read `legacy/packages/server/src/services/codexResponsesAdapter.ts`, copy across.

- [ ] **Step 2** — Update imports (mostly `@anthropic-ai/sdk` and `ai-core` types — these come from the deps installed in Task 1).

- [ ] **Step 3** — Type check passes

```bash
pnpm --filter @designbridge/server build
```

- [ ] **Step 4** — Commit

```bash
git add packages/server/src/services/codexResponsesAdapter.ts
git commit -m "feat(server): port CodexResponsesAdapter from v1.5 (Plan 2 Task 3)"
```

---

## Task 4: Settings helper + Port `provider.ts`

**Files:**
- Create: `packages/server/src/services/settings.ts` (replaces v1.5's bespoke `readSetting`)
- Create: `packages/server/src/services/provider.ts`
- Create: `packages/server/src/services/__tests__/settings.test.ts`

- [ ] **Step 1** — Write `settings.ts` with `readSetting(db, key)` + `writeSetting(db, key, value)` + `deleteSetting(db, key)`.

```typescript
import type Database from 'better-sqlite3';

export function readSetting(db: Database.Database, key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}
export function writeSetting(db: Database.Database, key: string, value: string): void {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}
export function deleteSetting(db: Database.Database, key: string): void {
  db.prepare('DELETE FROM settings WHERE key = ?').run(key);
}
```

- [ ] **Step 2** — Failing test `settings.test.ts`:

```typescript
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
```

- [ ] **Step 3** — Implement settings, run test → PASS (4 new tests, total now 31).

- [ ] **Step 4** — Read `legacy/packages/server/src/services/provider.ts`. The file is long (~500 lines). Copy it across.

- [ ] **Step 5** — Update imports in provider.ts:
- `from '../db/connection'` → `from '../db/connection.js'`
- `from './codexResponsesAdapter'` → `from './codexResponsesAdapter.js'`
- `from './projectBridgeAdapter'` → `from './projectBridgeAdapter.js'`
- Any internal `readSetting` calls — replace with imports from `./settings.js` (signature changes: from `readSetting(key)` → `readSetting(db, key)`). The provider needs a singleton db OR an injected db. Refactor `provider.ts` to accept a db dependency in `getProvider(db)` rather than reading from a singleton — OR keep singleton via a small initialiser called at app startup. **Recommended:** singleton initialiser to minimise diff:

```typescript
// near top of provider.ts
let dbRef: Database.Database | null = null;
export function initProvider(db: Database.Database): void { dbRef = db; }
function getDb(): Database.Database {
  if (!dbRef) throw new Error('provider not initialised — call initProvider(db) in app startup');
  return dbRef;
}
// replace all `readSetting(key)` with `readSetting(getDb(), key)`
```

- [ ] **Step 6** — Wire `initProvider(db)` into `createApp` in `packages/server/src/index.ts`:

```typescript
import { initProvider } from './services/provider.js';
// inside createApp, after db is opened and migrations run:
initProvider(db);
```

- [ ] **Step 7** — `pnpm --filter @designbridge/server build` passes.

- [ ] **Step 8** — Commit

```bash
git add packages/server/src/services/settings.ts packages/server/src/services/provider.ts packages/server/src/services/__tests__/settings.test.ts packages/server/src/index.ts
git commit -m "feat(server): port provider.ts (ai-core MultiProviderClient) + settings helper (Plan 2 Task 4)"
```

---

## Task 5: Port OpenAI OAuth routes

**Files:**
- Create: `packages/server/src/routes/openaiOAuth.ts`
- Create: `packages/server/src/db/migrations/007_openai_oauth_state.sql`
- Modify: `packages/server/src/index.ts` (mount router)

- [ ] **Step 1** — Read `legacy/packages/server/src/routes/openaiOAuth.ts`. Port it across.

- [ ] **Step 2** — The legacy code may keep PKCE `state` in memory or in `settings`. For correctness across restarts, give it its own table. Migration `007_openai_oauth_state.sql`:

```sql
CREATE TABLE openai_oauth_state (
  state         TEXT PRIMARY KEY,
  code_verifier TEXT NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_oauth_state_created ON openai_oauth_state(created_at);
```

(Old states should be cleaned up by a cron-like task later; M1 just stores them.)

- [ ] **Step 3** — Adapt the route to use this table for storing/retrieving state during the OAuth callback.

- [ ] **Step 4** — Use `readSetting` / `writeSetting` from Task 4 to persist `openai_oauth_access_token`, `openai_oauth_refresh_token`, `openai_oauth_expires_at` in `settings` (NOT in the new state table — settings is the existing pattern from v1.5).

- [ ] **Step 5** — Mount in `index.ts`:

```typescript
import { buildOpenaiOAuthRouter } from './routes/openaiOAuth.js';
// after auth + projects routers:
app.use('/api/openai-oauth', buildOpenaiOAuthRouter(db));
```

- [ ] **Step 6** — Tests covering the four endpoints (`POST /start`, `GET /callback`, `GET /status`, `DELETE /`). Mock `fetch` for the token-exchange call.

```typescript
// __tests__/openaiOAuth.route.test.ts — basic happy path + error
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../index';

beforeEach(() => { /* ... */ });
afterEach(() => { /* ... */ });

describe('POST /api/openai-oauth/start', () => {
  it('returns authorize URL with state + PKCE challenge', async () => {
    // ... setup app, ...
    const r = await request(app).post('/api/openai-oauth/start').set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.authorizeUrl).toContain('code_challenge=');
    expect(r.body.authorizeUrl).toContain('state=');
  });
});

describe('GET /api/openai-oauth/status', () => {
  it('returns connected:false when no access token in settings', async () => {
    const r = await request(app).get('/api/openai-oauth/status').set('Authorization', `Bearer ${token}`);
    expect(r.body.connected).toBe(false);
  });
});

// Add additional callback + delete tests as appropriate
```

- [ ] **Step 7** — Build + test pass

```bash
pnpm --filter @designbridge/server test
```

- [ ] **Step 8** — Commit

```bash
git add packages/server/src/routes/openaiOAuth.ts packages/server/src/routes/__tests__/openaiOAuth.route.test.ts packages/server/src/db/migrations/007_openai_oauth_state.sql packages/server/src/index.ts
git commit -m "feat(server): port OpenAI OAuth PKCE routes + state table (Plan 2 Task 5)"
```

---

## Task 6: `callProvider` unified helper

**Files:**
- Create: `packages/server/src/services/callProvider.ts`
- Create: `packages/server/src/services/__tests__/callProvider.test.ts`

- [ ] **Step 1** — Failing test:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callProvider } from '../callProvider';
import * as providerModule from '../provider';

beforeEach(() => { vi.restoreAllMocks(); });

describe('callProvider', () => {
  it('streams tokens from provider.streamContent', async () => {
    const fakeStream = async function* () { yield 'hello '; yield 'world'; };
    vi.spyOn(providerModule, 'getProvider').mockReturnValue({
      streamContent: () => fakeStream(),
      generateContent: vi.fn(),
    } as never);

    const out: string[] = [];
    for await (const tok of callProvider({ mode: 'consult', prompt: 'hi', streaming: true })) out.push(tok);
    expect(out.join('')).toBe('hello world');
  });

  it('non-streaming returns full text in one yield', async () => {
    vi.spyOn(providerModule, 'getProvider').mockReturnValue({
      streamContent: vi.fn(),
      generateContent: async () => ({ text: 'full response' }),
    } as never);
    const out: string[] = [];
    for await (const tok of callProvider({ mode: 'consult', prompt: 'hi', streaming: false })) out.push(tok);
    expect(out.join('')).toBe('full response');
  });

  it('injects thinking instruction into system prompt for non-Anthropic providers', async () => {
    let captured: { systemInstruction?: string } | null = null;
    vi.spyOn(providerModule, 'getProvider').mockReturnValue({
      streamContent: (params: { systemInstruction?: string }) => {
        captured = params;
        return (async function* () { yield ''; })();
      },
      generateContent: vi.fn(),
    } as never);
    const it1 = callProvider({ mode: 'consult', prompt: 'hi', streaming: true });
    for await (const _ of it1) { /* drain */ }
    expect(captured?.systemInstruction).toMatch(/thinking/i);
  });
});
```

- [ ] **Step 2** — Implement `callProvider.ts`:

```typescript
import { getProvider } from './provider.js';

export interface CallProviderOptions {
  mode: 'consult' | 'architect' | 'design';
  prompt: string;
  systemInstruction?: string;
  history?: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>;
  streaming?: boolean;
}

const MODE_SYSTEM_PROMPT: Record<CallProviderOptions['mode'], string> = {
  consult: 'You are a UI design consultant. Help clarify requirements before generating code.',
  architect: 'You are a UI architect. Propose page-graph structures.',
  design: 'You are a Vue 3 + Tailwind UI generator. Output a single <template>-only SFC.',
};

const THINKING_INSTRUCTION = `
Before your main response, write a brief reasoning section enclosed in <thinking>...</thinking> tags.
Then write your actual response. Both will be shown to the user, but the thinking is rendered as auxiliary content.
`.trim();

export async function* callProvider(opts: CallProviderOptions): AsyncIterable<string> {
  const provider = getProvider();
  const baseSystem = MODE_SYSTEM_PROMPT[opts.mode];
  const userSystem = opts.systemInstruction ?? '';
  const systemInstruction = [baseSystem, userSystem, THINKING_INSTRUCTION].filter(Boolean).join('\n\n');

  const params = {
    prompt: opts.prompt,
    systemInstruction,
    history: opts.history,
  };

  if (opts.streaming !== false) {
    for await (const tok of provider.streamContent(params as never)) {
      yield tok;
    }
  } else {
    const res = await provider.generateContent(params as never);
    yield res.text;
  }
}
```

- [ ] **Step 3** — Test should pass.

- [ ] **Step 4** — Commit

```bash
git add packages/server/src/services/callProvider.ts packages/server/src/services/__tests__/callProvider.test.ts
git commit -m "feat(server): add callProvider unified helper (mode-aware system prompt + thinking) (Plan 2 Task 6)"
```

---

## Task 7: SSE keepalive utility

**Files:**
- Create: `packages/server/src/utils/sseKeepalive.ts`
- Create: `packages/server/src/utils/__tests__/sseKeepalive.test.ts`

- [ ] **Step 1** — Failing test:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Response } from 'express';
import { startSseKeepalive, stopSseKeepalive } from '../sseKeepalive';

interface FakeRes { writes: string[]; ended: boolean; write: (s: string) => void; end: () => void; }
function fakeRes(): FakeRes {
  const r: FakeRes = { writes: [], ended: false, write(s) { if (!r.ended) r.writes.push(s); }, end() { r.ended = true; } };
  return r;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('sseKeepalive', () => {
  it('writes ": heartbeat\\n\\n" every interval', () => {
    const res = fakeRes();
    const h = startSseKeepalive(res as unknown as Response, 1000);
    vi.advanceTimersByTime(3500);
    expect(res.writes.filter(w => w === ': heartbeat\n\n').length).toBe(3);
    stopSseKeepalive(h);
  });
  it('stops writing after stopSseKeepalive', () => {
    const res = fakeRes();
    const h = startSseKeepalive(res as unknown as Response, 1000);
    vi.advanceTimersByTime(1500);
    stopSseKeepalive(h);
    vi.advanceTimersByTime(5000);
    expect(res.writes.length).toBe(1);
  });
  it('stops writing after res.end()', () => {
    const res = fakeRes();
    const h = startSseKeepalive(res as unknown as Response, 1000);
    vi.advanceTimersByTime(1500);
    res.end();
    vi.advanceTimersByTime(5000);
    expect(res.writes.length).toBe(1);
    stopSseKeepalive(h);
  });
});
```

- [ ] **Step 2** — Implement:

```typescript
import type { Response } from 'express';

export interface KeepaliveHandle { timer: NodeJS.Timeout; }

export function startSseKeepalive(res: Response, intervalMs = 15_000): KeepaliveHandle {
  const timer = setInterval(() => {
    if ((res as unknown as { writableEnded?: boolean }).writableEnded) return;
    try { res.write(': heartbeat\n\n'); } catch { /* socket gone */ }
  }, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  return { timer };
}

export function stopSseKeepalive(handle: KeepaliveHandle): void {
  clearInterval(handle.timer);
}
```

Note: The mock `fakeRes` doesn't have `writableEnded` so the check needs to gracefully detect via the ended flag too — adjust the impl OR adjust the test's `end()` to set `writableEnded = true`:

```typescript
end() { r.ended = true; (r as { writableEnded?: boolean }).writableEnded = true; }
```

- [ ] **Step 3** — Test passes.

- [ ] **Step 4** — Commit

```bash
git add packages/server/src/utils/sseKeepalive.ts packages/server/src/utils/__tests__/sseKeepalive.test.ts
git commit -m "feat(server): add SSE keepalive helper (15s heartbeat for long AI calls) (Plan 2 Task 7)"
```

---

## Task 8: Provider integration smoke + final verify

**Files:** (no new files — verification only)

- [ ] **Step 1** — Run all server tests

```bash
pnpm --filter @designbridge/server test
```

Expected: 31 prior + 4 settings + 3 callProvider + 3 sseKeepalive + some openaiOAuth tests = ~42 total. All pass.

- [ ] **Step 2** — Build clean

```bash
pnpm --filter @designbridge/server build
pnpm --filter @designbridge/client build           # client should still build
pnpm --filter ./legacy/packages/server build       # legacy still green
pnpm --filter ./legacy/packages/client build
```

- [ ] **Step 3** — Optional live smoke (if you have an OpenCode server reachable; SKIP if no access)

```bash
# manually set settings: OPENCODE_URL=http://provider-amd.sisihome.org via env
OPENCODE_URL=http://provider-amd.sisihome.org pnpm --filter @designbridge/server dev &
sleep 4
# trigger a callProvider via temp test endpoint (skip if no temp endpoint exists yet)
kill %1
```

If you can't do a live smoke (no OpenCode server reachable), just confirm unit tests cover the routing logic.

- [ ] **Step 4** — Push

```bash
cd D:/Projects/_HomeProject/project-bridge
git push origin main
```

---

## Acceptance Criteria

- [ ] `provider.ts` + 2 adapters + `settings` + OpenAI OAuth all ported and pass type check
- [ ] `callProvider({mode, prompt, streaming?})` returns AsyncIterable<string>; tested with mock provider
- [ ] SSE keepalive helper writes `: heartbeat\n\n` every 15s, stops on res.end() or explicit stop
- [ ] All server tests pass (~42 total)
- [ ] All builds pass (new + legacy)
- [ ] api_key_* tables continue to work (no schema drift)
- [ ] Per-task commits, `feat(server)` convention

---

## Compiler Invariant (held)

> Provider routing is the only AI invocation surface. All AI calls go through `callProvider(...)`. The router decides primary/fallback based on `RoutePolicy` and `settings` table state. No service file calls `provider.streamContent` directly except `callProvider`.

---

## Risks / Notes

1. **ai-core Git URL**: legacy uses `pnpm` with Git URL deps. Confirm the URL still resolves; if not, blocker.
2. **provider.ts size**: ~500 lines. Subagent must port faithfully; if reads more than 2k lines of context, escalate.
3. **OAuth UI**: `routes/openaiOAuth.ts` is the API side. Client UI for "Connect to OpenAI" is in Plan 14.
4. **No vitest test for ai-core's actual streamContent**: we mock it. Real-world ai-core regression caught at runtime.
5. **callProvider mode prompt is M1 floor**: Plan 6 (chat SSE endpoint) will load actual skill bodies + memory snapshot into the system prompt; Plan 12 (council) will branch within callProvider's caller.

---

**Plan end. 8 Tasks. After this plan: any service can call `callProvider({mode, prompt})` and get streaming token output through routed providers with fallback.**
