## Context

企業內部使用情境：團隊在現有平台（有固定 nav、sidebar、header）上持續擴充功能。每次 AI 生成都需要知道「我在哪個系統裡工作」，才能產出符合架構的設計物。

現有基礎：
- `intentClassifier.ts` 已有 `generate | question` 分類（gpt-4o-mini）
- `chat.ts` 生成路徑已有多層 prompt 組合（global design → project design → supplement → art style → multi-page）
- `design_profiles` 資料表可擴充欄位

## Goals / Non-Goals

**Goals:**
- Platform Shell 可持久化儲存，每次生成自動注入 context
- Intent 四分類準確區分「完整頁」「嵌入子頁」「元件」
- `in-shell` 生成：AI 收到 shell HTML 結構作為 context，生成的 `<main>` 內容可嵌入
- `component` 生成：AI 只輸出元件片段，前端用固定 wrapper 預覽
- Shell 可從現有原型一鍵擷取（取 `<nav>`, `<aside>`, `<header>`, `<footer>` 結構）

**Non-Goals:**
- 不做真正的 DOM 注入（shell + content 合併在後端完成）
- 不支援多個 shell 版本切換（每個專案一個 shell）
- 不修改 component 生成物的樣式（由 design profile 負責）

## Decisions

### 1. 四分類 Intent Schema

**決策**：擴充 intentClassifier 為四類：
- `full-page`：完整獨立頁面，自帶 nav/layout
- `in-shell`：新增子頁或功能，依附在現有 shell 中
- `component`：獨立元件（card、modal、form、table、widget）
- `question`：問題，不生成 HTML

**分類 prompt 邏輯（gpt-4o-mini）**：
- 有 shell 存在時，預設偏向 `in-shell`
- 含「元件」「card」「modal」「表單」「widget」關鍵字 → `component`
- 含「整頁」「完整」「重新設計」→ `full-page`
- 問句 → `question`

**Alternatives considered**：讓使用者手動選擇——增加摩擦，企業用戶更希望 AI 自動判斷。

### 2. Platform Shell 儲存格式

**決策**：存 `platform_shells` 資料表，欄位 `shell_html TEXT`（存完整 shell HTML，用 `{CONTENT}` 作為插入點佔位符）。

**Shell HTML 範例**：
```html
<!DOCTYPE html>
<html>
<head>...</head>
<body>
  <nav>...</nav>
  <aside>...</aside>
  <main>{CONTENT}</main>
  <footer>...</footer>
</body>
</html>
```

**理由**：`{CONTENT}` 佔位符讓後端可簡單做字串替換，不需要 DOM parser。

**Alternatives considered**：分開存 nav/sidebar/footer HTML 各欄位——過於細碎，使用者難以編輯。

### 3. in-shell 生成策略

**決策**：
- 生成 prompt 注入：「你正在設計一個子頁面內容，以下是現有系統的 shell 結構供參考，請只輸出 `<main>` 標籤內的內容（不含 `<!DOCTYPE>`, `<html>`, `<head>`, `<nav>`, `<aside>`）」
- 後端收到 AI 輸出後，將 `{CONTENT}` 替換為生成內容，組合成完整 HTML 存入 prototype_versions

**理由**：讓 AI 只專注 main content，shell 固定，設計結果能真正反映平台 UI 脈絡。

### 4. component 生成策略

**決策**：
- prompt 注入：「你正在設計一個獨立 UI 元件，請只輸出該元件的 HTML+CSS，不需要 `<!DOCTYPE>`, `<html>`, `<body>` 等完整頁面結構」
- 前端預覽時用 wrapper HTML（白底、置中、padding）把元件包起來，儲存時存 wrapper+component 完整 HTML

### 5. Shell 擷取邏輯

**決策**：提供「從現有原型擷取 Shell」功能。後端解析當前 prototype HTML，找出 `<nav>`, `<header>`, `<aside>`, `<footer>` 標籤，移除 `<main>` 內容，插入 `{CONTENT}` 佔位符，存為 shell。

**Alternatives considered**：讓使用者自己貼 shell HTML——做為 fallback 選項保留。

## Risks / Trade-offs

- **Intent 誤判** → `in-shell` 和 `full-page` 如果誤判，使用者可以在 chat 輸入框旁加一個 intent 手動 override 按鈕（快速補救）
- **Shell HTML 過長佔用 context** → shell 注入時取前 3000 字元結構，剩餘截斷，加說明「此為部分 shell 結構」
- **生成的 `in-shell` 內容不一定和 shell CSS 兼容** → 在 prompt 中說明 shell 的主要 CSS 變數供 AI 參考

## Migration Plan

- 新增 DB migration（006），無破壞性
- 舊專案無 shell → intent fallback 為 `full-page`（與現有行為完全相同）
- 可隨時部署，rollback 只需移除新路由
