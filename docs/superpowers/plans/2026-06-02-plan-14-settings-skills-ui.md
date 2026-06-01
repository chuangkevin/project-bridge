# Plan 14 — Settings + Skills UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** A `/settings` page where the user can manage Gemini API keys, OpenCode server endpoints, OpenAI OAuth connection, and view/upload skills. After this plan, the user can paste a Gemini key from the UI and have it picked up by the provider without restarting the server.

**Architecture:** A thin `GET/PUT/DELETE /api/settings/:key` REST endpoint with an allowlist of writable keys. The page is a tabbed UI: Providers / Skills / About. Each tab is a simple form. Provider tab posts to `/api/settings/:key` then calls `POST /api/provider/reload` (a tiny endpoint that runs `invalidateProvider()`). Skills tab uses existing `/api/projects/:id/skills` for project-scoped skills + a new `/api/skills/global` for global ones. Skill upload is a POST that writes a `.md` file to the global skills directory.

**Tech Stack:** No new deps. Reuses provider/settings infrastructure already ported in Plans 1-2 + skill registry from Plan 4.

**Spec:** [`../specs/2026-06-01-designbridge-redesign-design.md`](../specs/2026-06-01-designbridge-redesign-design.md) § 9 (settings + admin).

**Scope boundary (out of plan):** NO MCP server CRUD UI (existing routes work via direct REST, M2 adds form). NO plugin reload UI (devs only touch this). NO password change (M2). NO multi-user invites (single-tenant M1). NO key validation against live API (existing legacy code does this — copying is out of scope; M1 just stores).

---

## File Structure

```
packages/server/src/
  routes/
    settingsAdmin.ts          ← NEW: GET/PUT/DELETE settings + provider reload
    skillsAdmin.ts            ← NEW: GET global skills + POST upload global skill
    __tests__/
      settingsAdmin.route.test.ts
      skillsAdmin.route.test.ts
  index.ts                    ← MODIFY: mount routers

packages/client/src/
  pages/
    SettingsPage.tsx          ← NEW: tab container
    settings/
      ProvidersTab.tsx        ← Gemini keys + OpenCode servers + OAuth
      SkillsTab.tsx           ← list + upload + delete
      AboutTab.tsx            ← version, build info
  hooks/useSettings.ts        ← fetch + put + delete by key
  App.tsx                     ← MODIFY: add /settings route
  pages/workspace/TopBar.tsx  ← already has Link to /settings; verify it works
  styles/settings.css         ← form layout
```

---

## Task 1: Server — settingsAdmin route

**Files:**
- Create `packages/server/src/routes/settingsAdmin.ts`
- Create `packages/server/src/routes/__tests__/settingsAdmin.route.test.ts`
- Modify `packages/server/src/index.ts`

### settingsAdmin.ts

```typescript
import { Router, type Request, type Response } from 'express';
import type Database from 'better-sqlite3';
import { requireAuth } from '../middleware/auth.js';
import { readSetting, writeSetting, deleteSetting } from '../services/settings.js';
import { invalidateProvider } from '../services/provider.js';

const WRITABLE_KEYS = new Set([
  'gemini_api_keys',          // comma-separated
  'gemini_model',
  'opencode_url',              // legacy single
  'opencode_servers',          // JSON array
  'opencode_server_password',
  'openai_api_key',
  'openai_oauth_client_id',
  'public_base_url',
]);

const SECRET_KEYS = new Set([
  'gemini_api_keys',
  'opencode_server_password',
  'openai_api_key',
  'openai_oauth_access_token',
  'openai_oauth_refresh_token',
]);

function maskValue(key: string, value: string | null): string | null {
  if (!value) return null;
  if (!SECRET_KEYS.has(key)) return value;
  if (value.length <= 8) return '••••••••';
  return value.slice(0, 4) + '••••' + value.slice(-4);
}

export function buildSettingsAdminRouter(db: Database.Database): Router {
  const r = Router();
  r.use(requireAuth);

  r.get('/:key', (req: Request, res: Response) => {
    const key = req.params.key as string;
    if (!WRITABLE_KEYS.has(key) && !SECRET_KEYS.has(key)) {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'key 不允許讀取' } });
      return;
    }
    const value = readSetting(db, key);
    res.json({ key, value: maskValue(key, value), present: value !== null });
  });

  r.put('/:key', (req: Request, res: Response) => {
    const key = req.params.key as string;
    if (!WRITABLE_KEYS.has(key)) {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'key 不允許寫入' } });
      return;
    }
    const value = req.body?.value;
    if (typeof value !== 'string') {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: '需要 value 字串' } });
      return;
    }
    writeSetting(db, key, value);
    invalidateProvider();
    res.json({ ok: true });
  });

  r.delete('/:key', (req: Request, res: Response) => {
    const key = req.params.key as string;
    if (!WRITABLE_KEYS.has(key)) {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'key 不允許刪除' } });
      return;
    }
    deleteSetting(db, key);
    invalidateProvider();
    res.json({ ok: true });
  });

  r.post('/_reload-provider', (_req: Request, res: Response) => {
    invalidateProvider();
    res.json({ ok: true });
  });

  return r;
}
```

### Tests

- GET on writable key returns `{ value, present }` (masked for secrets)
- GET on disallowed key → 400
- PUT writes, present becomes true
- PUT secret key → response masked
- DELETE removes
- 401 without auth

### Wire in index.ts

```typescript
import { buildSettingsAdminRouter } from './routes/settingsAdmin.js';
app.use('/api/settings', buildSettingsAdminRouter(db));
```

- [ ] Implement + tests pass (target ~190)
- [ ] Commit: `feat(server): add /api/settings admin routes with secret masking (Plan 14 Task 1)`

---

## Task 2: Server — skillsAdmin route

**Files:**
- Create `packages/server/src/routes/skillsAdmin.ts`
- Create `packages/server/src/routes/__tests__/skillsAdmin.route.test.ts`
- Modify `packages/server/src/index.ts`

### skillsAdmin.ts

```typescript
import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { listSkills } from '../services/skillRegistry.js';
import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Global skills lifecycle.
 *
 * Reads/writes the `global` skill layer — files under `<skillsDir>/global/*.md`.
 * The skillRegistry already scans this directory on each call (no caching),
 * so writes take effect immediately without server restart.
 */
export function buildSkillsAdminRouter(skillsDir: string): Router {
  const r = Router();
  r.use(requireAuth);

  const globalDir = join(skillsDir, 'global');

  r.get('/global', (_req: Request, res: Response) => {
    const skills = listSkills({ projectId: null });
    res.json({ skills: skills.filter(s => s.scope === 'global') });
  });

  r.post('/global', (req: Request, res: Response) => {
    const { name, body } = req.body ?? {};
    if (typeof name !== 'string' || !/^[a-z0-9_-]{1,64}$/.test(name)) {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'name 須為 小寫字母/數字/dash/underscore，最長 64' } });
      return;
    }
    if (typeof body !== 'string' || !body.trim()) {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: '需要 body 字串' } });
      return;
    }
    mkdirSync(globalDir, { recursive: true });
    const path = join(globalDir, `${name}.md`);
    writeFileSync(path, body, 'utf8');
    res.status(201).json({ ok: true, name });
  });

  r.delete('/global/:name', (req: Request, res: Response) => {
    const name = req.params.name as string;
    if (!/^[a-z0-9_-]{1,64}$/.test(name)) {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'name 格式錯誤' } });
      return;
    }
    const path = join(globalDir, `${name}.md`);
    if (!existsSync(path)) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '技能不存在' } });
      return;
    }
    unlinkSync(path);
    res.json({ ok: true });
  });

  return r;
}
```

### Wire in index.ts

```typescript
import { buildSkillsAdminRouter } from './routes/skillsAdmin.js';
const skillsDir = process.env.SKILLS_DIR ?? join(deps.dataDir, 'skills');
app.use('/api/skills', buildSkillsAdminRouter(skillsDir));
```

(Plan 4's `skillRegistry` already reads from this layered directory — adjust path resolution to match what was built.)

### Tests

- GET /global with no skills → empty list
- POST /global with valid name+body → 201; GET shows it
- POST with bad name → 400
- DELETE existing → 200; subsequent GET excludes it
- DELETE missing → 404
- 401 without auth

- [ ] Implement + tests pass (target ~196)
- [ ] Commit: `feat(server): add /api/skills global CRUD route (Plan 14 Task 2)`

---

## Task 3: Client — useSettings hook + settings.css

**Files:**
- Create `packages/client/src/hooks/useSettings.ts`
- Create `packages/client/src/styles/settings.css`
- Modify `packages/client/src/main.tsx`

### useSettings.ts

```typescript
import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

export function useSetting(key: string): {
  value: string | null;
  present: boolean;
  loading: boolean;
  save: (v: string) => Promise<void>;
  remove: () => Promise<void>;
  refresh: () => Promise<void>;
} {
  const [value, setValue] = useState<string | null>(null);
  const [present, setPresent] = useState(false);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<{ value: string | null; present: boolean }>(`/api/settings/${encodeURIComponent(key)}`);
      setValue(r.value);
      setPresent(r.present);
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => { void refresh(); }, [refresh]);

  const save = useCallback(async (v: string) => {
    await api(`/api/settings/${encodeURIComponent(key)}`, { method: 'PUT', body: JSON.stringify({ value: v }) });
    await refresh();
  }, [key, refresh]);

  const remove = useCallback(async () => {
    await api(`/api/settings/${encodeURIComponent(key)}`, { method: 'DELETE' });
    await refresh();
  }, [key, refresh]);

  return { value, present, loading, save, remove, refresh };
}
```

### settings.css

```css
.settings {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg-root);
  color: var(--text-primary);
}
.settings__header {
  padding: var(--space-4) var(--space-6);
  border-bottom: 1px solid var(--border-subtle);
  background: var(--glass-bg);
  display: flex;
  align-items: center;
  gap: var(--space-4);
}
.settings__tabs {
  display: flex;
  gap: var(--space-1);
  padding: 0 var(--space-6);
  border-bottom: 1px solid var(--border-subtle);
}
.settings__tab {
  background: transparent;
  border: none;
  color: var(--text-muted);
  padding: var(--space-3) var(--space-4);
  font-size: 13px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
}
.settings__tab[aria-pressed="true"] {
  color: var(--text-accent);
  border-bottom-color: var(--accent);
}
.settings__body {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-6);
  max-width: 720px;
  width: 100%;
  margin: 0 auto;
}

.setting-row {
  margin-bottom: var(--space-5);
}
.setting-row label {
  display: block;
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: var(--space-2);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.setting-row__field {
  display: flex;
  gap: var(--space-2);
}
.setting-row input, .setting-row textarea {
  flex: 1;
  background: var(--bg-input);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  padding: var(--space-2) var(--space-3);
  font-size: 13px;
  font-family: inherit;
}
.setting-row input:focus, .setting-row textarea:focus { outline: none; border-color: var(--accent); }
.setting-row__help {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: var(--space-1);
}
.setting-row__btn {
  background: var(--accent);
  color: white;
  border: none;
  border-radius: var(--radius-sm);
  padding: var(--space-2) var(--space-4);
  font-size: 12px;
  cursor: pointer;
}
.setting-row__btn--danger {
  background: transparent;
  color: #fca5a5;
  border: 1px solid #7f1d1d;
}
.setting-row__masked {
  color: var(--text-muted);
  font-size: 12px;
  font-style: italic;
}

.skill-card {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  margin-bottom: var(--space-3);
  display: flex;
  flex-direction: column;
}
.skill-card__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-2);
}
.skill-card__name {
  font-weight: 600;
  font-size: 14px;
}
.skill-card__desc {
  color: var(--text-muted);
  font-size: 12px;
}

.skill-upload {
  background: var(--glass-bg);
  border: 1px dashed var(--border-accent);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  margin-bottom: var(--space-5);
}
.skill-upload textarea {
  width: 100%;
  background: var(--bg-input);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  padding: var(--space-3);
  font-family: monospace;
  font-size: 12px;
  min-height: 200px;
}
```

main.tsx: `import './styles/settings.css';`

- [ ] Implement
- [ ] Build passes
- [ ] Commit: `feat(client): add useSetting hook + settings.css (Plan 14 Task 3)`

---

## Task 4: Client — SettingsPage + tabs

**Files:**
- Create `packages/client/src/pages/SettingsPage.tsx`
- Create `packages/client/src/pages/settings/ProvidersTab.tsx`
- Create `packages/client/src/pages/settings/SkillsTab.tsx`
- Create `packages/client/src/pages/settings/AboutTab.tsx`
- Modify `packages/client/src/App.tsx`

### SettingsPage.tsx

```tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import ProvidersTab from './settings/ProvidersTab';
import SkillsTab from './settings/SkillsTab';
import AboutTab from './settings/AboutTab';

type Tab = 'providers' | 'skills' | 'about';

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('providers');
  return (
    <div className="settings">
      <header className="settings__header">
        <Link to="/projects" style={{ color: 'var(--text-muted)', fontSize: 13 }}>← 專案</Link>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>設定</h1>
      </header>
      <nav className="settings__tabs" role="tablist">
        <button className="settings__tab" aria-pressed={tab === 'providers'} onClick={() => setTab('providers')}>AI 供應商</button>
        <button className="settings__tab" aria-pressed={tab === 'skills'} onClick={() => setTab('skills')}>技能庫</button>
        <button className="settings__tab" aria-pressed={tab === 'about'} onClick={() => setTab('about')}>關於</button>
      </nav>
      <div className="settings__body">
        {tab === 'providers' && <ProvidersTab />}
        {tab === 'skills' && <SkillsTab />}
        {tab === 'about' && <AboutTab />}
      </div>
    </div>
  );
}
```

### ProvidersTab.tsx

```tsx
import { useState } from 'react';
import { useSetting } from '../../hooks/useSettings';
import { api } from '../../lib/api';

function Row({ keyName, label, help, secret, multiline }: { keyName: string; label: string; help?: string; secret?: boolean; multiline?: boolean }) {
  const { value, present, save, remove } = useSetting(keyName);
  const [draft, setDraft] = useState('');
  return (
    <div className="setting-row">
      <label>{label}</label>
      {present ? (
        <div className="setting-row__field" style={{ alignItems: 'center' }}>
          <span className="setting-row__masked">已設定：{secret ? value : (value ?? '')}</span>
          <button className="setting-row__btn setting-row__btn--danger" onClick={() => remove()}>清除</button>
        </div>
      ) : (
        <div className="setting-row__field">
          {multiline ? (
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={help} rows={3} />
          ) : (
            <input
              type={secret ? 'password' : 'text'}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={help}
            />
          )}
          <button className="setting-row__btn" onClick={async () => { await save(draft); setDraft(''); }}>儲存</button>
        </div>
      )}
      {help && !present && <div className="setting-row__help">{help}</div>}
    </div>
  );
}

export default function ProvidersTab() {
  const [oauthStatus, setOauthStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');

  const startOAuth = async () => {
    setOauthStatus('connecting');
    try {
      const { authorizeUrl } = await api<{ authorizeUrl: string }>('/api/openai-oauth/start', { method: 'POST', body: JSON.stringify({}) });
      const popup = window.open(authorizeUrl, '_blank', 'width=600,height=700');
      if (!popup) throw new Error('popup blocked');
      const handler = (ev: MessageEvent) => {
        if (ev.data?.source !== 'openai-oauth') return;
        window.removeEventListener('message', handler);
        if (ev.data.ok) setOauthStatus('connected');
        else setOauthStatus('error');
      };
      window.addEventListener('message', handler);
    } catch {
      setOauthStatus('error');
    }
  };

  return (
    <div>
      <h2 style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16 }}>Gemini</h2>
      <Row keyName="gemini_api_keys" label="Gemini API keys (逗號分隔)" help="若有多把 key，以逗號分隔。" secret multiline />
      <Row keyName="gemini_model" label="Gemini Model" help="預設 gemini-2.5-flash" />

      <h2 style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 32, marginBottom: 16 }}>OpenCode</h2>
      <Row keyName="opencode_servers" label="OpenCode servers (JSON array)" help='例：["http://opencode-1:4096","http://opencode-2:4096"]' multiline />
      <Row keyName="opencode_server_password" label="OpenCode 共用密碼" help="若所有 server 都用 Basic Auth，填這裡。" secret />

      <h2 style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 32, marginBottom: 16 }}>OpenAI</h2>
      <Row keyName="openai_api_key" label="OpenAI API key (備援)" help="不用 OAuth 時可直接填 key。" secret />
      <div className="setting-row">
        <label>OpenAI OAuth 授權</label>
        <div className="setting-row__field">
          <button className="setting-row__btn" onClick={startOAuth} disabled={oauthStatus === 'connecting'}>
            {oauthStatus === 'connecting' ? '連線中…' : oauthStatus === 'connected' ? '已連線 — 重新連線' : '連線 OpenAI'}
          </button>
        </div>
        <div className="setting-row__help">點擊後跳出 OpenAI 授權視窗（PKCE flow）。</div>
      </div>

      <h2 style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 32, marginBottom: 16 }}>服務</h2>
      <Row keyName="public_base_url" label="Public Base URL" help="正式環境一定要設，影響 OAuth callback。例：https://designbridge.example.com" />
    </div>
  );
}
```

### SkillsTab.tsx

```tsx
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

interface Skill { name: string; description: string; scope?: string; }

export default function SkillsTab() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const r = await api<{ skills: Skill[] }>('/api/skills/global');
      setSkills(r.skills);
    } catch (e) { setError((e as Error).message); }
  };
  useEffect(() => { void load(); }, []);

  const upload = async () => {
    setError(null);
    try {
      await api('/api/skills/global', { method: 'POST', body: JSON.stringify({ name, body }) });
      setName(''); setBody('');
      await load();
    } catch (e) { setError((e as Error).message); }
  };

  const remove = async (n: string) => {
    if (!confirm(`刪除技能 ${n}？`)) return;
    try {
      await api(`/api/skills/global/${encodeURIComponent(n)}`, { method: 'DELETE' });
      await load();
    } catch (e) { setError((e as Error).message); }
  };

  return (
    <div>
      <div className="skill-upload">
        <h3 style={{ margin: 0, fontSize: 14, marginBottom: 8 }}>新增全域技能</h3>
        <div className="setting-row" style={{ marginBottom: 8 }}>
          <input
            placeholder="skill name (lowercase-with-dashes)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-primary)', color: 'var(--text-primary)', padding: '6px 10px', borderRadius: 6, fontSize: 13 }}
          />
        </div>
        <textarea
          placeholder="---&#10;name: my-skill&#10;description: 一句話描述&#10;---&#10;&#10;技能內容…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
          <button className="setting-row__btn" onClick={upload} disabled={!name || !body}>上傳</button>
        </div>
      </div>

      {error && <div style={{ color: '#fca5a5', marginBottom: 16 }}>{error}</div>}

      <h3 style={{ fontSize: 14, color: 'var(--text-secondary)' }}>已安裝的全域技能</h3>
      {skills.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>尚未上傳任何全域技能</div>}
      {skills.map((s) => (
        <div key={s.name} className="skill-card">
          <div className="skill-card__head">
            <div className="skill-card__name">{s.name}</div>
            <button className="setting-row__btn setting-row__btn--danger" onClick={() => remove(s.name)}>刪除</button>
          </div>
          <div className="skill-card__desc">{s.description}</div>
        </div>
      ))}
    </div>
  );
}
```

### AboutTab.tsx

```tsx
export default function AboutTab() {
  return (
    <div style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.8 }}>
      <h3 style={{ color: 'var(--text-primary)', marginTop: 0 }}>DesignBridge M1</h3>
      <p>AI 設計顧問與多人協作平台</p>
      <p><strong>模式</strong>：顧問（諮詢）、架構（頁面流程）、設計（Vue + Tailwind）</p>
      <p><strong>合議</strong>：在顧問模式可開啟，由 PM／Designer／Engineer／Moderator 四個視角共同討論。</p>
      <p><strong>多人</strong>：同一專案網址可以多人同時打開，事件透過 Socket.io 即時同步。</p>
      <hr style={{ border: 'none', borderTop: '1px solid var(--border-subtle)', margin: '24px 0' }} />
      <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
        本機資料目錄 · SQLite + 檔案儲存 · 沒有外部資料庫依賴
      </p>
    </div>
  );
}
```

### App.tsx — add /settings route

```tsx
import SettingsPage from './pages/SettingsPage';

// in <Routes>, before catch-all:
<Route path="/settings" element={user ? <SettingsPage /> : <Navigate to="/login" />} />
```

- [ ] Implement
- [ ] Build passes
- [ ] Commit: `feat(client): add SettingsPage + Providers/Skills/About tabs (Plan 14 Task 4)`

---

## Task 5: Verify + push

- All 4 builds green
- Server tests ~196 (was 184 + ~6 settings + ~6 skills)
- Push

---

## Acceptance Criteria

- [ ] Settings PUT writes value, GET returns masked for secrets
- [ ] Provider reload invalidates the singleton — next AI call uses fresh credentials
- [ ] Skills POST writes `.md` to global directory; immediately visible via GET
- [ ] Skills DELETE removes the file
- [ ] SettingsPage tabs render all 3 tabs
- [ ] Providers tab: paste Gemini key → click 儲存 → AI calls in chat immediately work
- [ ] Skills tab: paste a markdown skill → upload → see in list → use via `/skill-name` in chat
- [ ] OpenAI OAuth button starts the existing PKCE flow
- [ ] all builds + tests + push clean

---

## Risks / Notes

1. **Masking is one-way**: once masked, the user can't see the original value. To re-enter, they must DELETE then PUT a new value. M2 could add an "edit existing" mode that takes a fresh value while showing the mask.
2. **Skills hot-reload**: relies on `skillRegistry.listSkills` doing a fresh fs scan each call (per Plan 4). If it caches, this plan breaks — must add a `refreshSkillCache()` call after writes. Verify by checking the Plan 4 implementation.
3. **No file upload via multipart**: skills are pasted as text. Drag-and-drop would be nice but is M2.
4. **OAuth popup blocking**: some browsers block popups not triggered by direct user click. The `onClick` is direct, so it should work, but on iOS Safari this can still fail. Document in About tab.
5. **`useAuthStore` access**: SkillsTab + ProvidersTab use the `api()` helper which already attaches the token; no extra wiring needed.

---

**Plan end. 5 Tasks. Settings + Skills UI live.**
