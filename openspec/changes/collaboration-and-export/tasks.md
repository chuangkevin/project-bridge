## 1. 基礎建設：Socket.io 整合

- [x] 1.1 安裝伺服器端依賴：`socket.io`（packages/server）
- [x] 1.2 安裝前端依賴：`socket.io-client`（packages/client）
- [x] 1.3 在 `packages/server/src/index.ts` 中將現有 Express app 綁定至 HTTP Server 實例，整合 Socket.io Server
- [x] 1.4 建立 `packages/server/src/socket/index.ts` 作為 socket 事件處理的進入點，註冊 connection/disconnect 事件
- [x] 1.5 更新 Docker/Nginx 設定，確保 WebSocket upgrade 連線正確轉發

## 2. 房間管理與在線狀態

- [x] 2.1 實作 `join-room` 事件處理：根據 projectId 將 socket 加入對應房間，分配使用者色彩
- [x] 2.2 實作 `leave-room` 事件處理：將 socket 從房間移除
- [x] 2.3 實作 `disconnect` 事件處理：清理斷線使用者的房間成員資格
- [x] 2.4 建立房間狀態管理模組（`packages/server/src/socket/roomManager.ts`）：追蹤每個房間的成員列表與色彩分配
- [x] 2.5 實作 `presence-update` 事件廣播：當成員加入或離開時，向房間所有成員發送更新後的使用者列表
- [x] 2.6 處理同一使用者多分頁場景：在線狀態列表中去重顯示

## 3. 前端 Socket 連線與協作 Context

- [x] 3.1 建立 `packages/client/src/contexts/SocketContext.tsx`：管理 Socket.io 連線生命週期（進入專案頁連線、離開斷線）
- [x] 3.2 建立 `packages/client/src/contexts/CollaborationContext.tsx`：管理協作狀態（游標、在線狀態、生成鎖定）
- [x] 3.3 在專案頁面掛載 SocketContext 與 CollaborationContext Provider
- [x] 3.4 實作自動重連後重新加入房間的邏輯

## 4. 游標同步

- [x] 4.1 實作前端游標位置捕捉與 50ms 節流發送（`cursor-move` 事件）
- [x] 4.2 實作伺服器端 `cursor-move` 事件轉發（廣播至房間其他成員）
- [x] 4.3 建立 `packages/client/src/components/CursorLayer.tsx`：在原型預覽區域以 overlay 方式顯示其他使用者游標
- [x] 4.4 實作游標標記元件：顯示使用者名稱標籤與自動分配色彩
- [x] 4.5 實作使用者離開時移除對應游標標記

## 5. 在線狀態 UI

- [x] 5.1 建立 `packages/client/src/components/PresenceBar.tsx`：在專案頁面 header 顯示在線使用者頭像/名稱首字母圓形標記
- [x] 5.2 接收 `presence-update` 事件並即時更新在線狀態列表
- [x] 5.3 為每位使用者顯示自動分配的識別色彩

## 6. 標注即時同步

- [x] 6.1 實作前端標注操作（新增/編輯/刪除）的樂觀更新與 `annotation-change` 事件發送
- [x] 6.2 實作伺服器端 `annotation-change` 事件處理：寫入資料庫並廣播至房間其他成員
- [x] 6.3 實作前端接收 `annotation-change` 事件後更新本地標注狀態
- [x] 6.4 實作 Last Write Wins 衝突解決：伺服器以最後收到的變更為準

## 7. AI 生成鎖定機制

- [x] 7.1 建立 `packages/server/src/socket/generationLock.ts`：伺服器端生成鎖定管理（記憶體內鎖定，記錄持有者與時間戳）
- [x] 7.2 實作 `generation-lock` 事件處理：acquire（取得鎖定）與 release（釋放鎖定）
- [x] 7.3 實作 `generation-lock-update` 廣播：鎖定狀態變更時通知房間所有成員
- [x] 7.4 實作 5 分鐘超時自動釋放鎖定機制
- [x] 7.5 實作使用者斷線時自動釋放其持有的鎖定
- [x] 7.6 前端整合：AI 生成按鈕根據鎖定狀態顯示停用狀態與「使用者 X 正在生成中...」提示
- [x] 7.7 前端整合：觸發生成前先嘗試取得鎖定，被拒絕時顯示提示訊息

## 8. Figma 匯出端點

- [x] 8.1 建立 `packages/server/src/services/figmaExport.ts`：HTML 解析為結構化節點樹的核心邏輯
- [x] 8.2 實作 HTML 區塊元素（div 等）解析為 Frame/Rectangle 節點，包含位置與尺寸
- [x] 8.3 實作文字元素（p, h1~h6, span 等）解析為 Text 節點，包含字型樣式
- [x] 8.4 實作 CSS 樣式提取：背景色、邊框、圓角、陰影等轉換為 Figma 屬性格式（fills 陣列、cornerRadius 等）
- [x] 8.5 實作色彩值轉換：CSS RGB（0-255）轉為 Figma 格式（0-1 浮點數）
- [x] 8.6 建立路由：`POST /api/projects/:id/export-figma`
- [x] 8.7 實作匯出端點的錯誤處理：專案不存在回傳 404、無原型內容回傳 400
- [x] 8.8 組裝完整 Figma JSON 輸出結構：Document → Page → Frame → 子節點階層

## 9. 測試與驗證

- [x] 9.1 API 測試：Socket.io polling handshake 連線驗證
- [x] 9.2 API 測試：Figma export endpoint（404/400 錯誤情境）
- [x] 9.3 API 測試：Figma component export 驗證
- [x] 9.4 E2E 測試：PresenceBar 顯示
- [x] 9.5 E2E 測試：Chat 輸入區可用（無鎖定時）
- [x] 9.6 E2E 測試：協作 context mount/unmount 穩定性
- [x] 9.7 E2E 測試：Figma 匯出按鈕
