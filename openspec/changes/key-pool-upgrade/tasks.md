# Key Pool Upgrade — Tasks

## Auto-retry wrapper
- [x] 建立 `geminiRetry.ts` — `withGeminiRetry` wrapper（429 換 key、401/403 標記、500/503 延遲重試）
- [x] 重構 `documentAnalysisAgent.ts` — 刪除本地 withRetry，改用共用 wrapper
- [x] 重構 `pageStructureAnalyzer.ts` — 刪除手動 3-attempt loop
- [x] 重構 `codeExporter.ts` — 刪除 429 fallback block
- [x] 重構 `urlStyleAnalyzer.ts` — 刪除 assignBatchKeys loop
- [x] 重構 `masterAgent.ts` — 加入 withGeminiRetry（原本無重試）

## Persistent cooldown
- [x] 建立 `032_api_key_cooldowns.sql` migration
- [x] `markKeyBad()` 同時寫入 memory + DB
- [x] `getAvailableKeys()` 啟動時從 DB 載入 cooldown 狀態
- [x] 依 reason 設定不同 cooldown 時間（429=2min, 401/403=30min, server=30s）

## Key validation
- [x] 新增 `POST /api/settings/validate-key` — 實際打 API 測試 key 是否可用
- [x] 新增 `POST /api/settings/api-keys/batch-validate` — 批次驗證（最多 20 個）

## E2E 測試
- [ ] 測試 validate-key endpoint（valid key, invalid key, rate-limited key）
- [ ] 測試 batch-validate endpoint
- [ ] 測試 cooldown 持久化（寫入 DB → 讀取確認）
