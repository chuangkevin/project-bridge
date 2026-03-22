## Context

目前 project-bridge 的資料流是單向的：架構圖 → 生成 prompt → HTML 原型。生成後的導航對應（哪個按鈕跳到哪頁）由 AI 決定，使用者無法修正。現有的 bridge script 已支援多種互動模式（annotation、api-binding、visual-edit），可以擴充。ArchEdge 目前只有 source/target/label，不追蹤是哪個元素觸發的導航。

## Goals / Non-Goals

**Goals:**
- 使用者能在生成後的原型上，點選任意元素設定導航目標
- 左側頁面總覽顯示所有 data-page，支援頁面切換
- Mapping 持久化到 DB，重新生成時智能保留/清理
- 自動同步回架構圖（建立/更新 ArchNodes 和 ArchEdges）
- 無架構圖的專案也能使用（自動從 data-page 建立架構）

**Non-Goals:**
- 不處理元素間的非導航關係（如資料綁定）
- 不做拖拉式的視覺連線（用 dropdown 選擇即可）
- 不修改架構圖 UI 本身（只透過 API 同步資料）
- 不處理跨專案的 mapping

## Decisions

### 1. 頁面對應作為獨立的 leftTab 模式

**選擇**: 在 WorkspacePage 新增 `leftTab = 'page-mapping'`，而非整合到現有的編輯模式。

**理由**: 導航 mapping 是結構性操作，跟樣式編輯（visual-edit）和標記（annotation）的心智模型不同。獨立模式可以有專屬的左側面板（頁面總覽）和右側面板（mapping 設定），不干擾現有功能。

**替代方案**: 整合到 visual-edit mode — 但那樣右側面板會同時顯示樣式和 mapping，過於複雜。

### 2. 頁面列表以 data-page 為 source of truth

**選擇**: 從 HTML 的 `data-page` 屬性解析頁面列表，而非從架構圖的 ArchNodes 取。

**理由**: `data-page` 是實際生成的結果，永遠反映當前原型的真實頁面。架構圖可能尚未建立（對話生成的專案），或是 AI 生成的頁面名稱略有不同。以 data-page 為準可以確保左側總覽 100% 對應中間預覽。

### 3. Bridge script 新增 page-mapping-mode

**選擇**: 在 bridgeScript.ts 新增獨立的 `page-mapping-mode`，點選元素時回傳 bridge_id、tag、textContent、所屬 data-page。

**理由**: 不同於 visual-edit-mode（需要 resize/drag）或 annotation-mode（需要新增標記），page-mapping-mode 只需要簡單的點選 + 元素資訊回傳。獨立模式避免模式切換的副作用。

### 4. Mapping 儲存策略

**選擇**: 新增 `page_element_mappings` DB 表，同時更新 HTML 的 onclick。

**理由**:
- DB 表：持久化 mapping 關係，支援查詢、批量操作、清理
- HTML onclick：讓原型預覽立即反映導航行為，不需額外 runtime

**表結構**:
```sql
CREATE TABLE page_element_mappings (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  bridge_id TEXT NOT NULL,
  page_name TEXT NOT NULL,
  navigation_target TEXT,
  arch_component_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(project_id, bridge_id)
);
```

### 5. 架構圖同步策略

**選擇**: 儲存 mapping 時，後端自動同步 arch_data JSON。

**流程**:
1. 讀取目前的 arch_data
2. 如果 arch_data 為空：從 data-page 列表建立 ArchNodes（auto-layout grid），建立空的 edges
3. 根據 mapping 的 navigation_target，建立/更新 ArchEdges
4. ArchEdge 新增 `triggerBridgeId` 和 `triggerLabel` 欄位
5. 寫回 arch_data

**多對多**: 一個頁面可以有多條 edge 到不同目標（不同元素觸發），同一個 source-target pair 也可以有多條 edge（不同觸發元素）。Edge 的唯一性由 `source + target + triggerBridgeId` 決定。

### 6. 重新生成後的 mapping 清理

**選擇**: 生成新原型後，比對新 HTML 中的 bridge_id 集合，移除不存在的 mapping。

**流程**:
1. 生成完成後，從新 HTML 提取所有 bridge_id
2. 查詢該專案的所有 mapping
3. bridge_id 仍存在 → 保留（並重新套用 onclick 到新 HTML）
4. bridge_id 不存在 → 刪除 mapping + 刪除對應的 ArchEdge

## Risks / Trade-offs

- **bridge_id 不穩定**: 每次生成的 bridge_id 可能不同，導致 mapping 全部失效 → 緩解：提供「重新對應」的 UI 提示，告知使用者哪些 mapping 已失效
- **架構圖自動同步可能產生大量 edges**: 一個頁面有很多按鈕時 → 緩解：架構圖 UI 已支援多條 edge 顯示，ReactFlow 處理得來
- **HTML onclick 注入可能與 AI 生成的 onclick 衝突**: → 緩解：更新時先移除舊的 showPage onclick，再注入新的
