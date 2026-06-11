# design-replication

## ADDED Requirements

### Requirement: Replication intake options
當訊息含圖片附件或 URL 時，Composer MUST 顯示固定選項列：意圖（照抄 / 只取風格 / 只當參考）× 目的地（新 artifact / 插入目前頁面選定區域），選擇結果隨 chat request 送出；使用者未選擇時，server MUST 指示 AI 在回覆開頭先確認意圖。

#### Scenario: 圖片附件觸發選項列
- **WHEN** 使用者在 Composer 附上圖片
- **THEN** 送出前顯示照抄選項列

#### Scenario: 忽略選項列
- **WHEN** 使用者未點選任何選項直接送出含圖訊息
- **THEN** AI 回覆開頭包含意圖確認，未經確認不直接產出照抄 artifact

### Requirement: Replicate generation mode
系統 MUST 提供 `replicate` 生成模式：不注入 frontend-design skill，採像素忠實重建指令；圖片 MUST 經 `params.images` 隨生成呼叫附上（OpenCode multimodal 優先）。

#### Scenario: 照抄不發揮創意
- **WHEN** 使用者選擇「照抄」並附設計稿圖片
- **THEN** 生成呼叫的 systemInstruction 不含 frontend-design skill 內容，且含忠實重建指令與原圖

#### Scenario: multimodal 失敗備援
- **WHEN** OpenCode 路徑處理圖片失敗
- **THEN** 系統自動以 geminiVisionQuery 產出結構化規格並以文字規格續行 replicate 生成，同時以 SSE 告知使用者已切換文字規格路徑

### Requirement: URL replication uses crawled source
URL 照抄 MUST 重用 Playwright 爬蟲取得的 cleaned HTML 與 computed style 作為重建依據，注入生成 prompt（HTML 截 30K 字）。

#### Scenario: 貼網址照抄
- **WHEN** 使用者貼 URL 並選擇「照抄」
- **THEN** 生成 prompt 含該頁 cleaned HTML 與樣式摘要

### Requirement: Replication into existing page
目的地為「插入選定區域」時，照抄結果 MUST 經元素軌道以選定錨點插入現有 artifact，artifact 其餘部分不變。

#### Scenario: 增量照抄
- **WHEN** 使用者選取頁面某區域並照抄一張卡片設計圖
- **THEN** 新卡片插入該區域，頁面其餘 template 與修改前位元等價
