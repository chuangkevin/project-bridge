## Why

Project Bridge 目前的 AI 生成流程缺乏智慧輔助與品質管理機制。使用者需要手動撰寫所有提示詞、手動設定 API 綁定的資料結構，且無法評估生成結果的品質。當多人同時使用時，直接呼叫 Gemini API 也容易造成速率限制問題。此變更引入一套 AI 智慧增強套件，提升生成品質、降低使用門檻、並確保系統在多人使用下的穩定性。

## What Changes

- **API 標註 AI 推薦**：在 ApiBindingPanel 中新增「AI 推薦」按鈕，透過 Gemini 分析頁面上下文，自動建議 request/response body schema
- **Skill 管理系統**：新增領域知識文件（Skills）管理功能，包含觸發關鍵字，AI Agent 分析使用者輸入後決定注入哪些 skills 至系統提示詞
- **生成品質評分**：AI 生成原型後自動評估品質（HTML 有效性、無障礙性、響應式設計、設計一致性），在版本歷史中顯示評分徽章
- **提示詞模板庫**：提供預建模板（表單、儀表板、著陸頁等），使用者可在對話時選擇模板自動填入提示詞，管理員可建立自訂模板
- **設計規格文件自動產生**：從原型及其標註、約束、API 綁定生成完整 PRD 文件，支援 Markdown 及 PDF 匯出
- **生成任務佇列**：以記憶體內佇列取代直接 API 呼叫，防止多人同時生成時的 API 過載，顯示佇列位置與預估等待時間

## Capabilities

### New Capabilities

- `api-ai-recommendation`：AI 分析頁面上下文並建議 API request/response schema
- `skill-management`：領域知識文件的 CRUD 管理、觸發機制與系統提示詞注入
- `generation-quality-score`：生成結果的自動品質評分與徽章顯示
- `prompt-template-library`：提示詞模板的管理與選用機制
- `design-spec-export`：從原型自動產生設計規格文件並匯出
- `generation-task-queue`：AI 生成請求的佇列管理與並行控制

### Modified Capabilities

（無需修改現有 spec 層級的行為）

## Impact

- **前端**：新增 SkillManagementPage、PromptTemplateSelector、QueueStatusIndicator 等元件；修改 ApiBindingPanel、ChatInput、VersionHistory 元件
- **後端**：新增 skills、prompt_templates 資料表；新增 /api/skills、/api/prompt-templates、/api/design-spec、/api/queue 等 API 路由；修改 AI 生成流程加入佇列與品質評分
- **資料庫**：新增 skills、prompt_templates 資料表；generation_versions 表新增 quality_score 欄位
- **外部依賴**：增加 Gemini API 呼叫量（品質評分、API 推薦各為額外呼叫）
- **效能**：佇列系統需管理並行數；品質評分為非同步非阻塞
