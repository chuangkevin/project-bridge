# Architecture Mode — Design Spec

**Date:** 2026-03-18
**Status:** Approved

---

## Problem

Users currently start generating UI prototypes without defining the information architecture upfront. This leads to:
- AI guessing how many pages to create and how they connect
- No visual map of page relationships
- Each page's reference design (if any) gets lost or applied globally instead of per-page
- Designers have to describe the same structural context repeatedly in chat

---

## Solution

Add an **Architecture Mode** — a separate full-page tab in the project view where users define the structure of their app/component before (and during) generation. A conversational wizard captures the structure; a visual flowchart persists it; both feed into AI generation.

---

## Approach: Conversational → Visual (Hybrid)

AI-guided Q&A initialises the architecture. The result auto-generates an editable flowchart. Users can modify the chart directly at any time. Architecture data is injected into every AI generation prompt.

---

## UI Entry Points

### Tab Bar (added to project view)
```
[ Design ]  [ Architecture ]
```

- **Design tab** — existing ChatPanel + PreviewPanel + panels
- **Architecture tab** — new full-page mode

### When Architecture Tab is Opened

| Condition | Behaviour |
|---|---|
| New project (first time) | Auto-navigate to Architecture tab after naming; launch wizard |
| Existing project, never configured | Show empty state with "設定架構" CTA button |
| Existing project, already configured | Show flowchart directly; "重新引導" button in top-right |

---

## Wizard (Setup Q&A)

### Design Principles
- One question per card, centred in the tab
- User answers by **clicking buttons** (no typing required, except for custom names)
- Card animates up on answer, next card slides in (Typeform-style)
- Progress indicator at top (e.g. step 3/6)
- Can be exited early; partial data is saved

### Page Flow — Question Sequence

```
Q1: 你想設計的是？
    [頁面（網站 / App）]  [元件（單一 UI 元件）]

── if 頁面 ──

Q2: 類型？
    [網站]  [App]  [Dashboard]  [其他]

Q3: 大概有幾個頁面？
    [1]  [2–3]  [4–6]  [7+]  [讓 AI 決定]

Q4…Qn (per page): 頁面 N — 「{page name}」
    - 名稱輸入（預設選項：首頁 / 列表頁 / 詳細頁 / 登入頁 / 自訂）
    - 參考圖上傳區（拖拉 or 點擊上傳，支援 jpg/png/pdf）
    - 貼上截圖（Ctrl+V 直接貼入）
    - 連到哪些頁面？（勾選已存在頁面 + [+ 新增頁面]）

Q_last: 架構完成！
    [先看架構圖]  [直接開始生成]
```

### Component Flow — Question Sequence

```
Q1: 你想設計的是？
    → [元件]

Q2: 元件名稱？
    [Button]  [Card]  [Form]  [Modal]  [自訂...]

Q3: 有哪些互動點？（多選）
    [主要按鈕]  [次要按鈕]  [輸入框]  [關閉]  [自訂...]

Q4 (per interaction): 點了「{interaction}」會發生什麼？
    [顯示/隱藏內容]  [跳轉頁面]  [送出表單]
    [顯示 loading]  [顯示成功]  [顯示錯誤]  [自訂...]

Q5: 元件有哪些狀態？（可略過）
    [預設]  [hover]  [loading]  [success]  [error]  [略過]

Q_last: 完成！
    [先看架構圖]  [直接開始生成]
```

---

## Flowchart (Visual Node Editor)

### Library
**React Flow** (`@xyflow/react`) — lightweight, customisable nodes, built-in drag-to-connect handles. No custom canvas engine needed.

### Node Types

**PageNode**
```
┌────────────────────────┐
│  [縮圖 or 頁面 icon]    │  ← 16:9, 參考圖縮圖或預設 icon
│                        │
│  首頁                   │  ← 點兩下改名
│  [+ 參考圖]  [貼上]     │  ← 新增 / 更換參考圖
└────────────────────────┘
```

**ComponentNode**
```
┌────────────────────────┐
│  ⬡  Button             │
│  states: default/hover │
└────────────────────────┘
```

### Connection (Edge) Behaviour
- Drag from right-side handle → connect to another node
- Click edge label (double-click) to edit label (e.g. "點擊登入")
- Edges are directional arrows

### Node Context Menu (right-click)
- 改名
- 刪除
- 換參考圖
- 查看此頁面生成結果（切回 Design tab，定位到該頁面）

### Toolbar (top of Architecture tab)
```
[ + 新增頁面 ]  [ 自動排列 ]  [ 重新引導 ]         [ 開始生成 ▶ ]
```

---

## Per-Page Reference Images

### Upload Methods
1. **File picker** — click "上傳參考圖" button on node; accepts jpg/png/pdf
2. **Drag & drop** — drag file onto node
3. **Clipboard paste** — Ctrl+V when node is focused; reads `image/png` from clipboard

### Processing
- Uploaded file is stored via existing `/api/projects/:id/upload` endpoint
- File is tagged with `intent = 'design-spec'` and a new `page_name` field
- Visual analysis runs automatically (existing pipeline)
- Thumbnail displayed inside the node once analysis completes

### Scope
- Reference image is **scoped to its page** — injected into AI prompt only when generating that specific page
- If a page has no reference image, falls back to global design spec (existing behaviour)

---

## Data Model

### `projects` table — new columns
```sql
ALTER TABLE projects ADD COLUMN arch_type TEXT;        -- 'page' | 'component' | null
ALTER TABLE projects ADD COLUMN arch_data TEXT;        -- JSON blob (see schema below)
```

### `uploaded_files` table — new column
```sql
ALTER TABLE uploaded_files ADD COLUMN page_name TEXT;  -- which page this file belongs to
```

### `arch_data` JSON Schema
```json
{
  "type": "page",
  "nodes": [
    {
      "id": "node_1",
      "name": "首頁",
      "position": { "x": 100, "y": 200 },
      "referenceFileId": "uuid-or-null"
    }
  ],
  "edges": [
    {
      "id": "edge_1",
      "source": "node_1",
      "target": "node_2",
      "label": "點擊登入"
    }
  ],
  "componentStates": [],
  "interactions": []
}
```

---

## AI Prompt Injection

On every generation in Design tab, `arch_data` is injected into the system prompt:

```
=== APP ARCHITECTURE ===
Type: 多頁面網站
Pages: 首頁, 列表頁, 詳細頁, 登入頁
Navigation:
  首頁 → 列表頁 (點擊搜尋)
  列表頁 → 詳細頁 (點擊卡片)
  詳細頁 → 首頁 (點擊 Logo)

Per-page reference: 列表頁 has uploaded design spec (see DESIGN SPEC below)
================================
```

- Pages without reference images follow global design spec
- Pages with reference images: their visual analysis is injected as a page-scoped design spec block

---

## Backend API Changes

| Method | Path | Purpose |
|---|---|---|
| `PATCH` | `/api/projects/:id/architecture` | Save `arch_type` + `arch_data` |
| `GET` | `/api/projects/:id/architecture` | Load architecture for display |
| `POST` | `/api/projects/:id/upload` | Extended: accepts `page_name` field |

---

## Frontend Components

| Component | Location | Purpose |
|---|---|---|
| `ArchitectureTab.tsx` | `packages/client/src/components/` | Full-page container, tab content |
| `ArchWizard.tsx` | `packages/client/src/components/` | Conversational Q&A wizard |
| `ArchFlowchart.tsx` | `packages/client/src/components/` | React Flow canvas + toolbar |
| `PageNode.tsx` | `packages/client/src/components/` | Custom React Flow node for pages |
| `ComponentNode.tsx` | `packages/client/src/components/` | Custom React Flow node for components |

---

## Testing

Each phase verified with Playwright + Chrome:
1. Wizard flow — new project → Q&A → flowchart generated
2. Reference image — upload + paste screenshot → thumbnail in node
3. Flowchart editing — add node, draw edge, rename, delete
4. Generation integration — arch data injected into prompt, per-page spec applied

---

## Out of Scope (this iteration)

- Real-time collaboration on the flowchart
- Export flowchart as image/PDF
- Auto-generate architecture from an existing prototype (reverse engineering)
- Component state machine visual editor (deferred; text description only for now)
