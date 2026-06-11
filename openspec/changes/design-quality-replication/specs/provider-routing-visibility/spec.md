# provider-routing-visibility

## ADDED Requirements

### Requirement: Serving selection recorded per turn
每次 AI 生成完成後，系統 MUST 將實際服務的 provider 與 model 寫入該 turn 的 `model_used` 欄位，並透過 SSE `meta` 事件 `{provider, model, fallback}` 推送給 client。

#### Scenario: OpenCode 正常服務
- **WHEN** 生成由 OpenCode 上的 gpt-5.5 服務
- **THEN** turn.model_used 記錄 `opencode/gpt-5.5`，meta 事件 `fallback=false`

#### Scenario: 跨 provider fallback 發生
- **WHEN** OpenCode 全部 server 失敗、Gemini key-pool 以 gemini-2.5-flash 承接
- **THEN** meta 事件 `fallback=true` 且 model 為實際服務的 `gemini-2.5-flash`

### Requirement: Provider badge in chat UI
聊天介面的每則 AI 回覆 MUST 顯示服務 provider/model badge；fallback 發生時 badge MUST 以警示樣式（橘色 + `(fallback)` 字樣）呈現。

#### Scenario: fallback badge
- **WHEN** 某 turn 的 meta 事件 `fallback=true`
- **THEN** 該回覆氣泡顯示橘色 badge 含 `(fallback)`

### Requirement: Cross-model fallback can be disabled
設定 `disallow_model_fallback` 開啟時，route policy MUST 以 `allowCrossModelFallback: false` 建構；偏好 model 無法被任何 provider 以同名 model 服務時 MUST 對使用者回報明確錯誤，不得以其他 model 靜默出貨。

#### Scenario: 禁止降級
- **WHEN** `disallow_model_fallback=true` 且 OpenCode 全部失敗、無其他 provider 支援 gpt-5.5
- **THEN** 該次生成回傳錯誤事件，不產生由 gemini-2.5-flash 生成的 artifact
