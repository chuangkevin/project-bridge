# Design: Architecture Component Navigation

## Overview

Expand the architecture flowchart from page-level-only navigation to component-level navigation with stateful UI elements. Each page node gains an expandable component list; each component can define navigation targets and multi-state behavior. The generation prompt upgrades from `Page A -> Page B` to per-component navigation instructions.

## Data Model Changes

### ArchNode expansion (useArchStore.ts)

Add `components` array to `ArchNode`:

```ts
export interface ArchComponent {
  id: string;
  name: string;
  type: 'button' | 'input' | 'select' | 'radio' | 'tab' | 'card' | 'link';
  description: string;
  constraints: {
    type?: string | null;   // e.g. "number", "email", "text"
    min?: number | null;
    max?: number | null;
    pattern?: string | null;
    required?: boolean;
  };
  states: Array<{
    value: string;
    targetPage: string;     // page name (not id)
  }>;
  navigationTo: string | null;  // simple navigation target page name (for button/card/link)
}

export interface ArchNode {
  // ... existing fields ...
  components: ArchComponent[];  // defaults to [] for backward compat
}
```

### Backward Compatibility

- When loading `arch_data` from DB, if a node has no `components` field, treat it as `[]`.
- Server PATCH endpoint accepts the expanded schema transparently (it stores raw JSON).
- No DB migration needed; `arch_data` is a JSON text column.

### Edge Model — No Structural Change

Existing `ArchEdge` (page-to-page) remains. Component-level navigation is stored **inside** the component's `navigationTo` / `states[].targetPage` fields, not as separate edges. This avoids complicating the ReactFlow edge model. Page-level edges continue to work as before for users who don't use components.

## UI Design

### Expandable Component List on ArchPageNode

- Below the page name and viewport toggle, add a collapsible section header: `"元件 (N)"` with a chevron toggle.
- When expanded, shows a compact list of components (icon + name + type badge).
- An `"+ 新增元件"` button at the bottom opens the Component Editor modal.
- Clicking an existing component opens the Component Editor modal in edit mode.
- Each component row has a small `x` button to delete.

### Component Editor Modal

A modal dialog with the following fields:

| Field | Control | Notes |
|-------|---------|-------|
| 名稱 (name) | Text input | Required |
| 類型 (type) | Select dropdown | Options: button, input, select, radio, tab, card, link |
| 描述 (description) | Textarea | Free-form description |
| 導航目標 (navigationTo) | Select dropdown | Lists all page names from archData.nodes; nullable. Only shown for button/card/link types. |
| 限制條件 (constraints) | Conditional fields | Only shown for `input` type. Sub-fields: type (number/text/email), min, max, pattern, required checkbox. |
| 狀態列表 (states) | Repeatable row group | Only shown for select/radio/tab types. Each row: value (text) + targetPage (select from pages). Add/remove rows. |

Modal has "儲存" (save) and "取消" (cancel) buttons.

### Visual Indicators

- Components with `navigationTo` set show a small arrow icon next to their name in the list.
- Components with `states` show the state count badge (e.g. "3 states").
- The component type is shown as a small colored pill/badge.

### Type-to-Icon Mapping

| Type | Icon/Label |
|------|------------|
| button | 🔘 按鈕 |
| input | ✏️ 輸入 |
| select | 📋 下拉 |
| radio | 🔘 單選 |
| tab | 📑 分頁 |
| card | 🃏 卡片 |
| link | 🔗 連結 |

## Server Changes

### architecture.ts

No endpoint changes needed. The PATCH endpoint already stores arbitrary JSON in `arch_data`. The expanded component data flows through transparently.

### chat.ts — architectureBlock Rewrite

The `architectureBlock` generation in `chat.ts` (around line 548-613) must be upgraded:

**Current format:**
```
Pages: 首頁, 搜尋結果頁
Navigation edges:
  首頁 → 搜尋結果頁
Page navigation requirements:
- Page "首頁": clickable elements MUST call showPage('搜尋結果頁')
```

**New format (when components exist):**
```
=== APP ARCHITECTURE ===
Type: 多頁面網站
Pages: 首頁 (手機版), 搜尋結果頁

Page "首頁" components:
  - 搜尋按鈕 [button]: 點擊搜尋物件 → showPage('搜尋結果頁')
  - 類型切換 [tab]: 切換買屋/租屋/社區
    States:
      "買屋" → showPage('買屋列表')
      "租屋" → showPage('租屋列表')
      "社區" → showPage('社區列表')
  - 坪數輸入 [input]: 坪數欄位 (type: number, min: 0, max: 10000)

Page navigation requirements:
- Page "首頁":
  - "搜尋按鈕" (button): onClick → showPage('搜尋結果頁')
  - "類型切換" (tab): stateful — "買屋" → showPage('買屋列表'), "租屋" → showPage('租屋列表'), "社區" → showPage('社區列表')
================================
```

**Fallback behavior:** If a page has no components, fall back to the current edge-based navigation format for that page. This ensures backward compatibility.

### parallelGenerator.ts / masterAgent.ts

These receive `architectureBlock` as a string parameter — no signature changes needed. The improved string content flows through automatically.

## Component Auto-Import from analysis_result

When a page node has an associated reference file (via `referenceFileId`), and that file has an `analysis_result` containing component information, the UI can offer a "從分析結果載入元件" button. This pre-populates the component list from the analysis data. The user can then edit, add, or remove components.

This is a convenience feature and not required for the core flow. Components can always be manually added.

## State Management

Component data lives inside `archData.nodes[i].components` in the Zustand store. All mutations go through the existing `patchArchData` flow, ensuring persistence via the PATCH API. No new store slices or actions needed beyond what `patchArchData` already provides.
