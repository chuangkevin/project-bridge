## Why

`project-bridge` 的主要互動面仍然偏桌面工作台心智模型，尤其是：

- `WorkspacePage`
- `SettingsPage`
- `GlobalDesignPage`

目前在手機尺寸下雖然部分頁面可以載入，但仍存在幾個實質問題：

- 多欄 panel / overlay 在小螢幕上容易擠壓、遮擋或難以切換
- 表格與工具列在手機上可讀性差，操作目標過小
- 部分 modal / sheet / sticky action 區在手機上沒有針對 safe area 與單欄流程最佳化
- dark mode 與 responsive 處理仍偏零散，缺少一致的 mobile layout 規則

這使得顧問模式與設計模式在手機上雖然不是完全不可用，但距離「可順暢操作」還有明顯差距。

## What Changes

- 建立 `project-bridge` 的手機 UI baseline 與 shared responsive 規則
- 優先改善 `WorkspacePage` 的 mobile shell 與 panel 切換模式
- 改善 `SettingsPage` 在手機尺寸下的表格、表單與 dark mode 一致性
- 改善 `GlobalDesignPage` 與常用 dialogs / sheets 的手機尺寸行為
- 定義小螢幕下的主要交互規則：單欄、drawer/sheet、可捲動工具列、較大點擊區域

## Non-Goals

- 不在這個 change 內重做整個設計系統
- 不在這個 change 內完全改寫桌面版 workspace 體驗
- 不在這個 change 內處理所有歷史頁面；先聚焦高使用率頁面
- 不在這個 change 內處理所有 prototype 生成品質議題

## Success Criteria

- 手機寬度下，`WorkspacePage` 能以單欄模式順暢切換 chat / preview / spec / code
- `SettingsPage` 在 dark mode 與 mobile 尺寸下沒有明顯顏色衝突、表格溢出或難點擊按鈕
- `GlobalDesignPage` 的常用操作在手機上可讀、可點、可捲動
- 常用 dialogs / modal 在手機尺寸下不會被裁切或超出 viewport
- 手機 viewport 驗證可明確證明主要頁面可操作
