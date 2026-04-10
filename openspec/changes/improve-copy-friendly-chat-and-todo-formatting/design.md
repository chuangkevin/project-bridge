## Overview

這個 change 先做兩件最有價值的事：

1. code block 顯示與複製體驗
2. todo-list 的 code-style 呈現

## Decisions

### 1. Use UI-level formatting first

先從 UI 層改善，而不是一開始就全面改 prompt。

原因：

- 目前 markdown 已支援 code fences
- UI 層可立即讓既有與未來輸出都受益
- 風險最小

### 2. Copy button on code blocks

所有聊天中的 fenced code blocks 應有：

- 明顯容器
- 語言標籤（若有）
- Copy 按鈕

### 3. Todo list gets a copy-friendly text block

目前 todo-list 只有狀態型 UI。新增一個 code-style 區塊顯示：

- 已完成 / 進行中 / 待處理
- 可整段複製

這樣使用者可直接把 checklist 複製到外部工具或聊天室。

## First Implementation Unit

- `ChatPanel` 增加 markdown code block custom renderer
- `ChatPanel` 的 todo-list 區塊增加 code-style summary block
- copy-to-clipboard feedback

## Verification

- 一般 markdown 仍正常顯示
- code block 顯示正確且可複製
- todo-list 區塊可複製且狀態清楚
