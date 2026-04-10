## Overview

這個 change 聚焦於 `project-bridge` 的手機 UI 可用性，而不是全面重新設計桌面版。

優先策略：

1. 先建立 mobile baseline
2. 先處理高使用率頁面
3. 優先修 layout 與 interaction，不先追求視覺大改

## Problem Areas

### 1. WorkspacePage

`WorkspacePage` 是目前最偏桌面心智模型的頁面：

- 多 panel 狀態同時存在
- 多種 mode（design / consultant / architecture）
- preview / code / spec / tokens / history / quick regen / annotation 等 overlay 與 side panels 疊加

在手機上最容易出現：

- 橫向擠壓
- 點擊區太小
- overlay 與 keyboard 相互遮擋
- 使用者不清楚目前在哪一個工作區

### 2. SettingsPage

`SettingsPage` 問題較偏：

- table 在手機上閱讀吃力
- action buttons 太密集
- dark mode 仍有硬編碼色塊殘留
- MCP / skills / users 這類管理區塊缺少 mobile-first 呈現

### 3. GlobalDesignPage and dialogs

`GlobalDesignPage` 與多個 modal / dialog 主要問題是：

- 固定寬度 / padding 在手機上過大
- footer / sticky bar 容易擠壓內容區
- 某些控件的 spacing 與 hit area 不夠 mobile-friendly

## Decisions

### 1. Introduce a mobile shell for WorkspacePage

手機寬度下，`WorkspacePage` 不再嘗試維持桌面多欄布局，而改成：

- 單欄主視圖
- 底部 tabs 或 segmented switch 切換主要工作區
- 次要面板改成 drawer / bottom sheet

建議 primary mobile surfaces：

- Chat
- Preview
- Spec
- Code

其他如 tokens / version history / page API / constraints 改為 sheet 或 modal 入口。

### 2. Card/list replacement for dense tables on mobile

在小螢幕下，不強迫所有表格維持完整 table 形態。

優先策略：

- 若表格欄位少：可保留 table + horizontal scroll
- 若欄位多且操作密集：改成 card list

`SettingsPage` 的 MCP / users / skills 管理應優先考慮 card list 或 stacked rows。

### 3. Theme-safe surfaces

所有管理頁與 modal 應優先使用 theme tokens，而不是硬編碼亮色背景。

對 dark mode 的規則：

- 表面色以 `var(--bg-*)` token 為主
- 次要 badge / alert 用 tone-mixed 色，不直接用固定亮底
- inline code / key suffix / badges / action buttons 在 dark mode 下需保持對比與邊界清楚

### 4. Shared responsive utilities before broad rollout

不要每頁用各自的 magic numbers 修手機版。

應先建立 shared conventions：

- breakpoints
- mobile stacked section spacing
- mobile dialog width / height rules
- bottom sheet / drawer primitives
- compact action group pattern

## Implementation Phases

### Phase 1: Mobile Baseline

目標：先讓主要頁面在手機上可操作。

範圍：

- `WorkspacePage`
- `SettingsPage`
- `GlobalDesignPage`
- 常用 modal / dialog primitives

### Phase 2: Workspace Mobile Shell

目標：讓手機上的 workspace 有清楚主線操作。

內容：

- mobile tabs / segmented switch
- sheet-based secondary tools
- preview/chat/spec/code 切換
- quick regen / annotation UI 改成 mobile-safe 入口

### Phase 3: Responsive Cleanup

目標：把重複 workaround 收斂成共享模式。

內容：

- responsive helpers
- shared dark/mobile tokens
- card/list patterns
- form/action layout unification

## Verification Strategy

至少要用手機 viewport 驗證：

- `WorkspacePage`
- `SettingsPage`
- `GlobalDesignPage`

驗證重點：

- 無明顯 overflow / clipped content
- 主要 action 可以單手點擊
- overlay 不會卡住主要流程
- dark mode 顏色對比合理
