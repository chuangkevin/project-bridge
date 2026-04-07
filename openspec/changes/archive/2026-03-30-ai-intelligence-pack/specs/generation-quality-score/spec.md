## ADDED Requirements

### Requirement: 生成後自動品質評分

系統 SHALL 在 AI 完成原型生成後，自動以獨立的 Gemini API 呼叫評估生成品質。評分為非同步執行，不阻塞使用者操作。

#### Scenario: 生成完成後觸發品質評分

- **WHEN** AI 成功生成原型 HTML
- **THEN** 系統 SHALL 自動將品質評分任務加入佇列
- **THEN** 使用者 SHALL 立即看到生成結果，無需等待評分完成

#### Scenario: 評分非同步完成

- **WHEN** 品質評分任務從佇列中取出執行
- **THEN** 系統 SHALL 呼叫 Gemini API 分析生成的 HTML
- **THEN** 評分結果 SHALL 儲存至 generation_versions 表的 quality_score 欄位

### Requirement: 品質評分維度

系統 SHALL 依以下四個維度進行評分，每個維度分數為 0-100：HTML 有效性（html）、無障礙性（a11y）、響應式設計（responsive）、設計一致性（design）。系統 SHALL 計算加權平均作為總分（overall）。

#### Scenario: 完整評分結果格式

- **WHEN** 品質評分完成
- **THEN** quality_score 欄位 SHALL 包含 JSON 格式：`{html: number, a11y: number, responsive: number, design: number, overall: number}`
- **THEN** 每個維度分數 SHALL 為 0 至 100 的整數

#### Scenario: 評分 API 呼叫失敗

- **WHEN** Gemini API 評分呼叫失敗
- **THEN** quality_score SHALL 保持為 null
- **THEN** 系統 SHALL 記錄錯誤日誌
- **THEN** 生成結果 SHALL 不受影響

### Requirement: 版本歷史顯示評分徽章

系統 SHALL 在原型版本歷史列表中，以徽章形式顯示每個版本的品質評分。

#### Scenario: 顯示評分徽章

- **WHEN** 使用者查看版本歷史列表且該版本有 quality_score
- **THEN** 系統 SHALL 在該版本項目上顯示評分徽章
- **THEN** 徽章 SHALL 顯示 overall 分數
- **THEN** 徽章顏色 SHALL 依分數區間變化：80-100 綠色、60-79 黃色、0-59 紅色

#### Scenario: 評分尚未完成時顯示

- **WHEN** 版本的品質評分尚在進行中（quality_score 為 null）
- **THEN** 系統 SHALL 顯示「評分中...」或載入指示器

#### Scenario: 點擊徽章查看詳細評分

- **WHEN** 使用者點擊評分徽章
- **THEN** 系統 SHALL 展開顯示四個維度的個別分數

### Requirement: 品質評分 API

系統 SHALL 提供 API 端點查詢版本的品質評分。

#### Scenario: 查詢版本品質評分

- **WHEN** 發送 GET /api/generations/:id/quality-score 請求
- **THEN** 系統 SHALL 回傳該版本的 quality_score 資料

#### Scenario: 查詢尚無評分的版本

- **WHEN** 查詢 quality_score 為 null 的版本
- **THEN** 系統 SHALL 回傳 `{status: "pending"}` 表示評分進行中
