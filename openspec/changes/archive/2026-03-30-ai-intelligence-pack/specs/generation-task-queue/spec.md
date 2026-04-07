## ADDED Requirements

### Requirement: 記憶體內任務佇列

系統 SHALL 使用記憶體內佇列管理所有 AI 生成請求，取代直接 API 呼叫。佇列 SHALL 支援可設定的並行數（預設為可用 API key 數量）。

#### Scenario: 生成請求進入佇列

- **WHEN** 使用者提交 AI 生成請求
- **THEN** 系統 SHALL 建立佇列任務並回傳任務 ID 與佇列位置
- **THEN** 任務狀態 SHALL 為 "pending"

#### Scenario: 佇列依序處理任務

- **WHEN** 佇列中有 pending 任務且未達並行上限
- **THEN** 系統 SHALL 取出最早的任務開始處理
- **THEN** 任務狀態 SHALL 變更為 "processing"

#### Scenario: 達到並行上限時排隊

- **WHEN** 同時處理中的任務數已達並行上限（等於 API key 數量）
- **THEN** 新的任務 SHALL 保持 "pending" 狀態等待
- **THEN** 系統 SHALL 回傳該任務的佇列位置

#### Scenario: 任務完成後釋放位置

- **WHEN** 一個處理中的任務完成（成功或失敗）
- **THEN** 系統 SHALL 自動取出下一個 pending 任務開始處理

#### Scenario: 伺服器重啟佇列清空

- **WHEN** 伺服器重啟
- **THEN** 所有佇列任務 SHALL 被清除
- **THEN** 使用者需重新提交生成請求

### Requirement: 佇列位置與預估等待時間

系統 SHALL 向使用者顯示其任務在佇列中的位置與預估等待時間。

#### Scenario: 顯示佇列位置

- **WHEN** 使用者的任務在佇列中等待
- **THEN** 系統 SHALL 顯示「排隊中，前方還有 N 個任務」

#### Scenario: 計算預估等待時間

- **WHEN** 使用者查詢佇列狀態
- **THEN** 系統 SHALL 基於平均生成時間乘以前方任務數計算預估等待時間
- **THEN** 預估時間 SHALL 以「約 X 分 Y 秒」格式顯示

#### Scenario: 任務開始處理時通知

- **WHEN** 使用者的任務從 pending 變為 processing
- **THEN** 系統 SHALL 更新顯示為「生成中...」

#### Scenario: 佇列為空時直接處理

- **WHEN** 使用者提交請求且佇列為空且未達並行上限
- **THEN** 任務 SHALL 直接進入 processing 狀態
- **THEN** 系統 SHALL 不顯示排隊資訊

### Requirement: 佇列狀態 API

系統 SHALL 提供 /api/queue 路由查詢佇列狀態。

#### Scenario: 查詢佇列整體狀態

- **WHEN** 發送 GET /api/queue/status
- **THEN** 系統 SHALL 回傳：pending 任務數、processing 任務數、並行上限、平均生成時間

#### Scenario: 查詢特定任務狀態

- **WHEN** 發送 GET /api/queue/tasks/:taskId
- **THEN** 系統 SHALL 回傳該任務的狀態（pending/processing/completed/failed）、佇列位置（若 pending）、預估等待時間（若 pending）

#### Scenario: 查詢不存在的任務

- **WHEN** 發送 GET /api/queue/tasks/:taskId 且 taskId 不存在
- **THEN** 系統 SHALL 回傳 404 狀態碼

### Requirement: 佇列狀態前端指示器

系統 SHALL 在前端顯示佇列狀態指示器，讓使用者了解目前的佇列狀況。

#### Scenario: 顯示全域佇列狀態

- **WHEN** 使用者在任何頁面
- **THEN** 系統 SHALL 在頁面上方或側邊顯示佇列狀態指示器
- **THEN** 指示器 SHALL 顯示目前佇列中的任務數

#### Scenario: 佇列為空時隱藏指示器

- **WHEN** 佇列中沒有任何 pending 或 processing 任務
- **THEN** 佇列狀態指示器 SHALL 隱藏或顯示為空閒狀態

#### Scenario: 使用者有排隊任務時高亮顯示

- **WHEN** 目前使用者有任務在佇列中
- **THEN** 指示器 SHALL 高亮顯示並展示該使用者任務的進度
