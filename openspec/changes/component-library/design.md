# Component Library — Design

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   React Frontend                     │
│                                                      │
│  ┌──────────────────┐  ┌─────────────────────────┐   │
│  │ComponentLibrary  │  │WorkspacePage             │   │
│  │Page (全域)       │  │ ┌─────────────────────┐  │   │
│  │• 卡片瀏覽        │  │ │PreviewPanel         │  │   │
│  │• 分類篩選        │  │ │• 右鍵→儲存為元件    │  │   │
│  │• 搜尋            │  │ └─────────────────────┘  │   │
│  │• 預覽/編輯       │  │ ┌─────────────────────┐  │   │
│  └──────────────────┘  │ │ComponentPicker      │  │   │
│                        │ │• 選擇注入的元件      │  │   │
│                        │ └─────────────────────┘  │   │
│                        └─────────────────────────┘   │
└──────────────────┬──────────────────────────────────┘
                   │ REST API
┌──────────────────▼──────────────────────────────────┐
│                 Express Backend                       │
│                                                      │
│  ┌────────────────┐  ┌────────────────────────────┐  │
│  │components.ts   │  │componentExtractor.ts       │  │
│  │(CRUD routes)   │  │• DOM → HTML/CSS 擷取       │  │
│  │                │  │• 自動截圖 (Playwright)      │  │
│  └────────────────┘  └────────────────────────────┘  │
│                                                      │
│  ┌────────────────┐  ┌────────────────────────────┐  │
│  │componentInject │  │websiteCrawler.ts (修改)     │  │
│  │• prompt 注入    │  │• 擷取頁面元件              │  │
│  └────────────────┘  └────────────────────────────┘  │
│                                                      │
│  ┌──────────────────────────────────────────────┐    │
│  │ SQLite                                        │    │
│  │ components / component_versions /             │    │
│  │ project_component_bindings                    │    │
│  └──────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────┘
```

## Database Schema

### `components` table
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | UUID |
| name | TEXT NOT NULL | 元件名稱 |
| category | TEXT NOT NULL | navigation / card / form / button / hero / footer / modal / table / other |
| html | TEXT NOT NULL | HTML 片段 |
| css | TEXT NOT NULL | Scoped CSS |
| thumbnail | TEXT | Base64 截圖 |
| tags | TEXT | JSON array of tags |
| source_url | TEXT | 來源網址（若從 crawler 擷取） |
| source_project_id | TEXT | 來源專案 ID（若從原型擷取） |
| version | INTEGER DEFAULT 1 | 目前版本號 |
| created_at | TEXT | ISO datetime |
| updated_at | TEXT | ISO datetime |

### `component_versions` table
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | UUID |
| component_id | TEXT FK | → components.id |
| version | INTEGER | 版本號 |
| html | TEXT | 該版本 HTML |
| css | TEXT | 該版本 CSS |
| thumbnail | TEXT | 該版本截圖 |
| created_at | TEXT | ISO datetime |

### `project_component_bindings` table
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | UUID |
| project_id | TEXT FK | → projects.id |
| component_id | TEXT FK | → components.id |
| bound_at | TEXT | ISO datetime |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/components` | 列出所有元件（支援 ?category=&search=&page=&limit=） |
| GET | `/api/components/:id` | 取得元件詳情（含版本歷史） |
| POST | `/api/components` | 新增元件 |
| PUT | `/api/components/:id` | 更新元件（自動建立新版本） |
| DELETE | `/api/components/:id` | 刪除元件 |
| POST | `/api/components/extract` | 從 HTML 片段擷取為元件（含自動截圖） |
| POST | `/api/components/crawl-extract` | 從 URL 爬取並擷取元件 |
| GET | `/api/projects/:id/components` | 取得專案綁定的元件 |
| POST | `/api/projects/:id/components/bind` | 綁定元件到專案 |
| DELETE | `/api/projects/:id/components/:componentId` | 解除綁定 |

## AI Prompt Injection Flow

```
使用者觸發生成
    │
    ▼
取得專案綁定的元件（project_component_bindings）
    │
    ▼
根據頁面架構中的元件類型，匹配元件庫分類
  例：架構有 "navigation" → 匹配 category=navigation 的元件
      架構有 "card-list" → 匹配 category=card 的元件
    │
    ▼
注入到 sub-agent prompt：
  「以下是元件庫中已驗證的元件，請優先使用這些 HTML/CSS 結構。
   若需修改，保持整體風格一致。
   [component: Navigation Bar]
   <nav>...</nav>
   <style>...</style>
   [/component]」
    │
    ▼
Sub-agent 生成時優先引用，新生成的元件標記為 [new]
```

## Component Categories

| Category | 中文 | 匹配關鍵字 |
|----------|------|-----------|
| navigation | 導航列 | nav, navbar, sidebar, menu, breadcrumb |
| card | 卡片 | card, tile, item, listing |
| form | 表單 | form, input, select, checkbox, radio |
| button | 按鈕 | button, btn, cta, action |
| hero | 主視覺 | hero, banner, jumbotron, splash |
| footer | 頁尾 | footer, bottom-bar |
| modal | 彈窗 | modal, dialog, popup, overlay |
| table | 表格 | table, grid, data-list |
| other | 其他 | — |
