## Why

生成 UI 原型後，使用者無法修正元素與頁面之間的導航對應關係。目前架構圖 → 生成是單向的，生成結果的導航可能不正確，也沒有事後修正的機制。需要一個「頁面對應」模式，讓使用者能直接在原型上點選元素、設定導航目標，並自動同步回架構圖。

## What Changes

- 新增「頁面對應」UI 模式（leftTab），與現有對話/設計/樣式並列
- 左側面板顯示所有頁面總覽（從 `data-page` 解析），點擊切換預覽頁面
- 點選原型中的元素後，可設定該元素的導航目標（跳到哪個頁面）和元件身份（對應 ArchComponent）
- 儲存 mapping 後，自動更新 HTML 的 `onclick` → `showPage('目標頁')`
- 儲存 mapping 後，自動同步回架構圖：新增/更新 ArchEdges（支援多對多）
- 沒有架構圖的專案（對話生成），自動根據 `data-page` 建立 ArchNodes + ArchEdges
- ArchEdge 資料模型擴充：新增 `triggerBridgeId` 和 `triggerLabel` 欄位
- 新增 `page_element_mappings` 資料表持久化 mapping 資料
- 重新生成時，bridge_id 還存在的 mapping 保留，消失的自動清理
- Bridge script 新增 `page-mapping-mode`

## Capabilities

### New Capabilities
- `page-mapping-ui`: 頁面對應模式的前端 UI（左側頁面總覽、中間 iframe 互動、右側 mapping 設定面板）
- `page-mapping-persistence`: 後端 API 與資料庫，持久化 mapping 資料、更新 HTML onclick、清理失效 mapping
- `arch-sync`: 從 mapping 同步回架構圖（自動建立/更新 ArchNodes 和 ArchEdges，支援多對多）

### Modified Capabilities
（無既有 spec 需修改）

## Impact

- **前端**: WorkspacePage.tsx（新增 tab）、bridgeScript.ts（新增 mode）、useArchStore.ts（ArchEdge 擴充）、新元件 PageMappingPanel.tsx
- **後端**: 新 migration（page_element_mappings 表）、新 routes（GET/PUT /api/projects/:id/page-mappings）、修改 architecture PATCH 支援 trigger 欄位
- **資料模型**: ArchEdge 介面擴充、新增 DB 表
- **生成流程**: 生成後比對舊 mapping 的 bridge_id，清理失效記錄
