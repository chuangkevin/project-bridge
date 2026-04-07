## Why

設計師使用 project-bridge 後反映三個核心問題：生成的原型視覺風格不穩定（每次生成結果差異大）、上傳附件後 AI 不知道那份文件該如何使用、以及生成後無法直接在預覽畫面上微調元素位置。這三個問題共同造成設計師需要反覆提示才能收斂到目標設計，效率極低。

## What Changes

- **附件用途標注**：上傳檔案時新增「用途類型」選擇器（設計稿、資料規格、品牌指南、參考截圖），並將標注結果注入 AI prompt，讓每份附件的角色在 context 中明確
- **生成一致性控制**：將 generation temperature 預設從 ~0.7 降至 0.3；新增 seed prompt 功能，讓使用者可以指定「每次生成都要從這段說明出發」；生成完成後自動進行設計稿色彩比對並顯示色差警示
- **預覽拖放微調**：在 preview iframe 外層加入拖放攔截層，使用者可以直接拖移 `data-bridge-id` 元素調整其在容器內的相對位置，調整結果回寫至 HTML string，無需重新生成

## Capabilities

### New Capabilities
- `file-intent-labeling`: 附件用途標注 — 上傳時選擇附件角色，注入 prompt context
- `generation-consistency`: 生成一致性控制 — temperature 設定、seed prompt、色彩差異比對警示
- `prototype-drag-edit`: 預覽畫面元素拖放微調 — 拖移元素位置並回寫 HTML

### Modified Capabilities
- `live-style-injection`: 現有即時樣式注入需整合 seed prompt 提供的基礎樣式參數

## Impact

- **Client**: `UploadPanel` 新增 intent selector；`ChatPanel` 新增 seed prompt 欄位與 temperature slider；`PreviewPanel` 新增拖放攔截層與色彩比對 badge
- **Server**: `chat.ts` route 接收並注入 `fileIntents`、`seedPrompt`、`temperature` 參數；`upload.ts` 儲存 `intent` 欄位至 `uploaded_files`
- **DB**: `uploaded_files` 新增 `intent` 欄位（TEXT, nullable）；`projects` 新增 `seed_prompt` 欄位
- **Dependencies**: 無新增外部依賴（色彩比對用純 JS 實作）
