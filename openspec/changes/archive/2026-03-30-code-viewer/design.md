## Context

目前工作區右側是 iframe preview，顯示生成的 HTML prototype。使用者無法看到原始碼。多頁面專案的 HTML 使用 `<!-- PAGE: name -->` 標記分隔頁面，加上 `showPage()` JavaScript 導航函式。

Figma AI 的 code view 展示完整的 React + Tailwind 專案結構（App.tsx, routes.tsx, components/, pages/），讓開發者可以理解和複製程式碼。

## Goals / Non-Goals

**Goals:**
- 工作區新增 Code view，與 Preview 並列切換
- 語法高亮顯示 HTML/CSS/JS
- 多頁面專案：檔案樹展示頁面結構，點擊切換
- 一鍵複製程式碼
- 程式碼內搜尋

**Non-Goals:**
- 不做 React/Vue 程式碼拆分（我們生成的是 single-file HTML，不是 React 專案）
- 不做線上程式碼編輯（read-only）
- 不做即時同步編輯（不是 CodeSandbox）

## Decisions

### 1. 語法高亮方案

使用 `prism-react-renderer`（~15KB gzipped）。

**替代方案**: `highlight.js`（~30KB）、Monaco Editor（~2MB）。
**為什麼選 prism-react-renderer**: 輕量、React 原生、支援 HTML/CSS/JS、主題可客製。

### 2. 檔案樹結構

對多頁面 HTML 解析 `<!-- PAGE: name -->` 標記，產生虛擬檔案結構：

```
📁 pages/
  📄 首頁.html
  📄 商品詳情.html
  📄 購物車.html
📄 styles (embedded)
📄 scripts (embedded)
```

點擊檔案節點時，CodePanel 捲動到該頁面的程式碼區段並高亮。

### 3. UI Layout

Preview / Code 切換按鈕放在現有的 preview 區域右上角：

```
┌───────────────────────────────┐
│  [👁 Preview] [</> Code]      │
├───────────────────────────────┤
│ ┌─────────┬──────────────────┐│
│ │ Files   │ Code             ││
│ │ 📁pages │ <!DOCTYPE html>  ││
│ │  📄首頁  │ <html>           ││
│ │  📄商品  │   <head>...      ││
│ │         │   <body>         ││
│ │ 📄styles│     ...          ││
│ │         │                  ││
│ │         │   [📋 複製] [🔍] ││
│ └─────────┴──────────────────┘│
└───────────────────────────────┘
```

Files panel 佔 200px 寬，Code 佔剩餘空間。單頁面時不顯示 Files panel。

### 4. 程式碼格式化

使用簡單的 indent-based 格式化（不引入 prettier 等重型依賴）：
- 保持 AI 生成的原始格式（通常已經格式化好）
- 行號顯示
- 長行自動換行可切換

## Risks / Trade-offs

- **[Bundle size]** prism-react-renderer 增加 ~15KB → 可接受
- **[大型 HTML]** 超過 10000 行的 HTML 可能導致高亮效能問題 → 超過 5000 行時改用純文字顯示，或做虛擬捲動
- **[HTML 格式]** AI 生成的 HTML 格式不一致 → 只做語法高亮，不重新格式化
