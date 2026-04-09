## Why

目前系統在兩個地方容易偏掉：
1. 顧問模式會把多份文件混在一起討論，但不先做 source-of-truth 判斷與差異比對，導致 AI 整理文件可能污染原始需求。
2. 設計模式雖然有 thinking / phase 透明化，但缺少可驗證的 checklist，使用者看不到「需求確認、規則檢查、逐頁生成、驗證」是否真的完成。

## What Changes

- 新增高保真文件審查流程，供顧問模式在回答前先做 source-of-truth、contract extraction、cross-document diff、self-check。
- 顧問模式依任務切換 `spec-review`、`architecture-review`、`ux-review`、`general` 子模式。
- 設計模式新增執行 checklist，顯示 todo 狀態與逐頁生成進度。

## Impact

- `packages/server/src/services/specReviewAgent.ts`
- `packages/server/src/routes/chat.ts`
- `packages/server/src/services/documentAnalysisAgent.ts`
- `packages/server/src/routes/upload.ts`
- `packages/client/src/components/ChatPanel.tsx`
