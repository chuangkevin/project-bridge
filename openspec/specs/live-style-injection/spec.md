## ADDED Requirements

### Requirement: Inject styles into iframe via postMessage
系統 SHALL 在 bridgeScript 中處理 `{ type: 'inject-styles', css: string }` 訊息，動態更新 iframe 內的樣式，無需重新載入頁面。

#### Scenario: First injection creates style tag
- **WHEN** iframe 收到 `inject-styles` 訊息且 `<style id="__tweaker__">` 不存在
- **THEN** 系統 SHALL 在 `<head>` 中建立 `<style id="__tweaker__">` 並填入 css 內容

#### Scenario: Subsequent injection replaces style tag
- **WHEN** iframe 收到 `inject-styles` 訊息且 `<style id="__tweaker__">` 已存在
- **THEN** 系統 SHALL 替換該標籤的 textContent，不重複建立新標籤

#### Scenario: Preview updates immediately
- **WHEN** 用戶在 StyleTweakerPanel 調整任一 token 值
- **THEN** iframe 畫面 SHALL 在 100ms 內反映樣式變更，不閃爍、不重整

### Requirement: Save tweaked styles to database
系統 SHALL 提供 `PATCH /api/projects/:id/prototype/styles` 端點，將微調樣式持久化到當前原型版本。

#### Scenario: Save merges style tag into HTML
- **WHEN** 呼叫 PATCH 端點，body 為 `{ css: string }`
- **THEN** 系統 SHALL 在當前版本 HTML 的 `</body>` 前 upsert `<style id="__tweaker__">css</style>`，並更新 `prototype_versions.html`

#### Scenario: Save returns updated HTML
- **WHEN** PATCH 成功
- **THEN** 回應 SHALL 為 `{ success: true }`，HTTP 200

#### Scenario: No current prototype version
- **WHEN** PATCH 端點被呼叫但專案無任何原型版本
- **THEN** 系統 SHALL 回傳 HTTP 404，`{ error: 'No prototype version found' }`
