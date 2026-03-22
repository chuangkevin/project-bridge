## 1. 資料庫與後端基礎

- [x] 1.1 建立 migration：建立 `page_element_mappings` 表（id, project_id, bridge_id, page_name, navigation_target, arch_component_id, created_at, updated_at, UNIQUE(project_id, bridge_id)）
- [x] 1.2 擴充 ArchEdge TypeScript 介面：新增 `triggerBridgeId: string | null` 和 `triggerLabel: string | null` 欄位
- [x] 1.3 實作 GET /api/projects/:id/page-mappings route，回傳該專案所有 mapping
- [x] 1.4 實作 PUT /api/projects/:id/page-mappings route，新增/更新/刪除 mapping + 更新 HTML onclick

## 2. 架構圖同步

- [x] 2.1 實作 arch-sync 服務函式：無架構圖時從 data-page 自動建立 ArchNodes（grid layout 排列）
- [x] 2.2 實作 arch-sync 服務函式：根據 mapping 新增/更新/移除 ArchEdges（含 triggerBridgeId, triggerLabel）
- [x] 2.3 在 PUT page-mappings route 中呼叫 arch-sync，儲存 mapping 時自動同步架構圖

## 3. 生成後 mapping 清理

- [x] 3.1 在生成流程（chat.ts）完成後，比對新 HTML 的 bridge_id 集合，刪除不存在的 mapping
- [x] 3.2 清理 mapping 時同步移除對應的 ArchEdge（triggerBridgeId 匹配）
- [x] 3.3 保留的 mapping 重新套用 onclick 到新 HTML

## 4. Bridge Script 擴充

- [ ] 4.1 在 bridgeScript.ts 新增 `page-mapping` mode 支援
- [ ] 4.2 page-mapping mode 下：hover 高亮帶 data-bridge-id 的元素、點選發送 element-selected 事件（含 bridgeId, tag, textContent, pageName）
- [ ] 4.3 點選元素時阻止預設行為（不觸發 onclick 導航）

## 5. 前端 UI — 頁面對應模式

- [ ] 5.1 WorkspacePage.tsx：新增 leftTab='page-mapping' 模式，toolbar 加入「頁面對應」按鈕（無原型時 disabled）
- [ ] 5.2 建立 PageMappingPanel.tsx 元件：左側頁面總覽（從 HTML 解析 data-page，顯示 mapping 數量，點擊切換頁面）
- [ ] 5.3 PageMappingPanel.tsx：右側 mapping 設定面板（元素標籤、導航目標 dropdown、元件身份 dropdown）
- [ ] 5.4 整合 iframe postMessage：進入 page-mapping 模式時切換 bridge mode，接收 element-selected 事件
- [ ] 5.5 儲存按鈕：呼叫 PUT API，更新後刷新左側 mapping 數量和 iframe 預覽

## 6. E2E 測試

- [ ] 6.1 測試：進入頁面對應模式，驗證左側頁面總覽正確顯示
- [ ] 6.2 測試：點選元素，設定導航目標，驗證 HTML onclick 更新
- [ ] 6.3 測試：驗證架構圖同步（mapping 儲存後 ArchEdges 正確建立）
- [ ] 6.4 測試：無架構圖的專案，驗證自動建立 ArchNodes
- [ ] 6.5 測試：重新生成後，驗證 mapping 保留/清理邏輯
