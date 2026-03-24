## 1. 依賴安裝

- [ ] 1.1 安裝 prism-react-renderer：`pnpm add --filter client prism-react-renderer`

## 2. CodePanel 元件

- [ ] 2.1 建立 `packages/client/src/components/CodePanel.tsx` — 基礎 layout（語法高亮 + 行號 + 捲動）
- [ ] 2.2 實作 HTML/CSS/JS 語法高亮（使用 prism-react-renderer + html language）
- [ ] 2.3 實作一鍵複製按鈕（複製完整 HTML 或當前頁面）+ "已複製" toast
- [ ] 2.4 實作 Ctrl+F 搜尋功能（搜尋欄 + 高亮匹配文字 + 上/下導航）
- [ ] 2.5 多頁面支援：解析 `<!-- PAGE: name -->` 標記，頁面 tabs 切換捲動到對應區段

## 3. CodeFileTree 元件

- [ ] 3.1 建立 `packages/client/src/components/CodeFileTree.tsx` — 檔案結構樹
- [ ] 3.2 解析多頁面 HTML 產生虛擬檔案結構（pages/, styles, scripts）
- [ ] 3.3 點擊節點通知 CodePanel 捲動到對應區段
- [ ] 3.4 單頁面時自動隱藏

## 4. WorkspacePage 整合

- [ ] 4.1 在 preview 區域新增 Preview / Code 切換按鈕（👁 / </>）
- [ ] 4.2 Code 模式時顯示 CodeFileTree（多頁面）+ CodePanel
- [ ] 4.3 Preview 模式時維持現有 iframe 行為
- [ ] 4.4 Code view 的頁面 tabs 與 Preview 的頁面 tabs 同步

## 5. 效能與邊界處理

- [ ] 5.1 超過 5000 行的 HTML 降級為純文字顯示（不做語法高亮）
- [ ] 5.2 空 prototype（無 HTML）時顯示空狀態提示

## 6. 測試

- [ ] 6.1 E2E 測試：切換 Preview / Code tab
- [ ] 6.2 E2E 測試：複製程式碼按鈕
- [ ] 6.3 E2E 測試：多頁面檔案樹導航
