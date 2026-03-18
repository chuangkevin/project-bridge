## MODIFIED Requirements

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

#### Scenario: Seed prompt CSS tokens integrated
- **WHEN** project 有設定 seed_prompt 且 seed_prompt 包含 CSS custom property 定義
- **THEN** StyleTweakerPanel 的初始 token 值 SHALL 以 seed_prompt 中的值為優先，再 fallback 到 computed styles
