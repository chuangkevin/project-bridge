# Plan 8 — Client Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** A 4-area workspace shell at `/projects/:id` with mode switcher, left nav (turns/facts/skills), center stage (mode-specific area), right inspector. Dark glass theme tokens centralized; CSS responsive at 1280/1024/768 breakpoints. Plans 9/10/11 plug their UIs into the center stage. After this plan, navigating to a project shows the empty workspace with all 3 modes selectable (no AI calls yet).

**Architecture:** A single `WorkspacePage` component that hosts:
- Top bar: project name + mode switcher tabs (consult/architect/design) + settings link
- Left rail: collapsible — turns list (with mode badges), facts list, skills list
- Center stage: `<Outlet />` swapped by mode (Plan 9/10/11 fill these)
- Right inspector: turn detail / fact detail / skill detail panel (toggleable)

Mode is in URL: `/projects/:id?mode=consult`. zustand store `useWorkspaceStore` holds the current project + selected turn + collapsed-state flags. The chat input is shared bottom-of-stage across modes (Plan 9 builds it).

**Tech Stack:** React 18 + react-router-dom (already installed), zustand (already), CSS modules / plain CSS. No new deps.

**Spec:** [`../specs/2026-06-01-designbridge-redesign-design.md`](../specs/2026-06-01-designbridge-redesign-design.md) § 4 (workspace UI).

**Scope boundary (out of plan):** NO chat input box (Plan 9). NO actual mode rendering (Plans 9/10/11). NO Socket.io (Plan 13). NO settings page rebuild (Plan 14). This plan is purely the shell — empty mode panels show "Plan N will fill this".

---

## File Structure

```
packages/client/src/
  pages/
    WorkspacePage.tsx                ← 4-area layout shell
    workspace/
      TopBar.tsx                     ← project name + mode tabs + user menu
      LeftRail.tsx                   ← turns / facts / skills nav
      RightInspector.tsx             ← detail panel (turn / fact / skill)
      ConsultStage.tsx               ← placeholder, "Plan 9 fills this"
      ArchitectStage.tsx             ← placeholder, "Plan 10 fills this"
      DesignStage.tsx                ← placeholder, "Plan 11 fills this"
  stores/
    useWorkspaceStore.ts             ← currentProject, selectedTurnId, selectedFactId, collapsed flags
  styles/
    theme.css                        ← MODIFY: add layout tokens (spacing scale, breakpoints in comments)
    workspace.css                    ← NEW: 4-area grid layout + glass surface utilities
  App.tsx                            ← MODIFY: add /projects/:id route → WorkspacePage
```

---

## Task 1: theme.css extension + workspace.css

**Files:**
- Modify `packages/client/src/styles/theme.css`
- Create `packages/client/src/styles/workspace.css`
- Modify `packages/client/src/main.tsx` to import `workspace.css`

### theme.css additions

Append to existing `:root` block:
```css
  /* Spacing scale */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --space-8: 48px;

  /* Radii */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --radius-xl: 20px;

  /* Glass surfaces */
  --glass-bg: rgba(15, 23, 42, 0.72);
  --glass-border: rgba(255, 255, 255, 0.06);
  --glass-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);

  /* Z layers */
  --z-rail: 10;
  --z-topbar: 20;
  --z-modal: 50;
```

### workspace.css (new)

```css
.workspace {
  display: grid;
  grid-template-areas:
    "top top top"
    "left center right";
  grid-template-rows: 56px 1fr;
  grid-template-columns: 240px 1fr 320px;
  height: 100vh;
  background: var(--bg-root);
  color: var(--text-primary);
}

.workspace__top {
  grid-area: top;
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: 0 var(--space-5);
  border-bottom: 1px solid var(--border-subtle);
  background: var(--glass-bg);
  backdrop-filter: blur(20px);
  z-index: var(--z-topbar);
}

.workspace__left {
  grid-area: left;
  border-right: 1px solid var(--border-subtle);
  background: var(--bg-card);
  overflow-y: auto;
  z-index: var(--z-rail);
}

.workspace__center {
  grid-area: center;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: var(--bg-root);
}

.workspace__right {
  grid-area: right;
  border-left: 1px solid var(--border-subtle);
  background: var(--bg-card);
  overflow-y: auto;
}

.workspace__right[data-collapsed="true"] {
  display: none;
}

.mode-tabs { display: flex; gap: var(--space-1); }
.mode-tabs button {
  background: transparent;
  border: 1px solid transparent;
  color: var(--text-muted);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  font-size: 13px;
  cursor: pointer;
}
.mode-tabs button[aria-pressed="true"] {
  background: var(--accent-glass);
  color: var(--text-accent);
  border-color: var(--border-accent);
}

.glass-card {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  box-shadow: var(--glass-shadow);
}

.rail-section { padding: var(--space-3) var(--space-4); }
.rail-section h3 {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  margin: 0 0 var(--space-2);
}
.rail-item {
  display: block;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
}
.rail-item:hover { background: var(--bg-elevated); }
.rail-item[aria-selected="true"] { background: var(--accent-glass); color: var(--text-accent); }

.mode-badge {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  margin-right: var(--space-2);
}
.mode-badge[data-mode="consult"]   { background: rgba(124, 92, 191, 0.25); color: #c4b5fd; }
.mode-badge[data-mode="architect"] { background: rgba(56, 189, 248, 0.20); color: #7dd3fc; }
.mode-badge[data-mode="design"]    { background: rgba(244, 114, 182, 0.20); color: #f9a8d4; }

/* RWD */
@media (max-width: 1280px) {
  .workspace { grid-template-columns: 200px 1fr 280px; }
}
@media (max-width: 1024px) {
  .workspace { grid-template-columns: 180px 1fr; }
  .workspace__right { display: none; }
}
@media (max-width: 768px) {
  .workspace {
    grid-template-areas: "top" "center";
    grid-template-columns: 1fr;
    grid-template-rows: 56px 1fr;
  }
  .workspace__left { display: none; }
  .workspace.workspace--rail-open .workspace__left {
    display: block;
    position: fixed;
    top: 56px; left: 0; bottom: 0;
    width: 80vw; max-width: 320px;
    z-index: var(--z-modal);
    box-shadow: var(--glass-shadow);
  }
}
```

### main.tsx

Add `import './styles/workspace.css';` after the existing theme import.

- [ ] Modify theme.css, create workspace.css, update main.tsx
- [ ] Run `pnpm --filter @designbridge/client build` — passes
- [ ] Commit: `feat(client): add layout tokens + workspace.css glass shell (Plan 8 Task 1)`

---

## Task 2: useWorkspaceStore

**Files:**
- Create `packages/client/src/stores/useWorkspaceStore.ts`

```typescript
import { create } from 'zustand';

export type Mode = 'consult' | 'architect' | 'design';

interface WorkspaceState {
  projectId: string | null;
  mode: Mode;
  selectedTurnId: string | null;
  selectedFactId: string | null;
  selectedSkillName: string | null;
  rightCollapsed: boolean;
  mobileRailOpen: boolean;

  setProject: (id: string) => void;
  setMode: (m: Mode) => void;
  selectTurn: (id: string | null) => void;
  selectFact: (id: string | null) => void;
  selectSkill: (name: string | null) => void;
  toggleRight: () => void;
  setMobileRailOpen: (v: boolean) => void;
  reset: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  projectId: null,
  mode: 'consult',
  selectedTurnId: null,
  selectedFactId: null,
  selectedSkillName: null,
  rightCollapsed: false,
  mobileRailOpen: false,

  setProject: (id) => set({ projectId: id, selectedTurnId: null, selectedFactId: null, selectedSkillName: null }),
  setMode: (m) => set({ mode: m }),
  selectTurn: (id) => set({ selectedTurnId: id, selectedFactId: null, selectedSkillName: null }),
  selectFact: (id) => set({ selectedFactId: id, selectedTurnId: null, selectedSkillName: null }),
  selectSkill: (name) => set({ selectedSkillName: name, selectedTurnId: null, selectedFactId: null }),
  toggleRight: () => set((s) => ({ rightCollapsed: !s.rightCollapsed })),
  setMobileRailOpen: (v) => set({ mobileRailOpen: v }),
  reset: () => set({
    projectId: null, selectedTurnId: null, selectedFactId: null, selectedSkillName: null,
    rightCollapsed: false, mobileRailOpen: false,
  }),
}));
```

- [ ] Create the store
- [ ] Commit: `feat(client): add useWorkspaceStore (Plan 8 Task 2)`

---

## Task 3: TopBar + LeftRail + RightInspector + mode stages

**Files:**
- Create `packages/client/src/pages/workspace/TopBar.tsx`
- Create `packages/client/src/pages/workspace/LeftRail.tsx`
- Create `packages/client/src/pages/workspace/RightInspector.tsx`
- Create `packages/client/src/pages/workspace/ConsultStage.tsx`
- Create `packages/client/src/pages/workspace/ArchitectStage.tsx`
- Create `packages/client/src/pages/workspace/DesignStage.tsx`

### TopBar.tsx

```tsx
import { Link, useNavigate } from 'react-router-dom';
import { useWorkspaceStore, type Mode } from '../../stores/useWorkspaceStore';
import { useAuthStore } from '../../stores/useAuthStore';

const MODE_LABELS: Record<Mode, string> = {
  consult: '顧問',
  architect: '架構',
  design: '設計',
};

export default function TopBar({ projectName }: { projectName: string }) {
  const { mode, setMode, setMobileRailOpen } = useWorkspaceStore();
  const { logout } = useAuthStore();
  const nav = useNavigate();

  return (
    <header className="workspace__top">
      <button
        aria-label="開啟側欄"
        onClick={() => setMobileRailOpen(true)}
        style={{
          background: 'transparent', border: 'none', color: 'var(--text-secondary)',
          padding: 'var(--space-2)', cursor: 'pointer', fontSize: 18,
        }}
      >☰</button>
      <Link to="/projects" style={{ color: 'var(--text-muted)', fontSize: 13 }}>← 專案</Link>
      <div style={{ fontWeight: 600, fontSize: 15 }}>{projectName}</div>
      <div className="mode-tabs" role="tablist" aria-label="模式">
        {(['consult', 'architect', 'design'] as Mode[]).map((m) => (
          <button
            key={m}
            role="tab"
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
          >{MODE_LABELS[m]}</button>
        ))}
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--space-3)' }}>
        <Link to="/settings" style={{ color: 'var(--text-muted)', fontSize: 13 }}>設定</Link>
        <button
          onClick={async () => { await logout(); nav('/login'); }}
          style={{
            background: 'transparent', border: '1px solid var(--border-primary)',
            color: 'var(--text-secondary)', padding: '4px 10px',
            borderRadius: 'var(--radius-sm)', fontSize: 12, cursor: 'pointer',
          }}
        >登出</button>
      </div>
    </header>
  );
}
```

### LeftRail.tsx

Shows three sections: turns (with mode badges), facts, skills. Data comes from `/api/projects/:id/turns`, `/api/projects/:id/facts`, `/api/projects/:id/skills`. Use `useEffect` + `api` directly (no dedicated store needed for read-only lists in M1).

```tsx
import { useEffect, useState } from 'react';
import { useWorkspaceStore } from '../../stores/useWorkspaceStore';
import { api } from '../../lib/api';

interface Turn { id: string; mode: 'consult'|'architect'|'design'; userText: string; createdAt: string; }
interface Fact { id: string; kind: string; text: string; }
interface Skill { name: string; description: string; }

export default function LeftRail() {
  const { projectId, selectedTurnId, selectedFactId, selectedSkillName, selectTurn, selectFact, selectSkill, mobileRailOpen, setMobileRailOpen } = useWorkspaceStore();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [facts, setFacts] = useState<Fact[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);

  useEffect(() => {
    if (!projectId) return;
    api<{ turns: Turn[] }>(`/api/projects/${projectId}/turns`).then(r => setTurns(r.turns)).catch(() => {});
    api<{ facts: Fact[] }>(`/api/projects/${projectId}/facts`).then(r => setFacts(r.facts)).catch(() => {});
    api<{ skills: Skill[] }>(`/api/projects/${projectId}/skills`).then(r => setSkills(r.skills)).catch(() => {});
  }, [projectId]);

  return (
    <aside className="workspace__left" onClick={(e) => { if (mobileRailOpen && e.target === e.currentTarget) setMobileRailOpen(false); }}>
      <div className="rail-section">
        <h3>對話</h3>
        {turns.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>還沒有對話</div>}
        {turns.map(t => (
          <div
            key={t.id}
            className="rail-item"
            aria-selected={selectedTurnId === t.id}
            onClick={() => selectTurn(t.id)}
          >
            <span className="mode-badge" data-mode={t.mode}>{t.mode}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block', maxWidth: '85%', verticalAlign: 'middle' }}>
              {t.userText}
            </span>
          </div>
        ))}
      </div>

      <div className="rail-section">
        <h3>已知事實</h3>
        {facts.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>還沒有記下事實</div>}
        {facts.map(f => (
          <div
            key={f.id}
            className="rail-item"
            aria-selected={selectedFactId === f.id}
            onClick={() => selectFact(f.id)}
            title={f.text}
          >
            <span style={{ color: 'var(--text-muted)', fontSize: 11, marginRight: 6 }}>[{f.kind}]</span>
            {f.text.slice(0, 40)}{f.text.length > 40 ? '…' : ''}
          </div>
        ))}
      </div>

      <div className="rail-section">
        <h3>技能</h3>
        {skills.map(s => (
          <div
            key={s.name}
            className="rail-item"
            aria-selected={selectedSkillName === s.name}
            onClick={() => selectSkill(s.name)}
            title={s.description}
          >
            {s.name}
          </div>
        ))}
      </div>
    </aside>
  );
}
```

### RightInspector.tsx

Shows detail of whatever is selected. Empty state otherwise.

```tsx
import { useEffect, useState } from 'react';
import { useWorkspaceStore } from '../../stores/useWorkspaceStore';
import { api } from '../../lib/api';

export default function RightInspector() {
  const { projectId, selectedTurnId, selectedFactId, selectedSkillName, rightCollapsed, toggleRight } = useWorkspaceStore();
  const [detail, setDetail] = useState<unknown>(null);

  useEffect(() => {
    setDetail(null);
    if (!projectId) return;
    if (selectedTurnId) {
      api(`/api/projects/${projectId}/turns/${selectedTurnId}`).then(setDetail).catch(() => {});
    } else if (selectedFactId) {
      api(`/api/projects/${projectId}/facts/${selectedFactId}`).then(setDetail).catch(() => {});
    } else if (selectedSkillName) {
      api(`/api/projects/${projectId}/skills/${selectedSkillName}`).then(setDetail).catch(() => {});
    }
  }, [projectId, selectedTurnId, selectedFactId, selectedSkillName]);

  return (
    <aside className="workspace__right" data-collapsed={rightCollapsed}>
      <div style={{ padding: 'var(--space-4)' }}>
        <button
          onClick={toggleRight}
          style={{ float: 'right', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
          aria-label="收合"
        >×</button>
        {!selectedTurnId && !selectedFactId && !selectedSkillName && (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            從左側選擇對話、事實或技能查看詳情。
          </div>
        )}
        {detail !== null && (
          <pre style={{
            background: 'var(--bg-elevated)', padding: 'var(--space-3)',
            borderRadius: 'var(--radius-md)', fontSize: 11, overflow: 'auto', maxHeight: '80vh',
            color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>{JSON.stringify(detail, null, 2)}</pre>
        )}
      </div>
    </aside>
  );
}
```

### Stage placeholders

`ConsultStage.tsx`:
```tsx
export default function ConsultStage() {
  return (
    <div style={{ padding: 'var(--space-6)', color: 'var(--text-muted)' }}>
      <h2 style={{ color: 'var(--text-primary)', margin: 0 }}>顧問模式</h2>
      <p>Plan 9 會在這裡放對話介面。</p>
    </div>
  );
}
```

`ArchitectStage.tsx`:
```tsx
export default function ArchitectStage() {
  return (
    <div style={{ padding: 'var(--space-6)', color: 'var(--text-muted)' }}>
      <h2 style={{ color: 'var(--text-primary)', margin: 0 }}>架構模式</h2>
      <p>Plan 10 會在這裡放頁面流程圖。</p>
    </div>
  );
}
```

`DesignStage.tsx`:
```tsx
export default function DesignStage() {
  return (
    <div style={{ padding: 'var(--space-6)', color: 'var(--text-muted)' }}>
      <h2 style={{ color: 'var(--text-primary)', margin: 0 }}>設計模式</h2>
      <p>Plan 11 會在這裡放 Vue SFC 預覽。</p>
    </div>
  );
}
```

- [ ] Create all 6 files
- [ ] Build passes
- [ ] Commit: `feat(client): add workspace TopBar/LeftRail/RightInspector + mode stages (Plan 8 Task 3)`

---

## Task 4: WorkspacePage + route

**Files:**
- Create `packages/client/src/pages/WorkspacePage.tsx`
- Modify `packages/client/src/App.tsx`

### WorkspacePage.tsx

```tsx
import { useEffect, useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useWorkspaceStore } from '../stores/useWorkspaceStore';
import TopBar from './workspace/TopBar';
import LeftRail from './workspace/LeftRail';
import RightInspector from './workspace/RightInspector';
import ConsultStage from './workspace/ConsultStage';
import ArchitectStage from './workspace/ArchitectStage';
import DesignStage from './workspace/DesignStage';

interface Project { id: string; name: string; }

export default function WorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const { mode, setProject, mobileRailOpen } = useWorkspaceStore();
  const [project, setProject_] = useState<Project | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    setProject(id);
    api<Project>(`/api/projects/${id}`)
      .then(setProject_)
      .catch((e) => { if (e?.status === 404) setNotFound(true); });
  }, [id, setProject]);

  if (notFound) return <Navigate to="/projects" replace />;
  if (!project) return <div style={{ padding: 24 }}>載入專案中…</div>;

  return (
    <div className={`workspace${mobileRailOpen ? ' workspace--rail-open' : ''}`}>
      <TopBar projectName={project.name} />
      <LeftRail />
      <main className="workspace__center">
        {mode === 'consult' && <ConsultStage />}
        {mode === 'architect' && <ArchitectStage />}
        {mode === 'design' && <DesignStage />}
      </main>
      <RightInspector />
    </div>
  );
}
```

### App.tsx — add route

```tsx
// import:
import WorkspacePage from './pages/WorkspacePage';

// in <Routes>, add BEFORE the catch-all '*':
<Route path="/projects/:id" element={user ? <WorkspacePage /> : <Navigate to="/login" />} />
```

- [ ] Wire route + WorkspacePage
- [ ] In ProjectsPage, change project list rows to be clickable: `onClick={() => navigate(`/projects/${p.id}`)}` (if not already)
- [ ] Build passes
- [ ] Commit: `feat(client): add WorkspacePage shell at /projects/:id (Plan 8 Task 4)`

---

## Task 5: Verify + push

- All 4 builds green (`@designbridge/client`, `@designbridge/server`, legacy/client, legacy/server)
- Server test count unchanged (~157)
- Manual smoke (just describe — don't run): visit `/projects/:id`, verify 4 areas show on desktop, ≤1024px hides right inspector, ≤768px collapses left into hamburger
- Push

---

## Acceptance Criteria

- [ ] theme.css extended with spacing/radius/glass tokens
- [ ] workspace.css has 4-area grid + 3 responsive breakpoints
- [ ] useWorkspaceStore has all 9 state slots + actions
- [ ] TopBar shows mode tabs and updates store
- [ ] LeftRail fetches and displays turns/facts/skills with mode badges
- [ ] RightInspector shows JSON dump of selected item (M1 minimum — Plan 14 prettifies)
- [ ] WorkspacePage routes mode → correct stage
- [ ] 404 on missing project redirects to /projects
- [ ] all 4 builds green + push

---

## Risks / Notes

1. **Read-only lists**: M1 LeftRail just fetches once per project. Plan 13 will add Socket.io live refresh. No need for refetch-on-focus or polling in M1.
2. **Skill endpoint shape**: skill list endpoint returns `{skills: Skill[]}` per Plan 4. If field names differ slightly (`name` vs `id`), adapt the type — don't change the server.
3. **Right inspector JSON dump**: intentional. M2 will prettify per kind. Spec § 4 acknowledges this.
4. **No `useAuthStore.logout` yet?**: if logout isn't a method on the store, add it: `logout: async () => { await api('/api/auth/logout', { method: 'POST' }); set({ user: null, token: null }); localStorage.removeItem('token'); }`. Check current `useAuthStore.ts` before assuming.
5. **api `ApiError.status`**: if the `api()` helper throws something without a `status` field, the 404 branch in WorkspacePage won't work. Inspect `lib/api.ts` and adapt the catch.

---

**Plan end. 5 Tasks. Workspace shell ready for Plans 9/10/11 to fill stages.**
