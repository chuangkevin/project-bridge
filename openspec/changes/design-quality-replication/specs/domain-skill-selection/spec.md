# domain-skill-selection

## ADDED Requirements

### Requirement: Automatic skill selection before generation
design 與 consult 模式生成前，系統 MUST 以輕量 selector 呼叫（skill 索引 + 使用者訊息 → JSON）選出 0–3 個相關 skill，並將其 body 注入 systemInstruction（單一 skill 8K 字、總計 20K 字上限）。

#### Scenario: 相關 skill 被選中
- **WHEN** 使用者要求設計「房價查詢頁」且 skill 庫含 houseprice 相關 skill
- **THEN** selector 回傳相關 skill 名單且其 body（截斷後）出現在生成 systemInstruction

#### Scenario: 無相關 skill
- **WHEN** 使用者需求與所有 skill 無關
- **THEN** selector 回傳空清單，生成不注入任何 domain skill body

### Requirement: Selector failure never blocks generation
selector 呼叫失敗或回傳無法解析時，系統 MUST 記錄失敗並以無注入方式繼續生成，不得中斷或阻塞。

#### Scenario: selector 逾時
- **WHEN** selector 呼叫拋出錯誤
- **THEN** 主生成照常進行，server log 記錄 selector 失敗

### Requirement: Forced skill bypasses selector
使用者以斜槓指令強制 skill 時，系統 MUST 跳過 selector，直接注入被強制的 skill。

#### Scenario: 斜槓強制
- **WHEN** 使用者輸入 `/houseprice-business-member 設計會員頁`
- **THEN** 不發生 selector 呼叫，該 skill body 直接注入

### Requirement: Injected skills are visible
實際注入的 skill 名單 MUST 寫入 `turns.skills_used` 並在聊天 UI 以 badge 顯示。

#### Scenario: skill badge
- **WHEN** 某次生成注入了 2 個 skill
- **THEN** 該回覆氣泡顯示這 2 個 skill 名稱的 badge
