## Context

Project Bridge 目前的使用者體驗有五個待改善項目：專案建立缺乏引導、標註模式被 visual-edit-mode 破壞、API 標註僅支援元素層級、專案無法排序、沒有深色模式。這些都是獨立的改善項目，但放在同一個 pack 統一實作。

現有架構：
- 前端 React + Vite，狀態用 Zustand + React Context
- bridgeScript.ts 管理 iframe 內的互動模式（browse/annotate/apiBinding/visualEdit）
- API bindings 以 bridgeId（元素級）為單位儲存
- 使用者偏好目前沒有獨立儲存機制

## Goals / Non-Goals

**Goals:**
- G1: 新專案建立時提供模式選擇（架構設計 / 設計），影響初始工作區狀態
- G2: 修復標註模式無法選取元素的 bug
- G3: API binding 支援頁面層級標註
- G4: 首頁專案卡片拖曳排序 + 持久化
- G5: 全站深色模式切換

**Non-Goals:**
- 不涉及 AI 生成邏輯的改動
- 不做即時協作功能
- 不改動 Figma 匯出
- 拖曳排序不做跨使用者共享（每人獨立排序）

## Decisions

### D1: 專案建立模式選擇
**決策**: 在 NewProjectDialog 加入模式選擇步驟，提供「架構設計模式」和「設計模式」兩個選項。
- 架構設計模式：建立後預設開啟架構圖 tab
- 設計模式：建立後預設開啟聊天面板，直接開始描述需求
**替代方案**: 在工作區內再選 → 使用者已經進入空白頁面，體驗斷裂
**理由**: 在建立時就引導，減少使用者困惑

### D2: 標註模式 bug 修復
**決策**: bridgeScript.ts 的 click handler 需要在 visual-edit-mode 判斷之前，先檢查當前的互動模式優先級。annotation mode 和 apiBinding mode 應優先於 visualEdit mode 處理。
**根本原因**: visual-edit-mode 的 click handler 在第 83-103 行會提前 return，攔截了 annotation 和 apiBinding 的點擊。
**修復方式**: 調整條件判斷順序 — annotation/apiBinding 優先判斷，visual-edit 最後

### D3: 頁面層級 API Binding
**決策**: 擴展 api_bindings 表，新增 `page_name` 欄位（nullable）。當 `bridge_id` 為空且 `page_name` 有值時，代表頁面層級的 binding。
**替代方案**: 用特殊 bridgeId 格式（如 `page:home`） → 會污染現有 bridgeId 命名空間
**理由**: 乾淨的 schema 設計，向下相容

### D4: 拖曳排序
**決策**: 使用 `@dnd-kit/core` + `@dnd-kit/sortable` 實作拖曳。排序結果存入 user_preferences 表（JSON 格式，key = `project_sort_order`，value = `["id1","id2",...]`）。
**替代方案**: react-beautiful-dnd → 已停止維護
**替代方案**: 純 CSS order → 無法持久化
**理由**: dnd-kit 是目前最活躍的 React DnD 庫，bundle 小且無障礙支援好

### D5: 深色模式
**決策**: 使用 CSS custom properties（CSS 變數）驅動主題。在 `<html>` 元素加上 `data-theme="dark"` 屬性切換。偏好存入 user_preferences。
**替代方案**: CSS-in-JS 主題 → 需大量改動現有 inline styles
**理由**: 現有元件大量使用 inline styles，CSS 變數可以用 `var()` 逐步替換，不需一次全改。首波先覆蓋主要頁面框架，細節後續迭代。

## Risks / Trade-offs

- [D3 頁面層級 binding] 現有 UI 是基於「點選元素 → 開啟 binding panel」的流程，頁面層級 binding 沒有明確的「點選目標」 → **緩解**: 在 API Binding Panel 加入「頁面層級 API」區塊，不需點選元素即可新增
- [D4 dnd-kit] 新增前端依賴 → **緩解**: dnd-kit tree-shakeable，只引入需要的模組
- [D5 深色模式] inline styles 無法被 CSS 變數覆蓋 → **緩解**: 第一波只改框架級樣式（sidebar、header、card background），不改所有元件內部。後續可逐步 refactor inline styles 為 CSS 變數
