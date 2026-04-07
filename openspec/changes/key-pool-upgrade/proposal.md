## Why

目前的 Gemini API key pool（`geminiKeys.ts`）有三個具體痛點：

### 1. 沒有自動重試包裝器

每個呼叫 Gemini API 的地方都要自己寫 retry 邏輯：捕獲 429/500 → 換 key → 重試。這導致：
- `parallelGenerator.ts`、`masterAgent.ts`、`designAnalyzer.ts` 等多處重複相同的 try/catch + key rotation 程式碼
- 有些地方寫了 retry，有些忘了寫，行為不一致
- 姊妹專案 ai-lunch-mind 用 decorator pattern 包裝，呼叫端只需要 `@withRetry` 或 `withRetry(fn)`，完全不用寫 retry 邏輯

### 2. Cooldown 狀態只存在記憶體

`badKeys` 是一個 `Map<string, number>`，container 重啟後全部歸零。免費帳號的 quota 是以分鐘/天計算的，重啟後系統不知道哪些 key 還在冷卻中，立刻對同一批 key 發送請求 → 觸發 429 風暴 → 所有 key 同時被標記為 bad → 短時間內完全無法使用。ai-lunch-mind 把 cooldown 狀態寫入 SQLite，重啟後自動恢復。

### 3. 沒有 key 驗證機制

使用者透過 UI 新增 API key 時，系統只檢查格式（`isValidKeyFormat` — 長度 > 20、不是 placeholder），完全不驗證 key 是否真的能呼叫 API。常見情況：
- 貼錯 key（複製不完整、貼到別的服務的 key）
- Key 已被 Google 停用或刪除
- 使用者不知道 key 無效，直到生成失敗才發現
- ai-lunch-mind 在匯入時會實際發一個輕量 API 呼叫來驗證

## What Changes

### 自動重試包裝器（auto-retry-wrapper）

- 新增 `packages/server/src/services/geminiRetry.ts`：
  ```ts
  export function withGeminiRetry<T>(
    fn: (apiKey: string, model: string) => Promise<T>,
    options?: { maxRetries?: number; callType?: string }
  ): Promise<T>
  ```
- 包裝邏輯：
  1. 從 key pool 取一把 key
  2. 執行 `fn(key, model)`
  3. 若遇到 429（rate limit）→ `markKeyBad(key)` → 換下一把 key 重試
  4. 若遇到 500/503（server error）→ 等待 1 秒 → 用同一把 key 重試
  5. 若遇到 401/403（auth error）→ `markKeyBad(key)` → 換 key 重試（不重試超過 2 次，可能是 key 本身無效）
  6. 超過 maxRetries（預設 3）→ 拋出最後的錯誤
- 每次成功呼叫自動呼叫 `trackUsage()` 記錄用量
- 逐步替換現有的手動 retry 邏輯（`parallelGenerator.ts`、`masterAgent.ts` 等）

### DB 持久化 Cooldown（persistent-cooldown）

- 新增 `api_key_cooldowns` 資料表：
  ```sql
  CREATE TABLE api_key_cooldowns (
    api_key_suffix TEXT PRIMARY KEY,
    cooldown_until INTEGER NOT NULL,  -- Unix timestamp (ms)
    reason TEXT,                       -- '429' | '401' | 'server_error'
    created_at TEXT DEFAULT (datetime('now'))
  );
  ```
- 修改 `markKeyBad()`：除了寫入記憶體 `badKeys` Map，同時寫入 DB
- 修改 `getAvailableKeys()`：啟動時從 DB 載入尚未過期的 cooldown 記錄，合併記憶體狀態
- 新增 `clearExpiredCooldowns()`：清除已過期的 DB 記錄（在 `loadKeys()` 時順便執行）
- Cooldown 時間可依錯誤類型不同：429 → 2 分鐘、401 → 30 分鐘、server_error → 30 秒

### Key 驗證端點（key-validation）

- 新增 `POST /api/settings/validate-key` 端點：
  - 接收 `{ key: string }`
  - 使用該 key 發送一個輕量 Gemini API 呼叫（如 `generateContent` 帶極短 prompt：`"Hi"`，設定 `maxOutputTokens: 1`）
  - 回傳 `{ valid: boolean, error?: string, model?: string }`
  - 錯誤訊息明確區分：key 無效、quota 已滿、網路錯誤
- 修改前端 key 管理 UI：
  - 新增 key 時先呼叫驗證端點
  - 顯示驗證結果：✅ 有效 / ❌ 無效（附錯誤原因）
  - 驗證通過才允許儲存（或顯示警告後允許強制儲存）
- 新增「批次驗證」按鈕：一次驗證所有已儲存的 key，標記失效的 key

## Capabilities

### New Capabilities
- `auto-retry-wrapper`：通用 Gemini API 呼叫包裝器，自動 key rotation + 分類重試策略
- `persistent-cooldown`：API key cooldown 狀態持久化到 SQLite，container 重啟不遺失
- `key-validation`：匯入 API key 時實際呼叫 API 驗證有效性，支援單一驗證與批次驗證

### Modified Capabilities
- `parallel-generation`：Sub-agent 改用 `withGeminiRetry` 包裝，移除手動 retry 邏輯
- `gemini-key-pool`：cooldown 改為 DB 持久化 + 記憶體快取雙層架構

## Impact

- **資料庫**
  - 新增 `api_key_cooldowns` 資料表
  - 修改 `packages/server/src/db/migrations/` 新增 migration

- **伺服器端**
  - 新增 `packages/server/src/services/geminiRetry.ts`：自動重試包裝器
  - 修改 `packages/server/src/services/geminiKeys.ts`：`markKeyBad()` 寫入 DB、`getAvailableKeys()` 從 DB 載入、cooldown 時間依錯誤類型區分
  - 修改 `packages/server/src/routes/settings.ts`：新增 `POST /api/settings/validate-key` 端點
  - 修改 `packages/server/src/services/parallelGenerator.ts`：改用 `withGeminiRetry`
  - 修改 `packages/server/src/services/masterAgent.ts`：改用 `withGeminiRetry`
  - 修改其他直接呼叫 Gemini API 的 service 檔案

- **前端**
  - 修改 key 管理頁面（Settings 中的 API Key 區塊）：新增驗證按鈕、驗證狀態顯示、批次驗證功能

- **新增依賴**：無（SQLite 已有、Gemini API 呼叫用現有 SDK）
