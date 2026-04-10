## Overview

這個 change 先做最低成本、最高回報的 onboarding 改善：

1. 首頁空狀態改成任務導向入口
2. 工作區空原型狀態改成 quick-start 卡片
3. 利用既有 `pendingMessage` 機制，不另做複雜 onboarding state machine

## Decisions

### 1. Start with task-oriented entry cards

不要只顯示「尚無專案」或「請描述需求」，而要直接顯示使用者可以做的事：

- 分析需求文件
- 生成第一版畫面
- 先討論流程/規格

### 2. Reuse pendingMessage for first-run success path

`WorkspacePage` 已有 `pendingMessage` → `ChatPanel` 自動送出的流程。

因此 quick-start 卡片應直接寫入：

- 要切換到哪個 mode
- 要送出的 prompt

這樣能最小改動就讓 onboarding 真的可執行。

### 3. Focus on empty states first

第一階段不追求全域 onboarding。

優先位置：

- `HomePage` 無專案空狀態
- `WorkspacePage` 無原型空狀態

理由：這兩個地方最直接影響「我現在該做什麼」的第一印象。

## First Implementation Unit

### HomePage

- 空狀態新增 quick-start cards
- 呈現 3 個起手任務與一句說明
- 若使用者尚未登入，仍保留登入/新增專案入口

### WorkspacePage

- 無 prototype 時，在 preview empty state 加入 quick-start actions
- action 可：
  - 切換到顧問模式並送出需求審查 prompt
  - 切換到設計模式並送出第一版畫面 prompt
  - 切換到顧問模式，先整理頁面流程與資訊架構，再引導後續生成

## Verification

- 首頁空狀態要能一眼看懂三種開始方式
- 空工作區點 quick-start 後應實際送出 prompt
- 手機尺寸下 quick-start cards 不應爆版
