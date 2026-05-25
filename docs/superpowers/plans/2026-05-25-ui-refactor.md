# UI 重構實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將 DesignBridge Workspace 重構為深色玻璃擬態主題 + Context Panel 架構，同時拆解 2900 行 WorkspacePage 與 2444 行 ChatPanel 為職責單一的元件。

**Architecture:** 三階段執行：Phase 1 純視覺（theme-dark.css + CSS variables），Phase 2 結構重組（ModeRail + ContextPanel + 三個子 Panel），Phase 3 PreviewArea 抽離與收尾。所有模式共享同一份 `messages[]` state，ChatPanel 改名為 ConsultantContextPanel，Design/Arch 模式底部保留 compact chat input。

**Tech Stack:** React 18, TypeScript, Vite, CSS variables（無 CSS Modules / Tailwind），E2E via Playwright（`pnpm test:e2e:smoke`）

**Spec:** `docs/superpowers/specs/2026-05-25-ui-refactor-design.md`

---

## 對比度規則（全程強制）

- 深色底 → 文字最低 `#94a3b8`，標題用 `#f1f5f9`
- Accent 按鈕 → 永遠 `#ffffff` 純白字
- Glass panel → 白字（`#f1f5f9`+）
- **禁止**：淺底 + 淺字任意組合

---

## Phase 1：主題系統（視覺升級）

> 不動元件結構，只改視覺。最低風險，可獨立上線。

---

### Task 1：建立 theme-dark.css

**Files:**
- Create: `packages/client/src/styles/theme-dark.css`

- [ ] **Step 1：建立檔案**

```css
/* packages/client/src/styles/theme-dark.css */
/* 深色玻璃主題 CSS tokens — 覆蓋 theme.css 的 light 預設 */

:root {
  /* 背景層 */
  --bg-root:      #060d1a;
  --bg-primary:   #0f172a;
  --bg-secondary: #0f172a;
  --bg-elevated:  #1e293b;
  --bg-card:      #1e293b;
  --bg-input:     #334155;
  --bg-hover:     #334155;

  /* 品牌 / Accent */
  --accent:            #7c5cbf;
  --accent-light:      rgba(124, 92, 191, 0.22);
  --accent-glass:      rgba(124, 92, 191, 0.22);
  --accent-subtle:     rgba(192, 132, 252, 0.15);
  --accent-grad-start: #7c5cbf;
  --accent-grad-end:   #c084fc;

  /* 文字層（深色底，最低下限 #94a3b8） */
  --text-primary:   #f1f5f9;
  --text-secondary: #cbd5e1;
  --text-muted:     #94a3b8;
  --text-accent:    #e9d5ff;

  /* 邊框 */
  --border-primary:    #334155;
  --border-secondary:  #475569;
  --border-subtle:     #1e293b;
  --border-accent:     rgba(192, 132, 252, 0.3);
  --border-accent-hi:  rgba(192, 132, 252, 0.5);

  /* 陰影 */
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.4);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.5);
  --shadow-lg: 0 8px 32px rgba(0, 0, 0, 0.5);

  /* Glass 效果 */
  --glass-context:  rgba(20, 30, 50, 0.75);
  --glass-active:   rgba(124, 92, 191, 0.25);
  --glass-floating: rgba(15, 23, 42, 0.90);
  --glass-blur-sm:  blur(8px);
  --glass-blur-md:  blur(16px);
  --glass-blur-lg:  blur(20px);
}

/* 深色主題下強制 body 背景 */
body {
  background: var(--bg-root);
  color: var(--text-primary);
}

/* Scrollbar 深色樣式 */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: var(--bg-primary); }
::-webkit-scrollbar-thumb { background: #475569; border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: #64748b; }
```

- [ ] **Step 2：在 main.tsx import**

開啟 `packages/client/src/main.tsx`，在現有 `import './styles/theme.css'` **之後**加一行：

```typescript
import './styles/theme.css';
import './styles/theme-dark.css';  // ← 新增
```

- [ ] **Step 3：啟動開發伺服器驗證**

```bash
pnpm dev:server   # 背景執行
pnpm dev:client
```

瀏覽器開 `http://localhost:5173`，確認頁面背景變深色（#0f172a）。

- [ ] **Step 4：Commit**

```bash
git add packages/client/src/styles/theme-dark.css packages/client/src/main.tsx
git commit -m "feat(theme): add theme-dark.css — dark glass CSS tokens"
```

---

### Task 2：WorkspacePage 根容器套用深色主題

**Files:**
- Modify: `packages/client/src/pages/WorkspacePage.tsx`（styles 物件，約 2050–2900 行）

- [ ] **Step 1：更新 `styles.container`**

找到 `styles` 物件中的 `container`（約 2040 行附近），改為：

```typescript
container: {
  display: 'flex',
  flexDirection: 'column' as const,
  height: '100vh',
  overflow: 'hidden',
  backgroundColor: 'var(--bg-root)',
  color: 'var(--text-primary)',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
},
```

- [ ] **Step 2：更新 `styles.header`**

找到 `styles.header`，改為：

```typescript
header: {
  display: 'flex',
  alignItems: 'center',
  padding: '0 16px',
  height: '44px',
  borderBottom: '1px solid var(--border-primary)',
  backgroundColor: 'var(--bg-primary)',
  gap: '8px',
  flexShrink: 0,
  zIndex: 100,
},
```

- [ ] **Step 3：更新 `styles.body`**

```typescript
body: {
  display: 'flex',
  flex: 1,
  overflow: 'hidden',
  backgroundColor: 'var(--bg-root)',
},
```

- [ ] **Step 4：更新 `styles.chatPane`**

```typescript
chatPane: {
  width: '350px',
  flexShrink: 0,
  borderRight: '1px solid var(--border-primary)',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  backgroundColor: 'var(--glass-context)',
  backdropFilter: 'var(--glass-blur-md)',
},
```

- [ ] **Step 5：更新 `styles.tabBar`**

```typescript
tabBar: {
  display: 'flex',
  borderBottom: '1px solid var(--border-primary)',
  backgroundColor: 'var(--bg-primary)',
  flexShrink: 0,
},
```

- [ ] **Step 6：更新 `styles.tabBtn` 與 `styles.tabBtnActive`**

```typescript
tabBtn: {
  flex: 1,
  padding: '8px 0',
  border: 'none',
  borderBottom: '2px solid transparent',
  backgroundColor: 'transparent',
  color: 'var(--text-muted)',
  fontSize: '13px',
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'color 0.15s, border-color 0.15s',
},
tabBtnActive: {
  color: 'var(--text-accent)',
  borderBottom: '2px solid var(--accent)',
},
```

- [ ] **Step 7：更新 Header 區域內所有 hardcoded 顏色按鈕**

在 JSX 的 header 區段，找到所有 `color: '#374151'`、`backgroundColor: '#f8fafc'`、`border: '1px solid #e2e8f0'` 等 hardcoded 值，改為 CSS variables：

```typescript
// 一般按鈕樣式（在 JSX 內 inline）：
{
  color: 'var(--text-secondary)',
  backgroundColor: 'var(--bg-elevated)',
  border: '1px solid var(--border-primary)',
}

// 主要 CTA 按鈕（例如匯出）：
{
  background: 'linear-gradient(90deg, var(--accent-grad-start), var(--accent-grad-end))',
  color: '#ffffff',
  border: 'none',
}
```

- [ ] **Step 8：視覺驗證**

刷新 `http://localhost:5173`，進入任意專案：
- Header 背景應為深色 `#0f172a`
- 左側 Chat pane 應有半透明深色 glass 效果
- Tab bar 文字應為 `#94a3b8`，active tab 為 `#e9d5ff`

- [ ] **Step 9：Smoke test**

```bash
pnpm test:e2e:smoke
```

預期：所有 smoke tests PASS（視覺改變不影響功能）

- [ ] **Step 10：Commit**

```bash
git add packages/client/src/pages/WorkspacePage.tsx
git commit -m "feat(theme): apply dark glass theme to WorkspacePage layout"
```

---

### Task 3：ChatPanel 套用深色主題

**Files:**
- Modify: `packages/client/src/components/ChatPanel.tsx`（styles 物件，約 2200–2444 行）

- [ ] **Step 1：找到 ChatPanel 的 `styles` 物件**

ChatPanel 底部有一個 `const styles = { ... }` 物件（或 inline style object）。將以下 key 改為 CSS variables：

```typescript
// container / wrapper
container: {
  display: 'flex',
  flexDirection: 'column' as const,
  height: '100%',
  backgroundColor: 'var(--bg-primary)',
  color: 'var(--text-primary)',
},

// messages area
messagesArea: {
  flex: 1,
  overflowY: 'auto' as const,
  padding: '16px',
  display: 'flex',
  flexDirection: 'column' as const,
  gap: '12px',
  backgroundColor: 'var(--bg-primary)',
},

// user message bubble
userBubble: {
  backgroundColor: 'var(--accent-glass)',
  border: '1px solid var(--border-accent)',
  borderRadius: '8px',
  padding: '10px 14px',
  color: 'var(--text-primary)',
  fontSize: '14px',
  lineHeight: 1.6,
  alignSelf: 'flex-end',
  maxWidth: '85%',
},

// AI message bubble
aiBubble: {
  backgroundColor: 'var(--bg-elevated)',
  border: '1px solid var(--border-primary)',
  borderRadius: '8px',
  padding: '10px 14px',
  color: 'var(--text-primary)',
  fontSize: '14px',
  lineHeight: 1.6,
  alignSelf: 'flex-start',
  maxWidth: '95%',
},

// input area
inputArea: {
  padding: '12px',
  borderTop: '1px solid var(--border-primary)',
  backgroundColor: 'var(--bg-primary)',
  flexShrink: 0,
},

// textarea
textarea: {
  width: '100%',
  backgroundColor: 'var(--bg-input)',
  border: '1px solid var(--border-primary)',
  borderRadius: '8px',
  color: 'var(--text-primary)',
  fontSize: '14px',
  padding: '10px 12px',
  resize: 'none' as const,
  fontFamily: 'inherit',
  outline: 'none',
},

// send button
sendBtn: {
  padding: '8px 16px',
  background: 'linear-gradient(90deg, var(--accent-grad-start), var(--accent-grad-end))',
  color: '#ffffff',
  border: 'none',
  borderRadius: '7px',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
},
```

> 注意：ChatPanel styles 物件很大（可能有 50+ key），只需將 hardcoded 的淺色值（`#ffffff`、`#f8fafc`、`#e2e8f0`、`#374151` 等）改為 CSS variables。深色值（`#1e293b`、`#334155`）可保留或改為 CSS variables。

- [ ] **Step 2：掃描 ChatPanel JSX 中的 inline hardcoded 顏色**

用 grep 找出剩餘的 hardcoded 淺色值：

```bash
grep -n "'#[ef][0-9a-f]\|'#f[0-9a-f]\|'#[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]'" packages/client/src/components/ChatPanel.tsx | head -30
```

逐一改為對應的 CSS variable。

- [ ] **Step 3：視覺驗證**

進入顧問模式，確認：
- 訊息列表區背景深色
- 使用者氣泡用 accent glass 效果
- AI 氣泡用 `--bg-elevated`
- 輸入框背景 `--bg-input`，文字 `--text-primary`（#f1f5f9）

- [ ] **Step 4：Smoke test**

```bash
pnpm test:e2e:smoke
```

- [ ] **Step 5：Commit**

```bash
git add packages/client/src/components/ChatPanel.tsx
git commit -m "feat(theme): apply dark glass theme to ChatPanel"
```

---

### Task 4：DesignPanel 與 StyleTweakerPanel 套用深色主題

**Files:**
- Modify: `packages/client/src/components/DesignPanel.tsx`
- Modify: `packages/client/src/components/StyleTweakerPanel.tsx`

- [ ] **Step 1：更新 DesignPanel styles**

DesignPanel 底部有 inline styles 或 style 物件。將所有淺色 hardcoded 值改為 CSS variables（同 Task 3 做法）：

關鍵替換：
- `#ffffff` / `#f8fafc` / `#f1f5f9` → `var(--bg-elevated)` 或 `var(--bg-primary)`
- `#374151` / `#1e293b` → `var(--text-primary)`
- `#64748b` → `var(--text-muted)`
- `#e2e8f0` / `#cbd5e1` → `var(--border-primary)`
- 淺藍 primary 按鈕 → `background: linear-gradient(90deg, var(--accent-grad-start), var(--accent-grad-end)); color: #ffffff`

- [ ] **Step 2：更新 StyleTweakerPanel styles**

`packages/client/src/components/StyleTweakerPanel.tsx` 約 350 行，同樣替換 hardcoded 淺色值。

- [ ] **Step 3：視覺驗證**

切到設計 tab，確認：
- DesignPanel 背景深色
- 輸入欄位 `--bg-input` 背景、`--text-primary` 文字
- 儲存按鈕為紫色漸層 + 白字

- [ ] **Step 4：Smoke test + Commit**

```bash
pnpm test:e2e:smoke
git add packages/client/src/components/DesignPanel.tsx packages/client/src/components/StyleTweakerPanel.tsx
git commit -m "feat(theme): apply dark glass theme to DesignPanel and StyleTweakerPanel"
```

---

## Phase 2：結構重組（元件拆分）

> 在 Phase 1 已完成視覺升級的基礎上，抽出新元件，WorkspacePage 瘦身。

---

### Task 5：建立 WorkspaceHeader 元件

**Files:**
- Create: `packages/client/src/components/WorkspaceHeader.tsx`
- Modify: `packages/client/src/pages/WorkspacePage.tsx`（移除 header JSX，改用 WorkspaceHeader）

- [ ] **Step 1：建立 WorkspaceHeader.tsx**

```typescript
// packages/client/src/components/WorkspaceHeader.tsx
import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

interface Project {
  id: string;
  name: string;
  share_token: string;
  owner_id?: string;
  owner_name?: string;
}

interface Props {
  project: Project;
  user: { id: string; name: string; role: string } | null;
  isReadOnly: boolean;
  forking: boolean;
  onFork: () => void;
  onLogout: () => void;
  onShare: () => void;
  onExport: () => void;
  onToggleShortcuts: () => void;
  exportingFramework: string | null;
  children?: React.ReactNode;
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '0 16px',
  height: '44px',
  borderBottom: '1px solid var(--border-primary)',
  backgroundColor: 'var(--bg-primary)',
  gap: '8px',
  flexShrink: 0,
  zIndex: 100,
};

const logoStyle: React.CSSProperties = {
  width: '22px',
  height: '22px',
  background: 'linear-gradient(135deg, var(--accent-grad-start), var(--accent-grad-end))',
  borderRadius: '5px',
  flexShrink: 0,
};

const projectNameStyle: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 600,
  color: 'var(--text-primary)',
  cursor: 'pointer',
  padding: '2px 6px',
  borderRadius: '4px',
  border: '1px solid transparent',
};

const btnBaseStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '5px',
  padding: '5px 10px',
  border: '1px solid var(--border-primary)',
  borderRadius: '6px',
  backgroundColor: 'var(--bg-elevated)',
  color: 'var(--text-secondary)',
  fontSize: '12px',
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const ctaBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '5px',
  padding: '5px 14px',
  border: 'none',
  borderRadius: '6px',
  background: 'linear-gradient(90deg, var(--accent-grad-start), var(--accent-grad-end))',
  color: '#ffffff',
  fontSize: '12px',
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

export default function WorkspaceHeader({
  project,
  user,
  isReadOnly,
  forking,
  onFork,
  onLogout,
  onShare,
  onExport,
  onToggleShortcuts,
  exportingFramework,
  children,
}: Props) {
  const navigate = useNavigate();
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(project.name);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleNameClick = () => {
    if (isReadOnly) return;
    setNameValue(project.name);
    setEditingName(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const handleNameSave = async () => {
    setEditingName(false);
    const trimmed = nameValue.trim();
    if (!trimmed || trimmed === project.name) return;
    try {
      await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      // parent will re-fetch project on next load; for immediate UI update
      // a callback prop can be added later if needed
    } catch { /* silently fail */ }
  };

  return (
    <div style={headerStyle} data-testid="workspace-header">
      <div style={logoStyle} />
      <span
        style={{ fontSize: '13px', color: 'var(--text-muted)', cursor: 'pointer' }}
        onClick={() => navigate('/')}
      >
        DesignBridge
      </span>
      <span style={{ color: 'var(--border-secondary)', fontSize: '14px' }}>/</span>

      {editingName ? (
        <input
          ref={inputRef}
          value={nameValue}
          onChange={e => setNameValue(e.target.value)}
          onBlur={handleNameSave}
          onKeyDown={e => { if (e.key === 'Enter') handleNameSave(); if (e.key === 'Escape') setEditingName(false); }}
          style={{
            fontSize: '14px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            background: 'var(--bg-input)',
            border: '1px solid var(--border-accent)',
            borderRadius: '4px',
            padding: '2px 6px',
            outline: 'none',
            width: '200px',
          }}
          autoFocus
        />
      ) : (
        <span
          style={projectNameStyle}
          onClick={handleNameClick}
          title={isReadOnly ? undefined : '點擊重新命名'}
          data-testid="project-name"
        >
          {project.name}
        </span>
      )}

      {/* Extra content slot (e.g. presence bar) */}
      {children}

      <div style={{ flex: 1 }} />

      {/* Right actions */}
      <button type="button" style={btnBaseStyle} onClick={onToggleShortcuts} title="鍵盤快捷鍵 (?)" data-testid="shortcuts-btn">
        ⌨ ?
      </button>

      {isReadOnly && (
        <button type="button" style={btnBaseStyle} onClick={onFork} disabled={forking} data-testid="fork-btn">
          {forking ? '⟳ Fork 中...' : '⑂ Fork'}
        </button>
      )}

      <button type="button" style={btnBaseStyle} onClick={onShare} data-testid="share-btn">
        🔗 分享
      </button>

      <button
        type="button"
        style={ctaBtnStyle}
        onClick={onExport}
        disabled={!!exportingFramework}
        data-testid="export-btn"
      >
        {exportingFramework ? `匯出中…` : '↓ 匯出'}
      </button>

      {user && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} data-testid="current-user-name" title={user.name}>
            {user.name}
          </span>
          <button type="button" style={btnBaseStyle} onClick={onLogout} data-testid="logout-btn" title="登出">
            登出
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2：在 WorkspacePage 引入並使用 WorkspaceHeader**

在 WorkspacePage.tsx 頂部 imports 加：
```typescript
import WorkspaceHeader from '../components/WorkspaceHeader';
```

找到 WorkspacePage render 中原本的 `<div style={styles.header}>...</div>` 區塊（約 1380–1632 行），整塊替換為：

```tsx
<WorkspaceHeader
  project={project}
  user={user}
  isReadOnly={isReadOnly}
  forking={forking}
  onFork={handleFork}
  onLogout={logout}
  onShare={() => setShowSharePanel(v => !v)}
  onExport={() => setShowExportMenu(v => !v)}
  onToggleShortcuts={() => setShowShortcuts(v => !v)}
  exportingFramework={exportingFramework}
>
  <PresenceBar projectId={project.id} />
</WorkspaceHeader>
```

> 注意：原 header 內的 share panel dropdown、export menu dropdown 暫時保留在 WorkspacePage 中，由 `showSharePanel`/`showExportMenu` state 控制顯示，位置改用 `position: fixed` 浮動。

- [ ] **Step 3：視覺驗證**

確認 header 顯示正常：logo、專案名稱可點擊、分享/匯出按鈕、使用者名稱。

- [ ] **Step 4：Smoke test + Commit**

```bash
pnpm test:e2e:smoke
git add packages/client/src/components/WorkspaceHeader.tsx packages/client/src/pages/WorkspacePage.tsx
git commit -m "feat(layout): extract WorkspaceHeader component"
```

---

### Task 6：建立 ModeRail 元件

**Files:**
- Create: `packages/client/src/components/ModeRail.tsx`
- Modify: `packages/client/src/pages/WorkspacePage.tsx`（移除原 mode tab bar，改用 ModeRail）

- [ ] **Step 1：建立 ModeRail.tsx**

```typescript
// packages/client/src/components/ModeRail.tsx

type Mode = 'design' | 'consultant' | 'architecture';

interface ModeItem {
  mode: Mode;
  icon: string;
  label: string;
  testId: string;
}

const MODES: ModeItem[] = [
  { mode: 'consultant', icon: '💬', label: '顧問', testId: 'mode-consultant' },
  { mode: 'design',     icon: '🎨', label: '設計', testId: 'mode-design' },
  { mode: 'architecture', icon: '🗂', label: '架構', testId: 'mode-architecture' },
];

interface Props {
  activeMode: Mode;
  onModeChange: (mode: Mode) => void;
}

const railStyle: React.CSSProperties = {
  width: '52px',
  background: '#0a0f1e',
  borderRight: '1px solid var(--border-subtle)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '8px 0',
  gap: '4px',
  flexShrink: 0,
  zIndex: 10,
};

export default function ModeRail({ activeMode, onModeChange }: Props) {
  return (
    <div style={railStyle} data-testid="mode-rail">
      {MODES.map(({ mode, icon, label, testId }) => {
        const isActive = activeMode === mode;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => onModeChange(mode)}
            data-testid={testId}
            title={label}
            style={{
              width: '38px',
              padding: '7px 0',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '3px',
              border: isActive ? '1px solid var(--border-accent-hi)' : '1px solid transparent',
              borderRadius: '8px',
              background: isActive ? 'var(--accent-glass)' : 'transparent',
              cursor: 'pointer',
              transition: 'background 0.15s, border-color 0.15s',
            }}
          >
            <span style={{ fontSize: '16px', lineHeight: 1 }}>{icon}</span>
            <span style={{
              fontSize: '10px',
              fontWeight: 600,
              color: isActive ? 'var(--text-accent)' : 'var(--text-muted)',
              lineHeight: 1,
            }}>
              {label}
            </span>
          </button>
        );
      })}

      <div style={{ flex: 1 }} />

      {/* Settings shortcut */}
      <button
        type="button"
        onClick={() => window.location.href = '/settings'}
        style={{
          width: '38px',
          padding: '7px 0',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '3px',
          border: '1px solid transparent',
          borderRadius: '8px',
          background: 'transparent',
          cursor: 'pointer',
        }}
        title="設定"
      >
        <span style={{ fontSize: '16px', lineHeight: 1 }}>⚙</span>
        <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', lineHeight: 1 }}>設定</span>
      </button>
    </div>
  );
}
```

- [ ] **Step 2：在 WorkspacePage 引入 ModeRail**

```typescript
import ModeRail from '../components/ModeRail';
```

在 body 區段（`<div style={isMobileViewport ? styles.bodyMobile : styles.body}>`）的非 mobile 分支最前面加上 ModeRail：

```tsx
{/* Desktop layout */}
<>
  <ModeRail activeMode={activeMode} onModeChange={setActiveMode} />
  <div style={styles.chatPaneWrapper}>
    {/* ... existing chat pane content ... */}
  </div>
  {/* ... preview pane ... */}
</>
```

同時移除 WorkspacePage 中原有的 mode tab bar（通常是一排 `button` 切換設計/顧問/架構），由 ModeRail 取代。

- [ ] **Step 3：視覺驗證**

確認最左側出現 ModeRail：三個模式按鈕 + 設定。點擊切換模式有 active 高亮效果。

- [ ] **Step 4：Smoke test + Commit**

```bash
pnpm test:e2e:smoke
git add packages/client/src/components/ModeRail.tsx packages/client/src/pages/WorkspacePage.tsx
git commit -m "feat(layout): extract ModeRail component — replace mode tab bar"
```

---

### Task 7：建立 ConsultantContextPanel

**Files:**
- Create: `packages/client/src/components/ConsultantContextPanel.tsx`

- [ ] **Step 1：建立 ConsultantContextPanel.tsx**

ConsultantContextPanel 是 ChatPanel 的薄包裝，加上 panel header：

```typescript
// packages/client/src/components/ConsultantContextPanel.tsx
import ChatPanel, { ChatMessage } from './ChatPanel';

interface Props {
  projectId: string;
  messages: ChatMessage[];
  onNewMessages: (userMsg: ChatMessage, assistantMsg: ChatMessage) => void;
  onHtmlGenerated: (data: { html: string; isMultiPage: boolean; pages: string[] }) => void;
  pendingMessage?: string | null;
  onPendingMessageConsumed?: () => void;
  hasPrototype?: boolean;
  selectedElement?: { bridgeId: string; html: string; tagName: string } | null;
  onClearSelectedElement?: () => void;
}

const headerStyle: React.CSSProperties = {
  padding: '10px 14px 8px',
  borderBottom: '1px solid var(--border-primary)',
  flexShrink: 0,
};

const labelStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 700,
  color: 'var(--text-accent)',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.08em',
};

export default function ConsultantContextPanel(props: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: 'var(--glass-context)', backdropFilter: 'var(--glass-blur-md)' }}>
      <div style={headerStyle}>
        <span style={labelStyle}>顧問模式</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <ChatPanel
          projectId={props.projectId}
          messages={props.messages}
          onNewMessages={props.onNewMessages}
          onHtmlGenerated={props.onHtmlGenerated}
          pendingMessage={props.pendingMessage}
          onPendingMessageConsumed={props.onPendingMessageConsumed}
          hasPrototype={props.hasPrototype}
          selectedElement={props.selectedElement}
          onClearSelectedElement={props.onClearSelectedElement}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2：Commit**

```bash
git add packages/client/src/components/ConsultantContextPanel.tsx
git commit -m "feat(layout): add ConsultantContextPanel wrapper"
```

---

### Task 8：建立 DesignContextPanel

**Files:**
- Create: `packages/client/src/components/DesignContextPanel.tsx`

- [ ] **Step 1：建立 DesignContextPanel.tsx**

包裝 DesignPanel + StyleTweakerPanel，底部有 compact chat input 存取共享 messages：

```typescript
// packages/client/src/components/DesignContextPanel.tsx
import { useState } from 'react';
import DesignPanel from './DesignPanel';
import StyleTweakerPanel from './StyleTweakerPanel';
import { ChatMessage } from './ChatPanel';

type SubTab = 'design' | 'style';

interface Props {
  projectId: string;
  html: string | null;
  onSaved?: () => void;
  onInjectStyles: (css: string) => void;
  onSaveStyles: (css: string) => Promise<void>;
  // compact chat
  onSendMessage: (text: string) => void;
  streamingMessage?: string;
}

const headerStyle: React.CSSProperties = {
  padding: '10px 14px 0',
  borderBottom: '1px solid var(--border-primary)',
  flexShrink: 0,
  backgroundColor: 'var(--bg-primary)',
};

const tabBtnBase: React.CSSProperties = {
  padding: '6px 12px',
  border: 'none',
  borderBottom: '2px solid transparent',
  background: 'transparent',
  color: 'var(--text-muted)',
  fontSize: '12px',
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const tabBtnActive: React.CSSProperties = {
  color: 'var(--text-accent)',
  borderBottom: '2px solid var(--accent)',
};

export default function DesignContextPanel({
  projectId, html, onSaved, onInjectStyles, onSaveStyles, onSendMessage, streamingMessage,
}: Props) {
  const [subTab, setSubTab] = useState<SubTab>('design');
  const [compactInput, setCompactInput] = useState('');

  const handleSend = () => {
    const text = compactInput.trim();
    if (!text) return;
    onSendMessage(text);
    setCompactInput('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: 'var(--glass-context)', backdropFilter: 'var(--glass-blur-md)' }}>
      {/* Header + sub-tabs */}
      <div style={headerStyle}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-accent)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>
          設計模式
        </div>
        <div style={{ display: 'flex', gap: '0' }}>
          <button type="button" style={{ ...tabBtnBase, ...(subTab === 'design' ? tabBtnActive : {}) }} onClick={() => setSubTab('design')}>設計</button>
          <button type="button" style={{ ...tabBtnBase, ...(subTab === 'style' ? tabBtnActive : {}), ...(!html ? { opacity: 0.4, cursor: 'not-allowed' } : {}) }} onClick={() => html && setSubTab('style')} disabled={!html}>樣式</button>
        </div>
      </div>

      {/* Panel content */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {subTab === 'design'
          ? <DesignPanel projectId={projectId} onSaved={onSaved} />
          : <StyleTweakerPanel html={html} onInject={onInjectStyles} onSave={onSaveStyles} />
        }
      </div>

      {/* Compact chat input */}
      <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border-primary)', backgroundColor: 'var(--bg-primary)', flexShrink: 0 }}>
        {streamingMessage && (
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px', padding: '6px 8px', background: 'var(--bg-elevated)', borderRadius: '5px' }}>
            {streamingMessage.slice(-120)}…
          </div>
        )}
        <div style={{ display: 'flex', gap: '6px' }}>
          <input
            value={compactInput}
            onChange={e => setCompactInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="傳訊息給 AI…"
            style={{
              flex: 1,
              background: 'var(--bg-input)',
              border: '1px solid var(--border-primary)',
              borderRadius: '6px',
              color: 'var(--text-primary)',
              fontSize: '13px',
              padding: '7px 10px',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!compactInput.trim()}
            style={{
              padding: '7px 14px',
              background: 'linear-gradient(90deg, var(--accent-grad-start), var(--accent-grad-end))',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: compactInput.trim() ? 'pointer' : 'not-allowed',
              opacity: compactInput.trim() ? 1 : 0.5,
              fontFamily: 'inherit',
            }}
          >
            送出
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2：Commit**

```bash
git add packages/client/src/components/DesignContextPanel.tsx
git commit -m "feat(layout): add DesignContextPanel with compact chat input"
```

---

### Task 9：建立 ArchContextPanel

**Files:**
- Create: `packages/client/src/components/ArchContextPanel.tsx`

- [ ] **Step 1：建立 ArchContextPanel.tsx**

```typescript
// packages/client/src/components/ArchContextPanel.tsx
import { useState } from 'react';
import ArchitectureTab from './ArchitectureTab';

interface Props {
  projectId: string;
  onSwitchToDesign: () => void;
  onSwitchToDesignAndGenerate?: () => void;
  onSendMessage: (text: string) => void;
  streamingMessage?: string;
}

export default function ArchContextPanel({
  projectId, onSwitchToDesign, onSwitchToDesignAndGenerate, onSendMessage, streamingMessage,
}: Props) {
  const [compactInput, setCompactInput] = useState('');

  const handleSend = () => {
    const text = compactInput.trim();
    if (!text) return;
    onSendMessage(text);
    setCompactInput('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: 'var(--glass-context)', backdropFilter: 'var(--glass-blur-md)' }}>
      {/* Header */}
      <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid var(--border-primary)', flexShrink: 0 }}>
        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-accent)', textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>
          架構模式
        </span>
      </div>

      {/* ArchitectureTab */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <ArchitectureTab
          projectId={projectId}
          onSwitchToDesign={onSwitchToDesign}
          onSwitchToDesignAndGenerate={onSwitchToDesignAndGenerate}
        />
      </div>

      {/* Compact chat input */}
      <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border-primary)', backgroundColor: 'var(--bg-primary)', flexShrink: 0 }}>
        {streamingMessage && (
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px', padding: '6px 8px', background: 'var(--bg-elevated)', borderRadius: '5px' }}>
            {streamingMessage.slice(-120)}…
          </div>
        )}
        <div style={{ display: 'flex', gap: '6px' }}>
          <input
            value={compactInput}
            onChange={e => setCompactInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="傳訊息給 AI…"
            style={{
              flex: 1,
              background: 'var(--bg-input)',
              border: '1px solid var(--border-primary)',
              borderRadius: '6px',
              color: 'var(--text-primary)',
              fontSize: '13px',
              padding: '7px 10px',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!compactInput.trim()}
            style={{
              padding: '7px 14px',
              background: 'linear-gradient(90deg, var(--accent-grad-start), var(--accent-grad-end))',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: compactInput.trim() ? 'pointer' : 'not-allowed',
              opacity: compactInput.trim() ? 1 : 0.5,
              fontFamily: 'inherit',
            }}
          >
            送出
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2：Commit**

```bash
git add packages/client/src/components/ArchContextPanel.tsx
git commit -m "feat(layout): add ArchContextPanel with compact chat input"
```

---

### Task 10：建立 ContextPanel wrapper

**Files:**
- Create: `packages/client/src/components/ContextPanel.tsx`

- [ ] **Step 1：建立 ContextPanel.tsx**

```typescript
// packages/client/src/components/ContextPanel.tsx
import ConsultantContextPanel from './ConsultantContextPanel';
import DesignContextPanel from './DesignContextPanel';
import ArchContextPanel from './ArchContextPanel';
import { ChatMessage } from './ChatPanel';

type Mode = 'design' | 'consultant' | 'architecture';

interface Props {
  activeMode: Mode;
  projectId: string;
  messages: ChatMessage[];
  onNewMessages: (userMsg: ChatMessage, assistantMsg: ChatMessage) => void;
  onHtmlGenerated: (data: { html: string; isMultiPage: boolean; pages: string[] }) => void;
  html: string | null;
  onSaved?: () => void;
  onInjectStyles: (css: string) => void;
  onSaveStyles: (css: string) => Promise<void>;
  pendingMessage?: string | null;
  onPendingMessageConsumed?: () => void;
  hasPrototype?: boolean;
  selectedElement?: { bridgeId: string; html: string; tagName: string } | null;
  onClearSelectedElement?: () => void;
  onSendMessage: (text: string) => void;
  streamingMessage?: string;
  onSwitchToDesign: () => void;
  onSwitchToDesignAndGenerate?: () => void;
  width: number;
  onResize: (width: number) => void;
}

export default function ContextPanel({ activeMode, ...props }: Props) {
  const wrapperStyle: React.CSSProperties = {
    width: props.width,
    flexShrink: 0,
    borderRight: '1px solid var(--border-primary)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
  };

  const renderPanel = () => {
    switch (activeMode) {
      case 'consultant':
        return (
          <ConsultantContextPanel
            projectId={props.projectId}
            messages={props.messages}
            onNewMessages={props.onNewMessages}
            onHtmlGenerated={props.onHtmlGenerated}
            pendingMessage={props.pendingMessage}
            onPendingMessageConsumed={props.onPendingMessageConsumed}
            hasPrototype={props.hasPrototype}
            selectedElement={props.selectedElement}
            onClearSelectedElement={props.onClearSelectedElement}
          />
        );
      case 'design':
        return (
          <DesignContextPanel
            projectId={props.projectId}
            html={props.html}
            onSaved={props.onSaved}
            onInjectStyles={props.onInjectStyles}
            onSaveStyles={props.onSaveStyles}
            onSendMessage={props.onSendMessage}
            streamingMessage={props.streamingMessage}
          />
        );
      case 'architecture':
        return (
          <ArchContextPanel
            projectId={props.projectId}
            onSwitchToDesign={props.onSwitchToDesign}
            onSwitchToDesignAndGenerate={props.onSwitchToDesignAndGenerate}
            onSendMessage={props.onSendMessage}
            streamingMessage={props.streamingMessage}
          />
        );
    }
  };

  return (
    <div style={wrapperStyle} data-testid="context-panel">
      {renderPanel()}
    </div>
  );
}
```

- [ ] **Step 2：Commit**

```bash
git add packages/client/src/components/ContextPanel.tsx
git commit -m "feat(layout): add ContextPanel — mode-adaptive wrapper"
```

---

### Task 11：將 WorkspacePage 接入 ContextPanel + ModeRail

**Files:**
- Modify: `packages/client/src/pages/WorkspacePage.tsx`

- [ ] **Step 1：在 WorkspacePage 加入 imports**

```typescript
import ContextPanel from '../components/ContextPanel';
import ConsultantContextPanel from '../components/ConsultantContextPanel';
import DesignContextPanel from '../components/DesignContextPanel';
import ArchContextPanel from '../components/ArchContextPanel';
import ModeRail from '../components/ModeRail';
import WorkspaceHeader from '../components/WorkspaceHeader';
```

- [ ] **Step 2：新增 `handleSendFromContextPanel` callback**

在 WorkspacePage state 區段後加入（用於 Design/Arch mode compact chat input 送出）：

```typescript
const handleSendFromContextPanel = useCallback((text: string) => {
  setPendingChatMessage(text);
  // compact input 送出後切換到顧問模式讓使用者看到回應
  // （或保留在當前模式，由 ChatPanel 在背景處理）
}, []);
```

- [ ] **Step 3：替換 body desktop 分支**

找到 desktop layout 區段（`} else { ... renderWorkspaceLeftPane() ... renderWorkspacePreviewPane() ...}`），替換為：

```tsx
{/* Desktop layout */}
<ModeRail activeMode={activeMode} onModeChange={setActiveMode} />

<div style={{ position: 'relative', display: 'flex', flexShrink: 0 }}>
  {isReadOnly && <div style={styles.readOnlyOverlay} data-testid="readonly-overlay" />}
  <ContextPanel
    activeMode={activeMode}
    projectId={project.id}
    messages={messages}
    onNewMessages={handleNewMessages}
    onHtmlGenerated={handleHtmlGenerated}
    html={html}
    onSaved={checkDesignActive}
    onInjectStyles={injectStyles}
    onSaveStyles={handleSaveStyles}
    pendingMessage={pendingChatMessage}
    onPendingMessageConsumed={() => setPendingChatMessage(null)}
    hasPrototype={!!html}
    selectedElement={selectedElement}
    onClearSelectedElement={() => setSelectedElement(null)}
    onSendMessage={handleSendFromContextPanel}
    onSwitchToDesign={() => setActiveMode('design')}
    onSwitchToDesignAndGenerate={() => {
      setActiveMode('design');
      setPendingChatMessage('請根據架構圖生成第一版原型');
    }}
    width={chatPaneWidth}
    onResize={(w) => {
      setChatPaneWidth(w);
      localStorage.setItem('pb-chat-pane-width', String(w));
    }}
  />
</div>

{/* Resize handle */}
{!focusMode && (
  <div
    style={{ width: 5, cursor: 'col-resize', background: 'transparent', flexShrink: 0, zIndex: 20 }}
    onMouseDown={(e) => {
      e.preventDefault();
      chatResizing.current = true;
      const startX = e.clientX;
      const startW = chatPaneWidth;
      const handle = e.currentTarget as HTMLDivElement;
      handle.style.background = 'var(--accent)';
      const onMove = (ev: MouseEvent) => {
        if (!chatResizing.current) return;
        setChatPaneWidth(Math.max(250, Math.min(700, startW + (ev.clientX - startX))));
      };
      const onUp = () => {
        chatResizing.current = false;
        handle.style.background = 'transparent';
        localStorage.setItem('pb-chat-pane-width', String(chatPaneWidth));
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    }}
  />
)}

{renderWorkspacePreviewPane()}
```

- [ ] **Step 4：移除 `renderWorkspaceLeftPane` 函式**

確認 `renderWorkspaceLeftPane` 已無任何呼叫後，刪除該函式定義（約 830–856 行）。

- [ ] **Step 5：視覺驗證**

- 切換 ModeRail 的顧問/設計/架構，ContextPanel 內容正確切換
- 顧問模式：完整 chat UI
- 設計模式：Design + Style tab + 底部 compact input
- 架構模式：ArchitectureTab + 底部 compact input
- messages 在三個模式間共享（顧問模式打訊息，切到設計模式 compact input 送出，切回顧問模式能看到所有訊息）

- [ ] **Step 6：Smoke test**

```bash
pnpm test:e2e:smoke
```

- [ ] **Step 7：Commit**

```bash
git add packages/client/src/pages/WorkspacePage.tsx
git commit -m "feat(layout): wire ContextPanel + ModeRail into WorkspacePage"
```

---

## Phase 3：PreviewArea 抽離 + 收尾

---

### Task 12：建立 PreviewArea 元件

**Files:**
- Create: `packages/client/src/components/PreviewArea.tsx`

- [ ] **Step 1：建立 PreviewArea.tsx**

PreviewArea 接管 `renderWorkspacePreviewPane()` 的全部邏輯：

```typescript
// packages/client/src/components/PreviewArea.tsx
import PreviewPanel, { InteractionMode } from './PreviewPanel';
import CodePanel from './CodePanel';
import CodeFileTree from './CodeFileTree';
import DeviceSizeSelector, { DeviceSize } from './DeviceSizeSelector';

interface Props {
  html: string | null;
  viewMode: 'preview' | 'code';
  onViewModeChange: (mode: 'preview' | 'code') => void;
  deviceSize: DeviceSize;
  onDeviceSizeChange: (size: DeviceSize) => void;
  isMultiPage: boolean;
  pages: string[];
  activePage: string;
  onNavigatePage: (page: string) => void;
  interactionMode: InteractionMode;
  onInteractionModeChange: (mode: InteractionMode) => void;
  onElementSelect: (el: { bridgeId: string; html: string; tagName: string }) => void;
  isMobileViewport: boolean;
  projectId: string;
}

const toolbarStyle: React.CSSProperties = {
  height: '36px',
  display: 'flex',
  alignItems: 'center',
  padding: '0 12px',
  gap: '8px',
  borderBottom: '1px solid var(--border-primary)',
  backgroundColor: 'var(--bg-primary)',
  flexShrink: 0,
};

const tabBtnBase: React.CSSProperties = {
  padding: '4px 10px',
  border: 'none',
  borderBottom: '2px solid transparent',
  background: 'transparent',
  color: 'var(--text-muted)',
  fontSize: '12px',
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

export default function PreviewArea({
  html, viewMode, onViewModeChange, deviceSize, onDeviceSizeChange,
  isMultiPage, pages, activePage, onNavigatePage, interactionMode,
  onInteractionModeChange, onElementSelect, isMobileViewport, projectId,
}: Props) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: 'var(--bg-root)' }} data-testid="preview-area">
      {/* Preview toolbar */}
      <div style={toolbarStyle}>
        <button
          type="button"
          style={{ ...tabBtnBase, ...(viewMode === 'preview' ? { color: 'var(--text-accent)', borderBottom: '2px solid var(--accent)' } : {}) }}
          onClick={() => onViewModeChange('preview')}
          data-testid="view-preview-btn"
        >
          預覽
        </button>
        <button
          type="button"
          style={{ ...tabBtnBase, ...(viewMode === 'code' ? { color: 'var(--text-accent)', borderBottom: '2px solid var(--accent)' } : {}), ...(!html ? { opacity: 0.4, cursor: 'not-allowed' } : {}) }}
          onClick={() => html && onViewModeChange('code')}
          disabled={!html}
          data-testid="view-code-btn"
        >
          程式碼
        </button>

        <div style={{ width: '1px', height: '16px', background: 'var(--border-primary)', margin: '0 4px' }} />

        <DeviceSizeSelector value={deviceSize} onChange={onDeviceSizeChange} />

        <div style={{ flex: 1 }} />

        {/* Interaction mode buttons */}
        {html && (
          <>
            <button
              type="button"
              style={{ ...tabBtnBase, ...(interactionMode === 'element-select' ? { color: 'var(--text-accent)' } : {}) }}
              onClick={() => onInteractionModeChange(interactionMode === 'element-select' ? 'browse' : 'element-select')}
              title="選取元素"
            >
              ✏ 元素
            </button>
            <button
              type="button"
              style={{ ...tabBtnBase, ...(interactionMode === 'annotate' ? { color: 'var(--text-accent)' } : {}) }}
              onClick={() => onInteractionModeChange(interactionMode === 'annotate' ? 'browse' : 'annotate')}
              title="標注模式"
              data-testid="annotate-btn"
            >
              📌 標注
            </button>
          </>
        )}
      </div>

      {/* Content */}
      {viewMode === 'code' ? (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', flexDirection: isMobileViewport ? 'column' : 'row' }}>
          {!isMobileViewport && (
            <CodeFileTree pages={pages} activePage={activePage || null} onSelect={onNavigatePage} html={html || ''} />
          )}
          <CodePanel html={html} pages={pages} activePage={activePage} onPageChange={onNavigatePage} />
        </div>
      ) : (
        <PreviewPanel
          html={html}
          deviceSize={deviceSize}
          interactionMode={interactionMode}
          onElementSelect={onElementSelect}
          pages={pages}
          activePage={activePage}
          onNavigatePage={onNavigatePage}
          isMultiPage={isMultiPage}
          projectId={projectId}
        />
      )}
    </div>
  );
}
```

> 注意：PreviewPanel 的完整 props 以現有 `packages/client/src/components/PreviewPanel.tsx` 定義為準，上面列出的是預期介面，實作時若有差異依實際 props 調整。

- [ ] **Step 2：Commit**

```bash
git add packages/client/src/components/PreviewArea.tsx
git commit -m "feat(layout): extract PreviewArea component"
```

---

### Task 13：接入 PreviewArea + 精簡 WorkspacePage

**Files:**
- Modify: `packages/client/src/pages/WorkspacePage.tsx`

- [ ] **Step 1：import PreviewArea**

```typescript
import PreviewArea from '../components/PreviewArea';
```

- [ ] **Step 2：替換 `renderWorkspacePreviewPane()` 呼叫**

找到 desktop layout 中的 `{renderWorkspacePreviewPane()}` 呼叫，替換為：

```tsx
<PreviewArea
  html={html}
  viewMode={viewMode}
  onViewModeChange={setViewMode}
  deviceSize={deviceSize}
  onDeviceSizeChange={setDeviceSize}
  isMultiPage={isMultiPage}
  pages={pages}
  activePage={activePage}
  onNavigatePage={handleNavigatePage}
  interactionMode={interactionMode}
  onInteractionModeChange={setInteractionMode}
  onElementSelect={setSelectedElement}
  isMobileViewport={isMobileViewport}
  projectId={project.id}
/>
```

- [ ] **Step 3：刪除 `renderWorkspacePreviewPane` 函式**

確認無其他呼叫後，刪除 `renderWorkspacePreviewPane`（約 859–1200 行）。

- [ ] **Step 4：刪除已遷移的 styles 物件 key**

從 `styles` 物件中刪除已搬移到新元件的 key（`previewPane`、`pageSidebar`、`pageSidebarItem` 等 PreviewArea 相關 style）。

- [ ] **Step 5：確認 WorkspacePage 行數**

```bash
wc -l packages/client/src/pages/WorkspacePage.tsx
```

目標：< 700 行（Phase 3 完成後目標 ~450，但接受 700 以下）。

- [ ] **Step 6：視覺驗證**

完整走一遍：
- 載入專案
- 顧問模式對話，生成原型
- 切設計模式，調整設計
- 切架構模式，查看架構圖
- 切回顧問模式，確認訊息歷史完整
- 切 code view，確認程式碼顯示
- DeviceSize 切換

- [ ] **Step 7：Smoke test**

```bash
pnpm test:e2e:smoke
```

- [ ] **Step 8：Commit**

```bash
git add packages/client/src/pages/WorkspacePage.tsx packages/client/src/components/PreviewArea.tsx
git commit -m "feat(layout): wire PreviewArea + slim down WorkspacePage"
```

---

### Task 14：全套 E2E 驗收 + 收尾

**Files:**
- Delete: 舊的 import 引用（若 `ChatPanel` 在 WorkspacePage 已完全由 ContextPanel 接管）

- [ ] **Step 1：確認 ChatPanel 仍被 ConsultantContextPanel 使用**

`ChatPanel.tsx` 本身不刪除，因為 `ConsultantContextPanel` 仍 import 它。確認 WorkspacePage 不再直接 import `ChatPanel`：

```bash
grep "import ChatPanel" packages/client/src/pages/WorkspacePage.tsx
```

預期：無輸出（WorkspacePage 不再直接引用）。

- [ ] **Step 2：執行完整 E2E 測試**

```bash
pnpm test:e2e
```

預期：61/61 PASS

- [ ] **Step 3：若有測試失敗**

查看失敗原因：
```bash
pnpm test:e2e 2>&1 | grep -A 5 "FAILED\|Error"
```

常見原因：
- `data-testid` 屬性在新元件中缺少 → 補上對應 testId
- 元素選取器路徑變更 → 更新 E2E test 的 selector

- [ ] **Step 4：最終行數確認**

```bash
wc -l packages/client/src/pages/WorkspacePage.tsx \
        packages/client/src/components/ConsultantContextPanel.tsx \
        packages/client/src/components/DesignContextPanel.tsx \
        packages/client/src/components/ArchContextPanel.tsx \
        packages/client/src/components/ContextPanel.tsx \
        packages/client/src/components/WorkspaceHeader.tsx \
        packages/client/src/components/ModeRail.tsx \
        packages/client/src/components/PreviewArea.tsx
```

- [ ] **Step 5：最終 Commit**

```bash
git add -A
git commit -m "feat(ui-refactor): Phase 3 complete — PreviewArea + E2E all pass"
```

- [ ] **Step 6：Push**

```bash
git push
```

---

## 快速參考

### CSS Variables 對應表

| 舊 hardcoded 值 | 新 CSS variable |
|---|---|
| `#f8fafc` / `#ffffff` (背景) | `var(--bg-primary)` 或 `var(--bg-elevated)` |
| `#1e293b` (深色卡片) | `var(--bg-elevated)` |
| `#334155` (input 背景) | `var(--bg-input)` |
| `#374151` / `#1e293b` (文字) | `var(--text-primary)` |
| `#64748b` (muted 文字) | `var(--text-muted)` |
| `#e2e8f0` / `#cbd5e1` (邊框) | `var(--border-primary)` |
| `#8E6FA7` (舊 accent) | `var(--accent)` |
| 淺藍 primary 按鈕 | `background: linear-gradient(90deg, var(--accent-grad-start), var(--accent-grad-end)); color: #ffffff` |

### 驗證指令

```bash
pnpm dev:server          # 啟動 server（背景）
pnpm dev:client          # 啟動 client
pnpm test:e2e:smoke      # Smoke tests（每個 phase 後執行）
pnpm test:e2e            # 完整 61 tests（Phase 3 結束）
```
