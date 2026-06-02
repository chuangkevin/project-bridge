# Plan 18 — Settings UI Parity (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Close the most painful M1 vs v1.5.1 gaps users hit in daily use. After this plan, the user can: configure Gemini keys with usage stats from the UI, manage multiple OpenCode servers with a test-connection button, manage MCP servers with full CRUD + test + view tools, sign in to OpenAI OAuth from the UI, manage other users (admin role + disable + transfer), batch-import/export Skills via file or directory, and reach Settings from the projects page. Also fixes the chat error-swallowing bug where the client clears error state before users see it.

**Architecture:** All backend infrastructure already exists from Plans 1-15 (auth, projects, settings, skills, MCP, provider, OAuth). This plan is **mostly client-side UI work** plus a few targeted server additions:

- **Server additions**:
  - `POST /api/settings/api-keys/batch` — parse textarea, filter `AIza` lines, insert N keys
  - `POST /api/settings/opencode/test` — try each server URL, return per-server `{ok, error}` array
  - `GET /api/settings/opencode/models` — proxy each server's `/v1/models` (or similar) endpoint
  - `POST /api/settings/api-keys/validate-key` — validate a single key without storing
  - `GET /api/settings/api-keys` — list with masked suffix + today/total call/token stats
  - `DELETE /api/settings/api-keys/:suffix` — remove by suffix
  - User management routes: `GET /api/users`, `POST /api/users`, `PATCH /api/users/:id/disable|enable`, `DELETE /api/users/:id`, `POST /api/users/transfer-admin`
  - Skills export: `GET /api/skills/global/export` (returns all + flat JSON for download)
  - Skills batch import (already exists from earlier work, verify)

- **Client work**: Rewrite SettingsPage to have **5 tabs** (was 3), each with full feature parity:
  1. **AI 供應商** — API keys table + OpenCode multi-server with test + OAuth helper download
  2. **MCP Servers** — full CRUD + test + view tools (was missing entirely)
  3. **技能庫** — current global skills + batch import from JSON + batch export + directory scan
  4. **使用者** — user list + add + disable/enable + transfer admin + delete (was missing entirely)
  5. **關於** — keep current

  Plus add a settings gear icon to **ProjectsPage** header so users can find Settings.

  Plus fix `useChatStream` so on error, the in-flight bubble stays visible and shows the error.

**Tech Stack:** No new deps. Reuses existing infrastructure.

**Spec source:** [`../V1.5.1-FEATURE-INVENTORY.md`](../V1.5.1-FEATURE-INVENTORY.md) §§ 5 (Settings) + 1 (Auth/Users) + 4 (Provider).

**Scope boundary (out of plan, deferred to plan 19+):**
- NO file upload with OCR / vision / document agent (plan 19)
- NO multi-page / variant / page regen (plan 20)
- NO annotation / API binding / component library (plan 21)
- NO export to React/Vue/Next/Nuxt/Figma (plan 22)
- NO architecture editing (plan 23)
- NO design preset library, global design page, platform shell (deferred)
- NO API key per-suffix usage GRAPH; we show today/total numbers but no time series
- NO cursor presence / element locking
- NO 4-person council overhaul (M1's PM/Designer/Engineer/Moderator stays, will revisit in plan 20)

---

## File Structure

```
packages/server/src/
  routes/
    apiKeys.ts                       ← NEW: Gemini key management (CRUD + stats + batch)
    opencodeAdmin.ts                 ← NEW: test + dynamic models
    users.ts                         ← NEW: full user CRUD
    skillsExport.ts                  ← NEW: GET /api/skills/global/export
    __tests__/
      apiKeys.route.test.ts
      opencodeAdmin.route.test.ts
      users.route.test.ts
      skillsExport.route.test.ts
  services/
    apiKeyStats.ts                   ← NEW: per-suffix today/total aggregation
    userService.ts                   ← NEW: createUser/listUsers/disableUser/transferAdmin
    skillImportExport.ts             ← NEW: export to JSON, import preview, batch upsert
  middleware/
    requireAdmin.ts                  ← NEW: gate user management endpoints
  index.ts                           ← MODIFY: mount new routes

packages/client/src/
  pages/
    SettingsPage.tsx                 ← REWRITE: tabbed layout (5 tabs)
    ProjectsPage.tsx                 ← MODIFY: add settings gear icon to header
    settings/
      ProvidersTab.tsx               ← REWRITE: API keys table + OpenCode multi-server + OAuth helper
      McpTab.tsx                     ← NEW: full CRUD UI
      SkillsTab.tsx                  ← REWRITE: directory scan + JSON import/export + batch action
      UsersTab.tsx                   ← NEW: full user management
      AboutTab.tsx                   ← keep
  hooks/
    useChatStream.ts                 ← MODIFY: don't auto-reset on error
    useApiKeys.ts                    ← NEW
    useOpencodeServers.ts            ← NEW
    useMcpServers.ts                 ← NEW
    useUsers.ts                      ← NEW
    useSkillsAdmin.ts                ← NEW (extend existing)
  pages/workspace/ConsultStage.tsx   ← MODIFY: leave reset behavior tied to phase==='done' only
  pages/workspace/ArchitectStage.tsx ← MODIFY: same
  pages/workspace/DesignStage.tsx    ← MODIFY: same
  lib/api.ts                         ← MODIFY: ensure errors carry { code, message } for UI
```

---

## Task 0 — Fix chat error swallowing (BLOCKER)

**Why first**: any user attempt to chat in production currently fails silently because providers aren't configured for the prod cluster (OPENCODE_URL points to dev workstation). Until users can SEE the error, they can't even know they need to go fix settings.

**Files:**
- Modify `packages/client/src/hooks/useChatStream.ts`
- Modify `packages/client/src/pages/workspace/{ConsultStage,ArchitectStage,DesignStage}.tsx`

### Change in useChatStream.ts

Add a new state field `lastFinalPhase: ChatPhase | null` that records the terminal phase. Existing logic already sets `state.phase = 'error'` or `'done'`, so we just need to make sure send() resolves with this info.

```typescript
// Existing send(): returns Promise<void>
// Change to: returns Promise<{ ok: boolean; phase: ChatPhase; error: string | null }>

const send = useCallback(async (params: SendParams) => {
  // ... existing setup ...

  try {
    // ... existing stream reading ...
    // After reader.read() loop finishes:
    return {
      ok: state.phase === 'done',  // ← but state is closure; use ref
      phase: ...,
      error: ...,
    };
  } catch (e) {
    setState((s) => ({ ...s, phase: 'error', error: (e as Error).message }));
    return { ok: false, phase: 'error', error: (e as Error).message };
  }
}, [...]);
```

Closure trap: the `state` captured in send() is stale. Solution: use a ref:

```typescript
const stateRef = useRef<ChatStreamState>(INITIAL);
// Sync ref with state on every state change:
useEffect(() => { stateRef.current = state; }, [state]);

// In send():
return {
  ok: stateRef.current.phase === 'done',
  phase: stateRef.current.phase,
  error: stateRef.current.error,
};
```

### Change in stage components

```typescript
// ConsultStage.tsx (and Architect/Design similarly):
const handleSend = async (text: string, attachmentIds: string[]) => {
  if (!projectId) return;
  pendingRef.current = text;
  const result = await send({ projectId, mode: 'consult', text, attachmentIds });
  if (result.ok) {
    // Success: refresh data, clear in-flight bubble
    await refresh();
    pendingRef.current = '';
    reset();
  }
  // On error: DO NOT reset() — keep state.phase === 'error' so PhaseIndicator
  // shows the error message. User clears it implicitly by sending again
  // (next send() call sets INITIAL).
};
```

### Tests

- Add a test to useChatStream's existing test file (if any) verifying send returns `{ok: false, phase: 'error'}` when fetch returns non-200.
- Manual smoke (described, not run): with no provider configured, click Send → see error message visible in PhaseIndicator (not blank empty state).

- [ ] Implement
- [ ] Build passes
- [ ] Commit: `fix(client): show chat errors instead of swallowing them via reset (Plan 18 Task 0)`

---

## Task 1 — Server: api-keys + opencode + users routes

**Files:**
- Create `packages/server/src/routes/apiKeys.ts`
- Create `packages/server/src/routes/opencodeAdmin.ts`
- Create `packages/server/src/routes/users.ts`
- Create `packages/server/src/middleware/requireAdmin.ts`
- Create `packages/server/src/services/apiKeyStats.ts`
- Create `packages/server/src/services/userService.ts`
- Tests for each

### requireAdmin middleware

The M1 schema doesn't have a `role` column on users. **Add a migration**:

```sql
-- packages/server/src/db/migrations/009_user_role.sql
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin','user'));
ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;

-- Mark the first user (lowest created_at) as admin
UPDATE users
SET role = 'admin'
WHERE id = (SELECT id FROM users ORDER BY created_at ASC LIMIT 1);
```

Then:

```typescript
// requireAdmin.ts
export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: { code: 'AUTH_REQUIRED' } });
  const row = db.prepare('SELECT role, is_active FROM users WHERE id = ?').get(req.user.id);
  if (!row || row.role !== 'admin' || !row.is_active) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: '需要管理員權限' } });
  }
  next();
}
```

### apiKeys.ts

```typescript
import { Router } from 'express';
import { readSetting, writeSetting } from '../services/settings.js';
import { requireAuth } from '../middleware/auth.js';
import { getApiKeyStats } from '../services/apiKeyStats.js';
import { invalidateProvider } from '../services/provider.js';

const KEY_REGEX = /^AIza[A-Za-z0-9_-]{30,}$/;

export function buildApiKeysRouter(db) {
  const r = Router();
  r.use(requireAuth);

  // GET /api/settings/api-keys
  r.get('/', (req, res) => {
    const stored = readSetting(db, 'gemini_api_keys') ?? '';
    const envKeys = (process.env.GEMINI_API_KEY ?? '').split(',').map(s => s.trim()).filter(Boolean);
    const storedKeys = stored.split(',').map(s => s.trim()).filter(Boolean);
    const all = [
      ...envKeys.map(k => ({ key: k, fromEnv: true })),
      ...storedKeys.map(k => ({ key: k, fromEnv: false })),
    ];
    const result = all.map(({ key, fromEnv }) => {
      const suffix = key.slice(-8);
      const stats = getApiKeyStats(db, suffix);
      return {
        suffix,
        fromEnv,
        today: stats.today,
        total: stats.total,
      };
    });
    res.json({ keys: result });
  });

  // POST /api/settings/api-keys (single)
  r.post('/', (req, res) => {
    const { apiKey } = req.body ?? {};
    if (!KEY_REGEX.test(apiKey)) {
      return res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'API key 格式錯誤' } });
    }
    const stored = readSetting(db, 'gemini_api_keys') ?? '';
    const existing = new Set(stored.split(',').filter(Boolean));
    if (existing.has(apiKey)) {
      return res.status(409).json({ error: { code: 'DUPLICATE', message: 'key 已存在' } });
    }
    existing.add(apiKey);
    writeSetting(db, 'gemini_api_keys', Array.from(existing).join(','));
    invalidateProvider();
    res.json({ ok: true });
  });

  // POST /api/settings/api-keys/batch
  r.post('/batch', (req, res) => {
    const { text } = req.body ?? {};
    if (typeof text !== 'string') {
      return res.status(400).json({ error: { code: 'VALIDATION_FAILED' } });
    }
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const found = lines.filter(l => KEY_REGEX.test(l));
    const skipped = lines.length - found.length;
    if (found.length === 0) {
      return res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: '沒有偵測到有效 key' } });
    }
    const stored = readSetting(db, 'gemini_api_keys') ?? '';
    const existing = new Set(stored.split(',').filter(Boolean));
    let added = 0;
    for (const k of found) {
      if (!existing.has(k)) { existing.add(k); added++; }
    }
    writeSetting(db, 'gemini_api_keys', Array.from(existing).join(','));
    invalidateProvider();
    res.json({ ok: true, added, skipped });
  });

  // DELETE /api/settings/api-keys/:suffix
  r.delete('/:suffix', (req, res) => {
    const suffix = req.params.suffix;
    const stored = readSetting(db, 'gemini_api_keys') ?? '';
    const keys = stored.split(',').filter(Boolean);
    const filtered = keys.filter(k => k.slice(-8) !== suffix);
    if (filtered.length === keys.length) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'key 不存在或來自 env' } });
    }
    writeSetting(db, 'gemini_api_keys', filtered.join(','));
    invalidateProvider();
    res.json({ ok: true });
  });

  return r;
}
```

### apiKeyStats.ts

```typescript
export function getApiKeyStats(db, suffix: string) {
  const today = (db.prepare(`
    SELECT COALESCE(SUM(prompt_tokens + completion_tokens), 0) as tokens,
           COUNT(*) as calls
    FROM api_key_usage
    WHERE api_key_suffix = ? AND date(created_at) = date('now')
  `).get(suffix)) as { tokens: number; calls: number };
  const total = (db.prepare(`
    SELECT COALESCE(SUM(prompt_tokens + completion_tokens), 0) as tokens,
           COUNT(*) as calls
    FROM api_key_usage
    WHERE api_key_suffix = ?
  `).get(suffix)) as { tokens: number; calls: number };
  return { today, total };
}
```

### opencodeAdmin.ts

```typescript
import { Router } from 'express';
import { readSetting, writeSetting } from '../services/settings.js';
import { requireAuth } from '../middleware/auth.js';

export function buildOpencodeAdminRouter(db) {
  const r = Router();
  r.use(requireAuth);

  function getServers(): string[] {
    const stored = readSetting(db, 'opencode_servers');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed.map(String);
      } catch {}
      return stored.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
    }
    const single = readSetting(db, 'opencode_url');
    if (single) return [single];
    const envServers = process.env.OPENCODE_SERVERS;
    if (envServers) return envServers.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
    const envSingle = process.env.OPENCODE_URL;
    if (envSingle) return [envSingle];
    return [];
  }

  // GET /api/settings/opencode
  r.get('/', (req, res) => {
    res.json({
      servers: getServers(),
      textModel: readSetting(db, 'opencode_text_model') ?? '',
      visionModel: readSetting(db, 'opencode_vision_model') ?? '',
    });
  });

  // POST /api/settings/opencode (save)
  r.post('/', (req, res) => {
    const { servers, textModel, visionModel } = req.body ?? {};
    if (Array.isArray(servers)) {
      writeSetting(db, 'opencode_servers', JSON.stringify(servers.filter(Boolean)));
    }
    if (typeof textModel === 'string') writeSetting(db, 'opencode_text_model', textModel);
    if (typeof visionModel === 'string') writeSetting(db, 'opencode_vision_model', visionModel);
    res.json({ ok: true });
  });

  // POST /api/settings/opencode/test
  r.post('/test', async (req, res) => {
    const servers = getServers();
    if (servers.length === 0) {
      return res.json({ ok: false, results: [], error: '尚未設定任何 OpenCode server' });
    }
    const password = readSetting(db, 'opencode_server_password') ?? process.env.OPENCODE_SERVER_PASSWORD ?? '';
    const results = await Promise.all(servers.map(async (url, i) => {
      const t0 = Date.now();
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (password) headers['Authorization'] = `Basic ${Buffer.from(`opencode:${password}`).toString('base64')}`;
        const resp = await fetch(`${url.replace(/\/+$/, '')}/v1/models`, {
          method: 'GET', headers, signal: AbortSignal.timeout(8000),
        });
        const ok = resp.ok;
        return {
          label: `server-${i + 1}`,
          url,
          ok,
          status: resp.status,
          elapsedMs: Date.now() - t0,
          error: ok ? null : `HTTP ${resp.status}`,
        };
      } catch (err) {
        return {
          label: `server-${i + 1}`,
          url,
          ok: false,
          elapsedMs: Date.now() - t0,
          error: (err as Error).message,
        };
      }
    }));
    const allOk = results.every(r => r.ok);
    res.json({ ok: allOk, results });
  });

  // GET /api/settings/opencode/models
  r.get('/models', async (req, res) => {
    const servers = getServers();
    if (servers.length === 0) return res.json({ models: [] });
    const password = readSetting(db, 'opencode_server_password') ?? process.env.OPENCODE_SERVER_PASSWORD ?? '';
    // Try first server only
    try {
      const headers: Record<string, string> = {};
      if (password) headers['Authorization'] = `Basic ${Buffer.from(`opencode:${password}`).toString('base64')}`;
      const resp = await fetch(`${servers[0].replace(/\/+$/, '')}/v1/models`, {
        method: 'GET', headers, signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok) return res.status(502).json({ error: { code: 'UPSTREAM_FAILED', message: `HTTP ${resp.status}` } });
      const data = await resp.json() as { data?: Array<{ id: string }> };
      const models = (data.data ?? []).map(m => ({ id: m.id, name: m.id, provider: 'opencode' }));
      res.json({ models });
    } catch (err) {
      res.status(502).json({ error: { code: 'UPSTREAM_FAILED', message: (err as Error).message } });
    }
  });

  return r;
}
```

### users.ts and userService.ts

```typescript
// services/userService.ts
export function createUserByAdmin(db, opts: { name: string; email: string; password: string }) {
  // similar to existing setup flow but doesn't require it's the FIRST user
  // bcrypt hash, INSERT with role='user' is_active=1
  // return user
}

export function listUsers(db) {
  return db.prepare(`
    SELECT id, name, email, role, is_active, created_at
    FROM users
    ORDER BY created_at ASC
  `).all();
}

export function disableUser(db, userId: string) {
  db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(userId);
  // also revoke sessions
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

export function enableUser(db, userId: string) {
  db.prepare('UPDATE users SET is_active = 1 WHERE id = ?').run(userId);
}

export function deleteUserById(db, userId: string, requesterId: string) {
  if (userId === requesterId) throw new Error('cannot delete self');
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
}

export function transferAdmin(db, fromUserId: string, toUserId: string) {
  const target = db.prepare('SELECT id, is_active FROM users WHERE id = ?').get(toUserId);
  if (!target || !target.is_active) throw new Error('target user not active');
  const txn = db.transaction(() => {
    db.prepare("UPDATE users SET role = 'user' WHERE id = ?").run(fromUserId);
    db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(toUserId);
  });
  txn();
}
```

```typescript
// routes/users.ts
export function buildUsersRouter(db) {
  const r = Router();

  // Public route: list users (for picker modals)
  r.get('/public', (req, res) => {
    const users = db.prepare(`SELECT id, name FROM users WHERE is_active = 1`).all();
    res.json({ users });
  });

  r.use(requireAuth);

  // Admin-only
  r.get('/', requireAdmin(db), (req, res) => {
    res.json({ users: listUsers(db) });
  });

  r.post('/', requireAdmin(db), (req, res) => {
    const { name, email, password } = req.body ?? {};
    if (!name || !email || !password) {
      return res.status(400).json({ error: { code: 'VALIDATION_FAILED' } });
    }
    try {
      const user = createUserByAdmin(db, { name, email, password });
      res.status(201).json({ user });
    } catch (e) {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: (e as Error).message } });
    }
  });

  r.patch('/:id/disable', requireAdmin(db), (req, res) => {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: '不能停用自己' } });
    }
    disableUser(db, req.params.id);
    res.json({ ok: true });
  });

  r.patch('/:id/enable', requireAdmin(db), (req, res) => {
    enableUser(db, req.params.id);
    res.json({ ok: true });
  });

  r.delete('/:id', requireAdmin(db), (req, res) => {
    try {
      deleteUserById(db, req.params.id, req.user.id);
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: (e as Error).message } });
    }
  });

  r.post('/transfer-admin', requireAdmin(db), (req, res) => {
    const { targetUserId } = req.body ?? {};
    if (!targetUserId || targetUserId === req.user.id) {
      return res.status(400).json({ error: { code: 'VALIDATION_FAILED' } });
    }
    try {
      transferAdmin(db, req.user.id, targetUserId);
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: (e as Error).message } });
    }
  });

  return r;
}
```

### Wire in index.ts

```typescript
import { buildApiKeysRouter } from './routes/apiKeys.js';
import { buildOpencodeAdminRouter } from './routes/opencodeAdmin.js';
import { buildUsersRouter } from './routes/users.js';

app.use('/api/settings/api-keys', buildApiKeysRouter(db));
app.use('/api/settings/opencode', buildOpencodeAdminRouter(db));
app.use('/api/users', buildUsersRouter(db));
```

### Tests

Each route needs supertest tests covering: 200 happy path, 400 validation, 401 auth, 403 non-admin, 404 not found.

- [ ] Implement migration 009 + 3 routes + 2 services + 1 middleware + tests
- [ ] All tests pass
- [ ] Commit: `feat(server): add api-keys/opencode/users admin routes + user roles (Plan 18 Task 1)`

---

## Task 2 — Server: Skills export endpoint

**Files:**
- Create `packages/server/src/routes/skillsExport.ts` OR extend existing skillsAdmin route
- Tests

```typescript
// GET /api/skills/global/export → { skills: [{name, body, frontmatter}, ...] }
r.get('/global/export', requireAuth, (req, res) => {
  const dir = join(deps.skillsDir, 'global');
  if (!existsSync(dir)) return res.json({ skills: [] });
  const files = readdirSync(dir).filter(f => f.endsWith('.md'));
  const skills = files.map(filename => {
    const raw = readFileSync(join(dir, filename), 'utf8');
    const parsed = matter(raw);
    return { filename, frontmatter: parsed.data, body: parsed.content };
  });
  res.json({ skills });
});
```

Batch import for global skills already exists. Add a directory-scan helper endpoint that mirrors what the client uploads after `showDirectoryPicker()`:

```typescript
// POST /api/skills/global/batch
// Body: { skills: [{ name, body, frontmatter }, ...] }
// Upsert into <skillsDir>/global/<name>.md
r.post('/global/batch', requireAuth, (req, res) => {
  const { skills } = req.body ?? {};
  if (!Array.isArray(skills)) return res.status(400).json({...});

  const dir = join(deps.skillsDir, 'global');
  mkdirSync(dir, { recursive: true });

  let added = 0, updated = 0;
  for (const s of skills) {
    if (!s.name || !/^[a-z0-9_-]{1,64}$/.test(s.name)) continue;
    const path = join(dir, `${s.name}.md`);
    const exists = existsSync(path);
    const content = s.frontmatter
      ? `---\n${Object.entries(s.frontmatter).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n')}\n---\n${s.body ?? ''}`
      : (s.body ?? '');
    writeFileSync(path, content, 'utf8');
    exists ? updated++ : added++;
  }
  res.json({ ok: true, added, updated });
});
```

- [ ] Implement + tests
- [ ] Commit: `feat(server): add skills global export + batch import (Plan 18 Task 2)`

---

## Task 3 — Client: SettingsPage 5-tab rewrite

**Files:**
- Rewrite `packages/client/src/pages/SettingsPage.tsx`
- Rewrite `packages/client/src/pages/settings/ProvidersTab.tsx`
- Create `packages/client/src/pages/settings/McpTab.tsx`
- Rewrite `packages/client/src/pages/settings/SkillsTab.tsx`
- Create `packages/client/src/pages/settings/UsersTab.tsx`

### SettingsPage.tsx

Tabs: `providers / mcp / skills / users / about`. Selected via URL hash or query, persisted in localStorage. Layout same as current (header + tab bar + body).

### ProvidersTab.tsx — combine API keys + OpenCode + OAuth

**API Keys section:**
- Table with columns: Key (`...XXXX`), Today calls, Today tokens, Total calls, Total tokens, ENV badge, Delete button
- "新增 API key" textarea (multi-line `AIza...`, auto-detect count)
- Submit button → POST `/api/settings/api-keys/batch`
- DELETE per row → `DELETE /api/settings/api-keys/:suffix`

**OpenCode section:**
- Multi-line server URLs textarea
- "測試連線" button → POST `/api/settings/opencode/test` → show per-server result (✓/✕ + label + URL + elapsedMs + error)
- textModel / visionModel dropdowns: combobox with `GET /api/settings/opencode/models` populated
- "重新載入模型列表" button
- "儲存" button → POST `/api/settings/opencode`

**OpenAI OAuth section:**
- Status indicator (連線中/已連結 + expiresAt)
- "連線 OpenAI" button (same as current Plan 14 implementation; popup + postMessage)
- "中斷連結" button (confirm dialog) → DELETE `/api/openai-oauth`
- Optionally: helper download buttons (`.js`, `.cmd`, `.sh`) — match v1.5.1 if PKCE flow requires helper script

### McpTab.tsx

The M1 server's mcp.ts route handles registration. Plan 14 didn't include UI. Build it now:

**List section:**
- Table columns: Name + transport / Endpoint + timeout / Status (enabled + last-test result) / Allowed tools / Actions (編輯/測試/列工具/刪除)

**Form section** (collapsed by default; expanded for add or edit):
- Name input
- Endpoint input
- Timeout (ms) input (default 15000)
- Allowed tools textarea (lines = tool names)
- "使用建議工具白名單" checkbox (only enabled if name === 'mssql-mcp'; auto-fills "get-table-schema\nlist-all-tables")
- "啟用此 MCP server" checkbox
- 儲存 / 取消 / 重設 buttons

**Actions:**
- 編輯: load row into form
- 測試: POST `/api/mcp/:id/test` → inline status badge
- 列工具: GET `/api/mcp/:id/tools` → inline list of `{name}, {description}`
- 刪除: confirm dialog → DELETE

Server-side MCP route (existing) should already support all these actions. Verify and add anything missing.

### SkillsTab.tsx — directory import + JSON import/export

**Operations row:**
- 「從目錄匯入」 button — uses `showDirectoryPicker()` (Chromium) or `<input type="file" webkitdirectory directory>` fallback
  - Scan files for `SKILL.md`
  - Parse frontmatter via gray-matter (client-side)
  - Show preview modal: table (filename / name / description / status新增/更新)
  - 確認 → POST `/api/skills/global/batch`
- 「📦 批次匯出」button → GET `/api/skills/global/export` → blob → download `skills-export-${YYYY-MM-DD}.json`
- 「📥 從 JSON 匯入」button → `<input type="file" accept=".json">` → validate → confirm → POST `/api/skills/global/batch`
- 「+ 新增技能」 button — existing single-skill form

**List section:** Current implementation OK, extend with checkbox column for batch actions, and a sticky bottom bar showing "啟用/停用/刪除 (N)" when selection > 0.

### UsersTab.tsx (NEW)

- Add user form: name + email + password + role(default user)
- User table: Name / Email / Role badge / Status / Created / Actions (轉移admin / 停用/啟用 / 刪除)
- Confirms for transfer/delete

Only renders if current user has admin role (check via `GET /api/users` — 403 means not admin → show "需要管理員權限" message).

- [ ] Implement all 5 tabs + page rewrite
- [ ] Build passes
- [ ] Commit: `feat(client): rewrite SettingsPage with 5 tabs (Providers/MCP/Skills/Users/About) (Plan 18 Task 3)`

---

## Task 4 — Client: settings entry from ProjectsPage + hooks

**Files:**
- Modify `packages/client/src/pages/ProjectsPage.tsx`
- Create `packages/client/src/hooks/{useApiKeys,useOpencodeServers,useMcpServers,useUsers}.ts`

### ProjectsPage header

Add a settings gear icon to the top-right corner:

```tsx
<button
  onClick={() => navigate('/settings')}
  className="..."
  aria-label="設定"
  title="設定"
>⚙</button>
```

Also pass `user.role` from useAuthStore so admins see additional admin-only quick links if needed.

### Hooks

Standard pattern: fetch + state + refresh. Sample for one:

```typescript
// useApiKeys.ts
export interface ApiKeyInfo {
  suffix: string;
  fromEnv: boolean;
  today: { calls: number; tokens: number };
  total: { calls: number; tokens: number };
}

export function useApiKeys() {
  const [keys, setKeys] = useState<ApiKeyInfo[]>([]);
  const refresh = useCallback(async () => {
    const r = await api<{ keys: ApiKeyInfo[] }>('/api/settings/api-keys');
    setKeys(r.keys);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const add = async (apiKey: string) => {
    await api('/api/settings/api-keys', { method: 'POST', body: JSON.stringify({ apiKey }) });
    await refresh();
  };
  const addBatch = async (text: string) => {
    const r = await api<{ added: number; skipped: number }>('/api/settings/api-keys/batch', { method: 'POST', body: JSON.stringify({ text }) });
    await refresh();
    return r;
  };
  const remove = async (suffix: string) => {
    await api(`/api/settings/api-keys/${suffix}`, { method: 'DELETE' });
    await refresh();
  };

  return { keys, refresh, add, addBatch, remove };
}
```

Similarly for OpenCode (servers list, save, test, models), MCP (CRUD + test + tools), Users (list + CRUD + role mgmt).

- [ ] Implement
- [ ] Build passes
- [ ] Commit: `feat(client): add settings entry on ProjectsPage + 4 admin hooks (Plan 18 Task 4)`

---

## Task 5 — Verify + push

- All 4 builds green
- Server tests target: ~217 + ~30 new = ~247
- Manual smoke (described only):
  - Go to /projects → see gear icon → click → /settings
  - Add a Gemini key via textarea → save → see in list with stats
  - Add an OpenCode server → click 測試 → see per-server result
  - Add an MCP server → click 測試 + 列工具 → see status + tools list
  - Import skills from a local directory → preview → confirm → see new skills in list
  - Export skills → file downloads
  - Add a second user → log in as them → cannot access /settings users tab without admin
  - On the original admin: transfer admin → original loses admin, second user gains
  - In a workspace, send chat with no provider → see error message in PhaseIndicator (NOT empty state)
- Push

---

## Acceptance Criteria

- [ ] Chat error visible in UI (not swallowed by reset)
- [ ] Migration 009 adds role + is_active columns; first user auto-promoted to admin
- [ ] API keys: list with stats, batch add via textarea, single add, delete by suffix, ENV badge correct
- [ ] OpenCode: multi-server textarea, test connection per-server, dynamic model dropdown
- [ ] MCP: full CRUD + test + view tools UI
- [ ] OpenAI OAuth: still works (no regression from Plan 14)
- [ ] Skills: directory scan import, JSON export, JSON import, batch actions toolbar
- [ ] Users: list + add + disable/enable + transfer admin + delete (admin-gated)
- [ ] /settings reachable via gear icon on ProjectsPage
- [ ] all builds + tests + push clean

---

## Risks / Notes

1. **`showDirectoryPicker()` browser support**: Chromium only. Fall back to `<input webkitdirectory>` (works on Chrome/Edge; Safari ignores → degrades to single-file picker, accept this for M1).
2. **Frontmatter parsing on client**: install `gray-matter` (already in server deps; need to add to client too) OR write a tiny regex-based extractor. Plan: add gray-matter to client (~20KB).
3. **Migration 009 backfill**: marks oldest user as admin. If multiple users existed before this migration (shouldn't in M1 fresh install, but might in dev), only the very first gets admin. Operators can transfer admin via UI afterward.
4. **OPENCODE_SERVER_PASSWORD**: existing setting already supported on the backend; expose in UI later (out of scope for this plan to keep scope contained — user adds via direct env var or future plan).
5. **Removing ENV-sourced keys**: not allowed (404 from delete endpoint). UI shows the ENV badge so users don't try.
6. **Self-disable / self-delete prevention**: server-side guard returns 400.
7. **Validation tests**: many edge cases — keep tests focused on happy path + 1 critical failure mode per endpoint, not exhaustive matrix.

---

**Plan end. 6 tasks (including Task 0). Closes the daily-use admin gap. Plans 19-23 fill the rest.**
