## DB Schema

```sql
-- Migration 030
CREATE TABLE IF NOT EXISTS design_presets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  tokens TEXT DEFAULT '{}',
  reference_urls TEXT DEFAULT '[]',
  reference_analysis TEXT DEFAULT '',
  design_convention TEXT DEFAULT '',
  created_by TEXT,
  is_default INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

ALTER TABLE projects ADD COLUMN design_preset_id TEXT;
```

## API Endpoints

```
GET    /api/design-presets           — list all presets
POST   /api/design-presets           — create preset
PUT    /api/design-presets/:id       — update preset
DELETE /api/design-presets/:id       — delete preset (not if is_default)
POST   /api/design-presets/:id/copy  — duplicate preset
POST   /api/design-presets/analyze-url — { urls: string[] } → AI analysis → { tokens, analysis, convention }
```

## URL Analysis Flow

```
User pastes 1-3 URLs
  → Server fetches each URL (puppeteer or fetch + cheerio)
  → Extract: computed styles, color palette, font stacks, component patterns
  → Send extracted data to Gemini AI for synthesis
  → AI returns: { primaryColor, secondaryColor, fontFamily, borderRadius,
                   spacing, shadowStyle, designDirection, convention }
  → Save to preset
```

## UI Design

### Settings Page — 「設計風格庫」Section
```
┌──────────────────────────────────┐
│ 設計風格庫              ＋新增風格 │
├──────────────────────────────────┤
│ ┌─────────┐ ┌─────────┐ ┌─────┐ │
│ │ ●●● HP  │ │ ●●● 個人│ │ ●●● │ │
│ │ 好房網  │ │ 蘋果風  │ │ ... │ │
│ │ 預設 ⭐ │ │         │ │     │ │
│ │ 編輯 複製│ │ 編輯 刪除│ │     │ │
│ └─────────┘ └─────────┘ └─────┘ │
└──────────────────────────────────┘
```

Each card shows:
- 3 color dots (primary, secondary, accent)
- Name + description
- ⭐ if is_default
- Edit / Copy / Delete buttons

### Preset Editor Modal
```
┌─ 編輯設計風格 ──────────────────┐
│ 名稱: [好房網風格           ]    │
│ 描述: [暖米色+紫色品牌風格  ]    │
│                                  │
│ 色彩設定                         │
│ 主色: [#8E6FA7] ■               │
│ 副色: [#64748b] ■               │
│ 背景: [#FAF4EB] ■               │
│                                  │
│ 字型: [系統字型 ▼]              │
│ 圓角: [4px ────○──── 16px]      │
│ 陰影: [輕柔 ▼]                  │
│                                  │
│ 參考網站分析                     │
│ [https://buy.houseprice.tw    ] │
│ [https://www.apple.com/tw     ] │
│ [＋ 新增 URL]                    │
│ [🔍 AI 分析風格]                │
│                                  │
│ AI 分析結果:                     │
│ ┌────────────────────────────┐  │
│ │ 此網站採用暖色調設計...     │  │
│ └────────────────────────────┘  │
│                                  │
│          [取消]  [儲存]          │
└──────────────────────────────────┘
```

### New Project Dialog — Preset Selector
```
設計風格: [好房網風格 ▼]
         ├── 好房網風格 ⭐
         ├── 個人蘋果風格
         ├── 客戶 A 品牌
         └── 不使用預設
```

## Generation Integration

1. `chat.ts` — 讀取 `projects.design_preset_id` → 查 `design_presets.design_convention`
2. 如果有 preset → 用 preset 的 convention + tokens
3. 如果沒有 → fallback 到 global_design_profile（現有行為）
4. `parallelGenerator.ts` — 從 designConvention 提取 primary color 替換 :root
