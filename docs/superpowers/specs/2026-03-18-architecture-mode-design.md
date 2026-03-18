# Architecture Mode — Design Spec

**Date:** 2026-03-18
**Status:** Approved (v2 — post-review revision)

---

## Problem

Users currently start generating UI prototypes without defining the information architecture upfront. This leads to:
- AI guessing how many pages to create and how they connect
- No visual map of page relationships
- Per-page reference designs get applied globally instead of per-page
- Designers repeat the same structural context in every chat message

---

## Solution

Add an **Architecture Mode** — a separate full-page tab in the project view where users define the structure of their app/component before (and during) generation. A conversational wizard captures the structure; a visual flowchart persists it; both feed into AI generation.

---

## Approach: Conversational → Visual (Hybrid)

AI-guided Q&A initialises the architecture. The result auto-generates an editable flowchart (React Flow). Users can modify the chart directly at any time. Architecture data is injected into every AI generation prompt.

---

## UI Structure

### Tab Bar (added to WorkspacePage)

`WorkspacePage` gains a top-level `activeMode` state: `'design' | 'architecture'`.

```tsx
// WorkspacePage layout
<div className="workspace">
  <TabBar>
    <Tab id="design">Design</Tab>
    <Tab id="architecture">Architecture</Tab>
  </TabBar>
  {activeMode === 'design' && <DesignLayout />}   // existing layout
  {activeMode === 'architecture' && <ArchitectureTab />}  // new, full-page
</div>
```

`ArchitectureTab` renders full-viewport (no sidebar, no preview panel).

### When Architecture Tab is Opened

| Condition | Behaviour |
|---|---|
| New project (never configured) | Show wizard directly |
| Existing project, `arch_data` is null | Show empty state with "設定架構" button that launches wizard |
| Existing project, `arch_data` exists | Show flowchart; "重新引導" button top-right re-launches wizard |

### New Project Onboarding

After `NewProjectDialog` creates a project and navigates to `/project/:id`, the app defaults to `activeMode = 'architecture'` if `arch_data` is null. No changes required to `NewProjectDialog` itself — `WorkspacePage` checks `arch_data` on mount and sets the initial tab accordingly.

---

## Wizard (Setup Q&A)

### Design Principles
- One question per card, centred in `ArchitectureTab`
- User answers by **clicking buttons** (no required typing; custom name option shows an inline input)
- Card animates up on answer, next card slides in (CSS transition)
- Progress bar at top: `currentStep / totalSteps` — denominator updates dynamically after Q3 answer
- Partial answers are saved to `arch_data` on each step (autosaved, see Autosave section)
- Wizard can be dismissed at any time; partial `arch_data` is preserved

### Page Flow — Question Sequence

```
Q1: 你想設計的是？
    [頁面（網站 / App）]  [元件（單一 UI 元件）]

── if 頁面 ──

Q2: 類型？
    [網站]  [App]  [Dashboard]  [其他]

Q3: 大概有幾個頁面？
    [1]  [2–3]  [4–6]  [7+]  [讓 AI 決定]
    → If "讓 AI 決定": skip Q4…Qn entirely, go directly to Q_last

Q4…Qn (one card per page, repeated):
    標題: 「頁面 {n}」
    - 名稱輸入（預設 chips：首頁 / 列表頁 / 詳細頁 / 登入頁 / 自訂...）
    - 參考圖上傳區（drag-and-drop zone + click-to-open file picker; jpg/png/pdf）
    - 貼上截圖提示（"或按 Ctrl+V 貼上截圖"）— handled by wizard-level paste listener
    - 連到哪些頁面？（chips: existing page names + [+ 新增頁面] chip）

Q_last: 架構完成！
    [先看架構圖]  → stay in Architecture tab, show flowchart
    [直接開始生成]  → PATCH arch_data, then switch to Design tab and
                     send a silent trigger message "請依照架構生成所有頁面"
```

### Component Flow — Question Sequence

```
Q1: 你想設計的是？  → [元件]

Q2: 元件名稱？
    [Button]  [Card]  [Form]  [Modal]  [自訂...]

Q3: 有哪些互動點？（多選）
    [主要按鈕]  [次要按鈕]  [輸入框]  [關閉]  [自訂...]

Q4 (per interaction): 點了「{interaction}」會發生什麼？
    [顯示/隱藏內容]  [跳轉頁面]  [送出表單]
    [顯示 loading]  [顯示成功]  [顯示錯誤]  [自訂...]

Q5: 元件有哪些狀態？（可略過）
    [預設]  [hover]  [loading]  [success]  [error]  [略過]

Q_last: [先看架構圖]  [直接開始生成]
```

Note: component `interactions` and `states` collected here are stored in `arch_data` and injected into the AI prompt as a component behaviour spec. No separate visual editor for state machines in this iteration.

---

## Flowchart (Visual Node Editor)

### Dependencies (new installs required)

```bash
# in packages/client
pnpm add @xyflow/react zustand

# in packages/server
pnpm add sharp
```

`zustand` will be used for `useArchStore`. A `stores/` directory will be created in `packages/client/src/`.

### Node Types

All nodes share the `arch_data.nodes` array. A `nodeType` discriminator field distinguishes them.

**PageNode** (`nodeType: 'page'`)
```
┌────────────────────────────┐
│  [縮圖 or 頁面 icon 16:9]   │  ← thumbnail from referenceFileUrl, or default icon
│  首頁                       │  ← double-click to rename (inline input)
│  [+ 參考圖]  [貼上 Ctrl+V]  │
└────────────────────────────┘
```

**ComponentNode** (`nodeType: 'component'`)
```
┌────────────────────────────┐
│  ⬡  Button                 │
│  states: default / hover   │
└────────────────────────────┘
```

### Connection (Edge) Behaviour
- Drag from right-side handle → connect to another node
- Double-click edge label to edit (e.g. "點擊登入")
- Edges are directional arrows

### Node Context Menu (right-click)
- 改名
- 刪除
- 換參考圖
- 前往此頁面 → sets `useArchStore.targetPage = node.name`, switches `activeMode` to `'design'`; `WorkspacePage` reads `targetPage` from the store and sends a postMessage to the PreviewPanel iframe: `iframe.contentWindow.postMessage({ type: 'show-page', name: targetPage }, '*')`. PreviewPanel's existing `handleMessage` listener handles `show-page` type by calling `iframe.contentWindow.eval(\`showPage('${name}')\`)`. After navigation, `targetPage` is cleared in the store.

### Toolbar

```
[ + 新增頁面 ]  [ 重新引導 ]                    [ 開始生成 ▶ ]
```

Note: "自動排列" (auto-layout) is **deferred to iteration 2** — it requires adding `dagre` or `elkjs` as a separate layout dependency and is not critical for v1.

### File Drop on Node

File drag-onto-node: stop propagation on `dragover`/`drop` at the node level **before** React Flow's canvas drag handler receives the event. React Flow uses `onNodeDrag` (for node repositioning) which only fires on `mousedown`+`mousemove`, not on native `dragover`/`drop` events from the OS file manager — so there is **no conflict**. The node renders a `<div>` with `onDragOver` and `onDrop` handlers that call `e.stopPropagation()` and process `e.dataTransfer.files`.

### Ctrl+V Paste in Wizard and Flowchart

- **Wizard**: a `paste` event listener is attached to `document` while the wizard is mounted. It reads `e.clipboardData.items` for `image/png` or `image/jpeg` and uploads to the current page being defined.
- **Flowchart**: same pattern — `paste` listener checks `flowchartStore.selectedNodeId`. If a node is selected (React Flow `onSelectionChange`), the pasted image is associated with that node.
- `navigator.clipboard.read()` is **not used** — the synchronous `ClipboardEvent.clipboardData` API is used instead (works without permission prompt, fires on Ctrl+V).

---

## Per-Page Reference Images

### Upload Flow
1. User uploads or pastes image during wizard (for page Qn) or via node in flowchart
2. File sent to `POST /api/projects/:id/upload` with multipart field `page_name=首頁`
3. Server stores file, runs visual analysis pipeline, returns `{ fileId, visual_analysis }`
4. `arch_data` node's `referenceFileId` is updated; `referenceFileUrl` is set to `/api/projects/:id/files/:fileId/thumbnail`

### File Thumbnail Endpoint (new)
`GET /api/projects/:id/files/:fileId/thumbnail` — returns the first rendered page of the PDF or the image itself, resized to 320×180. Uses existing `pdfPageRenderer.ts` for PDFs.

### `uploaded_files` Schema Change
```sql
-- Migration 010
ALTER TABLE uploaded_files ADD COLUMN page_name TEXT; -- nullable; scopes file to a specific page
```

Note: The `intent` field mentioned in earlier discussions belongs to the **ux-improvement-pack** change (separate migration). This spec uses only `page_name` for per-page scoping.

---

## Data Model

### `projects` Table — New Column
```sql
-- Migration 010 (same file as uploaded_files change)
ALTER TABLE projects ADD COLUMN arch_data TEXT; -- JSON blob, nullable
```

Note: `arch_type` is **not** a separate column — it is stored as `arch_data.type` to avoid redundancy. The chat route reads `arch_data` and parses `type` from it.

### `arch_data` JSON Schema

```typescript
interface ArchData {
  type: 'page' | 'component';
  subtype?: 'website' | 'app' | 'dashboard' | 'other'; // page only
  aiDecidePages?: boolean; // true when user chose "讓 AI 決定"; nodes will be []
  nodes: ArchNode[];
  edges: ArchEdge[];
}

interface ArchNode {
  id: string;
  nodeType: 'page' | 'component';
  name: string;
  position: { x: number; y: number };
  referenceFileId: string | null;
  referenceFileUrl: string | null; // /api/projects/:id/files/:fileId/thumbnail
  // component-only fields:
  interactions?: Array<{ label: string; outcome: string }>;
  states?: string[];
}

interface ArchEdge {
  id: string;
  source: string;  // node id
  target: string;  // node id
  label?: string;
}
```

---

## Autosave Strategy

`arch_data` is PATCHed to the server in two situations:
1. **Wizard step completion** — after each Q&A card answer (debounced 300 ms)
2. **Flowchart change** — on React Flow `onNodesChange` / `onEdgesChange` (debounced 1000 ms)

No manual save button. The toolbar "開始生成" button does not wait for save — it reads from local state (which is always up-to-date) and the debounced PATCH runs in the background.

---

## Backend API

### New Route File

Create `packages/server/src/routes/architecture.ts`. Register in `packages/server/src/index.ts`:

```typescript
import architectureRouter from './routes/architecture';
app.use('/api/projects', architectureRouter);
```

### New Endpoints

| Method | Path | Body / Response |
|---|---|---|
| `PATCH /api/projects/:id/architecture` | `{ arch_data: ArchData }` → `{ ok: true }` |
| `GET /api/projects/:id/architecture` | — → `{ arch_data: ArchData \| null }` |
| `GET /api/projects/:id/files/:fileId/thumbnail` | — → `image/jpeg`, resized to fit 320×180 using `sharp` (add `pnpm add sharp` to server). For PDFs: render page 1 via `pdfPageRenderer.ts`, then resize with sharp. |

### Modified Endpoints

`GET /api/projects/:id` — extend response to include `arch_data: string | null`. Update the `Project` interface in `packages/client/src/types.ts` (or wherever the client project type is defined) to add `arch_data: string | null`.

`POST /api/projects/:id/upload` — accepts optional multipart field `page_name` (string). If present, stored in `uploaded_files.page_name`.

---

## AI Prompt Injection

Architecture data is injected into the system prompt in `chat.ts`, placed **after** the design-spec prefix but **before** the default design system block:

```
[designSpecPrefix]         ← per-project visual analysis (existing)
[architectureBlock]        ← NEW
[systemPrompt]             ← default design system, HTML rules, etc.
```

### Architecture Block Format

**Page mode (AI decides page count)**
```
=== APP ARCHITECTURE ===
Type: 多頁面網站
Pages: [to be determined by you — generate a sensible set of pages]
================================
```

**Page mode (explicit pages)**
```
=== APP ARCHITECTURE ===
Type: 多頁面網站
Pages: 首頁, 列表頁, 詳細頁
Navigation:
  首頁 → 列表頁 (點擊搜尋)
  列表頁 → 詳細頁 (點擊卡片)

Per-page design specs:
  [列表頁] <<< DESIGN SPEC FOR 列表頁 — overrides global style >>>
  {visual_analysis content for 列表頁's reference file}
  <<< END DESIGN SPEC FOR 列表頁 >>>
================================
```

**Multi-page injection strategy**: The existing pipeline generates **all pages in a single AI call**. Per-page specs are therefore all included in one system prompt, labeled clearly by page name. The AI is instructed to apply each labeled spec to its corresponding page only.

**Integration with existing MULTI-PAGE STRUCTURE block**: When `arch_data` has explicit pages (`nodes.length > 0`), the `architectureBlock` **replaces** the existing `MULTI-PAGE STRUCTURE` block in `chat.ts`. The `analyzePageStructure()` call is skipped — page names come from `arch_data.nodes` directly. When `arch_data` is null or `aiDecidePages: true`, existing behaviour is unchanged.

When `arch_data.aiDecidePages === true`, `nodes` will be `[]`. The architecture block is injected as "AI decides" format, and the existing `analyzePageStructure()` + `MULTI-PAGE STRUCTURE` block runs as normal.

**Component mode**
```
=== COMPONENT ARCHITECTURE ===
Type: 元件
Name: Button
Interactions:
  主要按鈕 → 顯示 loading，然後顯示成功
  關閉 → 隱藏元件
States: default, loading, success
================================
```

---

## Frontend Components

| Component | Path | Purpose |
|---|---|---|
| `ArchitectureTab.tsx` | `components/` | Full-page container; renders wizard or flowchart |
| `ArchWizard.tsx` | `components/` | Conversational Q&A wizard with animated cards |
| `ArchFlowchart.tsx` | `components/` | React Flow canvas + toolbar |
| `PageNode.tsx` | `components/` | Custom React Flow node for pages |
| `ComponentNode.tsx` | `components/` | Custom React Flow node for components |
| `useArchStore.ts` | `stores/` | Zustand store: `archData`, `selectedNodeId`, `activeWizardStep`, debounced PATCH |

`WorkspacePage.tsx` changes:
- Add `activeMode: 'design' | 'architecture'` state
- Add tab bar UI
- Pass `targetPage` via store for cross-tab navigation
- On mount: if `arch_data` is null → `activeMode = 'architecture'`; else `activeMode = 'design'`

---

## Migration Files

```
packages/server/src/db/migrations/010_architecture.sql
```

Contents:
```sql
ALTER TABLE projects ADD COLUMN arch_data TEXT;
ALTER TABLE uploaded_files ADD COLUMN page_name TEXT;
```

---

## Testing (Playwright + Chrome, per feature)

| Phase | Test Scenario |
|---|---|
| 1 — Tab & empty state | Navigate to new project → Architecture tab auto-selected → wizard visible |
| 2 — Wizard (page flow) | Complete Q1–Q_last with 3 pages → flowchart renders 3 nodes + edges |
| 3 — Wizard ("讓 AI 決定") | Select "讓 AI 決定" → jump to Q_last → flowchart shows empty canvas |
| 4 — Reference image | Upload PNG for "列表頁" node → thumbnail appears in node |
| 5 — Ctrl+V paste | Copy screenshot to clipboard → Ctrl+V → thumbnail appears |
| 6 — Flowchart editing | Add node, drag edge, rename node, delete node |
| 7 — Cross-tab navigation | Right-click node → 前往此頁面 → Design tab opens, correct page shown |
| 8 — Generation integration | Set 3-page arch → generate → verify all 3 pages exist, 列表頁 uses reference spec |
| 9 — Autosave | Edit flowchart → reload page → changes persisted |

---

## Out of Scope (this iteration)

- Auto-layout button (requires `dagre`/`elkjs`) — deferred to iteration 2
- Real-time collaboration on the flowchart
- Export flowchart as image/PDF
- Reverse-engineer architecture from existing prototype HTML
- Component state machine visual editor
- "讓 AI 決定" with AI-generated suggested page names (just skips per-page Q&A for now)
