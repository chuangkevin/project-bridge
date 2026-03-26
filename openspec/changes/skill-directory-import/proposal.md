## Why

Skills 目前只能在 UI 手動一個一個新增，或透過 server 啟動時的 `SKILLS_DIR` 環境變數批次匯入。企業用戶（如好房網）有 30+ skills 分散在不同目錄，且 skills 之間有交叉引用關聯（例如 `houseprice-object-sync` 引用 `houseprice-object-management` 的資料庫結構）。需要：(1) UI 一鍵從目錄匯入 (2) 可視化 skill 之間的關聯 (3) 批量啟用/停用/刪除。

## What Changes

- 新增 UI「從目錄匯入」功能，使用 File System Access API 選擇本機目錄，遞迴掃描 `SKILL.md` 並批量 upsert
- 新增 skill 關聯解析：從 skill content 中提取 `@ref(skill-name)` 或自然語言引用（提到其他 skill name）
- 新增關聯視覺化：在設定頁顯示 skill 關聯圖（簡單的 tag + 引用列表，不做完整 graph）
- 新增批量操作：全選/反選、批量啟用、批量停用、批量刪除
- Server 端新增 `POST /api/skills/batch` endpoint（upsert 邏輯）
- Server 端新增 `GET /api/skills/:id/references` endpoint（解析引用關係）
- skill 匯入時自動解析 frontmatter 中的 `depends` 欄位（如有）

## Capabilities

### New Capabilities
- `skill-batch-import`: 從本機目錄批量匯入 SKILL.md 檔案，自動解析 frontmatter、upsert 到 DB
- `skill-references`: 解析 skill 之間的交叉引用關聯，提供引用查詢 API 和 UI 顯示
- `skill-batch-operations`: 批量啟用、停用、刪除 skills 的 UI 和 API

### Modified Capabilities
(none)

## Impact

- **Server**: `routes/skills.ts` 新增 batch 和 references endpoints
- **Client**: `pages/SettingsPage.tsx` 新增目錄匯入按鈕、關聯顯示、批量操作 UI
- **DB**: `agent_skills` table 可能新增 `source_path` 和 `depends_on` 欄位
- **Dependencies**: 無新增（File System Access API 為瀏覽器原生）
