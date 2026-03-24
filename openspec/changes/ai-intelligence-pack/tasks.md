## 1. 資料庫與基礎設施

- [ ] 1.1 建立 skills 資料表（id, name, triggers, content, scope, project_id, created_by, created_at, updated_at）
- [ ] 1.2 建立 prompt_templates 資料表（id, name, category, content, is_system, created_by, created_at, updated_at）
- [ ] 1.3 修改 generation_versions 表新增 quality_score 欄位（TEXT, nullable）
- [ ] 1.4 建立系統預設提示詞模板 seed data（form, dashboard, landing, list, detail）

## 2. 生成任務佇列（generation-task-queue）

- [ ] 2.1 實作 GenerationQueue 類別：記憶體內佇列、任務排序、狀態管理（pending/processing/completed/failed）
- [ ] 2.2 實作可設定的並行控制（預設為 API key 數量）
- [ ] 2.3 實作預估等待時間計算（平均生成時間 × 前方任務數）
- [ ] 2.4 建立 GET /api/queue/status 端點：回傳 pending 數、processing 數、並行上限、平均生成時間
- [ ] 2.5 建立 GET /api/queue/tasks/:taskId 端點：回傳任務狀態、佇列位置、預估等待時間
- [ ] 2.6 修改現有 AI 生成流程，將直接 API 呼叫改為透過佇列處理
- [ ] 2.7 實作前端 QueueStatusIndicator 元件：顯示佇列狀態、排隊位置、預估時間
- [ ] 2.8 整合 QueueStatusIndicator 至主要版面

## 3. Skill 管理系統（skill-management）

- [x] 3.1 建立 /api/skills CRUD 路由（GET 清單、GET 依專案過濾、POST 建立、PUT 更新、DELETE 刪除）
- [x] 3.2 實作 admin 權限檢查中介層（POST/PUT/DELETE 限 admin）
- [ ] 3.3 實作 AI Agent skill 觸發邏輯：關鍵字匹配 + Gemini 語意分析
- [x] 3.4 實作 skill 內容注入系統提示詞（上限 5 個、分隔標記）
- [x] 3.5 建立前端 SkillManagement UI（在 SettingsPage 中）
- [x] 3.6 實作 skill CRUD 表單元件（名稱、說明、Markdown 內容、scope 選擇）
- [x] 3.7 實作 skill 清單元件（含啟用/停用、編輯、刪除確認）
- [x] 3.8 實作 SKILLS_DIR 環境變數自動匯入外部 skill 檔案

## 4. API 標註 AI 推薦（api-ai-recommendation）

- [ ] 4.1 建立 POST /api/ai-recommendation/api-schema 端點：接收頁面上下文、回傳建議 schema
- [ ] 4.2 實作 Gemini 提示詞：分析頁面 HTML + 元素資訊 + 標註，產生 request/response schema
- [ ] 4.3 在 ApiBindingPanel 新增「AI 推薦」按鈕
- [ ] 4.4 實作推薦結果預覽面板（可編輯 JSON、套用/取消按鈕）
- [ ] 4.5 實作載入狀態與錯誤處理
- [ ] 4.6 實作無頁面內容時按鈕停用邏輯

## 5. 生成品質評分（generation-quality-score）

- [ ] 5.1 實作品質評分 Gemini 提示詞（HTML 有效性、無障礙性、響應式設計、設計一致性四維度）
- [ ] 5.2 實作非同步評分流程：生成完成後將評分任務加入佇列
- [ ] 5.3 實作評分結果儲存至 generation_versions.quality_score
- [ ] 5.4 建立 GET /api/generations/:id/quality-score 端點
- [ ] 5.5 實作版本歷史評分徽章元件（顏色：綠/黃/紅、點擊展開詳細）
- [ ] 5.6 整合評分徽章至版本歷史列表元件
- [ ] 5.7 實作評分中載入狀態（前端輪詢或 WebSocket）

## 6. 提示詞模板庫（prompt-template-library）

- [ ] 6.1 建立 /api/prompt-templates CRUD 路由（GET 清單含分類過濾、POST 建立、PUT 更新、DELETE 刪除）
- [ ] 6.2 實作系統模板保護（is_system = true 不可刪除）
- [ ] 6.3 實作 admin 權限檢查（POST/PUT/DELETE 限 admin）
- [ ] 6.4 建立前端 PromptTemplateSelector 元件（書本圖示按鈕、分類清單、模板預覽）
- [ ] 6.5 實作選擇模板後自動填入 ChatInput（附加模式、佔位符高亮）
- [ ] 6.6 整合 PromptTemplateSelector 至 ChatInput 元件旁

## 7. 設計規格文件匯出（design-spec-export）

- [ ] 7.1 實作專案資料收集邏輯：頁面清單、元素規格、標註、約束、API 綁定、設計 token
- [ ] 7.2 實作 Gemini PRD 生成提示詞（結構化文件格式）
- [ ] 7.3 建立 POST /api/design-spec/generate 端點：回傳 Markdown PRD
- [ ] 7.4 建立 POST /api/design-spec/export-pdf 端點：Markdown → HTML → PDF 轉換
- [ ] 7.5 新增 PDF 轉換依賴套件（puppeteer 或替代方案）
- [ ] 7.6 建立前端匯出按鈕與對話框（選擇 Markdown/PDF 格式）
- [ ] 7.7 實作匯出進度顯示與錯誤處理（PDF 失敗時建議改用 Markdown）

## 8. 整合測試與收尾

- [ ] 8.1 測試佇列系統在高並行下的行為
- [ ] 8.2 測試 skill 觸發機制（關鍵字匹配 + 語意分析）
- [ ] 8.3 測試品質評分非同步流程（生成完成 → 評分入列 → 結果更新）
- [ ] 8.4 測試所有 admin 權限限制的 API 端點
- [ ] 8.5 測試 PDF 匯出在不同內容量下的表現
- [ ] 8.6 確認所有新增路由的錯誤處理與邊界情況
