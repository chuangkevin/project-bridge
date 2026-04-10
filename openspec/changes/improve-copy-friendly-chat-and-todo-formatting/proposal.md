## Why

目前顧問模式與生成流程的輸出雖然可讀，但不夠適合「直接複製貼上去執行」。

常見問題：

- 重要指示混在一般段落中，不容易一眼辨認
- 使用者想直接複製 checklist / 待辦 / 指令時，不夠方便
- todo-list 雖然有狀態 UI，但缺少可複製的整理版呈現

這在以下情境特別痛：

- 顧問模式給出「下一步要做什麼」
- reviewer / analysis 給出修正步驟
- 生成流程給出 todo/checklist

## What Changes

- 讓聊天中的結構化指引可用 code-block 風格呈現
- 為 markdown code blocks 提供明顯的可複製 UI
- 讓 todo-list 也能以 code-style 區塊呈現，方便整段複製

## Non-Goals

- 不在這個 change 內全面重寫所有聊天文案 prompt
- 不在這個 change 內做完整富文本編輯器

## Success Criteria

- 助手輸出的 code block 在聊天中有清楚的容器與複製按鈕
- 顯示中的 todo-list 也能以 code-style 區塊閱讀與複製
- 不破壞現有 markdown / chat rendering
