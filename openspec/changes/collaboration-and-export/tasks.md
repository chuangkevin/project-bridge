## 1. 基礎建設：Socket.io 整合

- [ ] 1.1 安裝伺服器端依賴：`socket.io`（packages/server）
- [ ] 1.2 安裝前端依賴：`socket.io-client`（packages/client）
- [ ] 1.3 在 `packages/server/src/index.ts` 中將現有 Express app 綁定至 HTTP Server 實例，整合 Socket.io Server
- [ ] 1.4 建立 `packages/server/src/socket/index.ts` 作為 socket 事件處理的進入點，註冊 connection/disconnect 事件
- [ ] 1.5 更新 Docker/Nginx 設定，確保 WebSocket upgrade 連線正確轉發

## 2. 房間管理與在線狀態

- [ ] 2.1 實作 `join-room` 事件處理：根據 projectId 將 socket 加入對應房間，分配使用者色彩
- [ ] 2.2 實作 `leave-room` 事件處理：將 socket 從房間移除
- [ ] 2.3 實作 `disconnect` 事件處理：清理斷線使用者的房間成員資格
- [ ] 2.4 建立房間狀態管理模組（`packages/server/src/socket/roomManager.ts`）：追蹤每個房間的成員列表與色彩分配
- [ ] 2.5 實作 `presence-update` 事件廣播：當成員加入或離開時，向房間所有成員發送更新後的使用者列表
- [ ] 2.6 處理同一使用者多分頁場景：在線狀態列表中去重顯示

## 3. 前端 Socket 連線與協作 Context

- [ ] 3.1 建立 `packages/client/src/contexts/SocketContext.tsx`：管理 Socket.io 連線生命週期（進入專案頁連線、離開斷線）
- [ ] 3.2 建立 `packages/client/src/contexts/CollaborationContext.tsx`：管理協作狀態（游標、在線狀態、生成鎖定）
- [ ] 3.3 在專案頁面掛載 SocketContext 與 CollaborationContext Provider
- [ ] 3.4 實作自動重連後重新加入房間的邏輯

## 4. 游標同步

- [ ] 4.1 實作前端游標位置捕捉與 50ms 節流發送（`cursor-move` 事件）
- [ ] 4.2 實作伺服器端 `cursor-move` 事件轉發（廣播至房間其他成員）
- [ ] 4.3 建立 `packages/client/src/components/CursorLayer.tsx`：在原型預覽區域以 overlay 方式顯示其他使用者游標
- [ ] 4.4 實作游標標記元件：顯示使用者名稱標籤與自動分配色彩
- [ ] 4.5 實作使用者離開時移除對應游標標記

## 5. 在線狀態 UI

- [ ] 5.1 建立 `packages/client/src/components/PresenceBar.tsx`：在專案頁面 header 顯示在線使用者頭像/名稱首字母圓形標記
- [ ] 5.2 接收 `presence-update` 事件並即時更新在線狀態列表
- [ ] 5.3 為每位使用者顯示自動分配的識別色彩

## 6. 標注即時同步

- [ ] 6.1 實作前端標注操作（新增/編輯/刪除）的樂觀更新與 `annotation-change` 事件發送
- [ ] 6.2 實作伺服器端 `annotation-change` 事件處理：寫入資料庫並廣播至房間其他成員
- [ ] 6.3 實作前端接收 `annotation-change` 事件後更新本地標注狀態
- [ ] 6.4 實作 Last Write Wins 衝突解決：伺服器以最後收到的變更為準

## 7. AI 生成鎖定機制

- [ ] 7.1 建立 `packages/server/src/socket/generationLock.ts`：伺服器端生成鎖定管理（記憶體內鎖定，記錄持有者與時間戳）
- [ ] 7.2 實作 `generation-lock` 事件處理：acquire（取得鎖定）與 release（釋放鎖定）
- [ ] 7.3 實作 `generation-lock-update` 廣播：鎖定狀態變更時通知房間所有成員
- [ ] 7.4 實作 5 分鐘超時自動釋放鎖定機制
- [ ] 7.5 實作使用者斷線時自動釋放其持有的鎖定
- [ ] 7.6 前端整合：AI 生成按鈕根據鎖定狀態顯示停用狀態與「使用者 X 正在生成中...」提示
- [ ] 7.7 前端整合：觸發生成前先嘗試取得鎖定，被拒絕時顯示提示訊息

## 8. Figma 匯出端點

- [ ] 8.1 建立 `packages/server/src/services/figmaExport.ts`：HTML 解析為結構化節點樹的核心邏輯
- [ ] 8.2 實作 HTML 區塊元素（div 等）解析為 Frame/Rectangle 節點，包含位置與尺寸
- [ ] 8.3 實作文字元素（p, h1~h6, span 等）解析為 Text 節點，包含字型樣式
- [ ] 8.4 實作 CSS 樣式提取：背景色、邊框、圓角、陰影等轉換為 Figma 屬性格式（fills 陣列、cornerRadius 等）
- [ ] 8.5 實作色彩值轉換：CSS RGB（0-255）轉為 Figma 格式（0-1 浮點數）
- [ ] 8.6 建立 `packages/server/src/routes/figmaExport.ts`：`POST /api/projects/:id/export-figma` 路由
- [ ] 8.7 實作匯出端點的錯誤處理：專案不存在回傳 404、無原型內容回傳 400
- [ ] 8.8 組裝完整 Figma JSON 輸出結構：Document → Page → Frame → 子節點階層

## 9. 測試與驗證

- [ ] 9.1 撰寫 Socket.io 連線管理與房間管理的單元測試
- [ ] 9.2 撰寫游標同步事件的整合測試
- [ ] 9.3 撰寫標注同步與 Last Write Wins 的整合測試
- [ ] 9.4 撰寫 AI 生成鎖定機制的單元測試（取得/釋放/超時/斷線）
- [ ] 9.5 撰寫 Figma 匯出端點的單元測試（成功匯出、404、400 錯誤情境）
- [ ] 9.6 撰寫 HTML 解析為 Figma JSON 的單元測試（各種節點類型與樣式轉換）
- [ ] 9.7 多使用者協作的端對端測試（使用 packages/e2e）
