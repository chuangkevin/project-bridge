## Context

Phase 1+2 已建立對話生成、檔案上傳、註解系統。Design Input 是獨立功能，在現有架構上疊加：設計師填寫的 Design Profile 會在每次 AI 生成時自動注入 system prompt。

## Goals / Non-Goals

**Goals:**
- 設計師可在 Design 標籤頁輸入設計方向文字描述
- 設計師可上傳 1-5 張視覺參考圖，系統用 Vision API 分析並提取設計特徵
- 設計師可設定設計 token（主色、次色、字型、圓角大小、間距密度、陰影風格）
- Design Profile 自動注入每次 AI 生成的 prompt
- 生成後 UI 顯示「依照 Design Profile 生成」標記

**Non-Goals:**
- Figma 直接匯入
- 即時設計預覽（所見即所得編輯器）
- 多個 Design Profile 版本管理

## Decisions

### 1. Design Profile 資料結構

```
design_profiles:
  id TEXT PRIMARY KEY
  project_id TEXT UNIQUE (一個專案一個 profile)
  description TEXT (設計方向文字描述)
  reference_analysis TEXT (Vision API 分析結果，自動填入)
  tokens TEXT (JSON: { primaryColor, secondaryColor, fontFamily, borderRadius, spacing, shadowStyle })
  updated_at DATETIME
```

**理由**: UNIQUE on project_id 確保一對一關係，tokens 用 JSON 存避免過多欄位。

### 2. 視覺參考圖分析

**流程**:
1. 設計師上傳圖片（複用 Phase 2 的 multer upload middleware）
2. 後端將圖片 base64 後傳給 gpt-4o vision
3. Prompt: "Analyze this design reference image and describe: color palette (with hex codes), typography style, spacing density (compact/normal/spacious), border radius style (sharp/medium/rounded), shadow style (flat/subtle/prominent), overall aesthetic (minimalist/modern/playful/corporate/etc.)"
4. 將分析結果存入 `reference_analysis` 欄位
5. 回傳分析文字讓設計師看到/確認

**理由**: Vision 分析結果是文字，可以直接注入 prompt，不需要把圖片傳給生成用的模型（節省 token）。

### 3. Prompt 注入策略

在 system prompt 末尾加入 Design Profile block：

```
=== DESIGN PROFILE ===
Design Direction: {description}

Visual Reference Analysis:
{reference_analysis}

Design Tokens:
- Primary Color: {primaryColor}
- Secondary Color: {secondaryColor}
- Font Family: {fontFamily}
- Border Radius: {borderRadius} (sharp: 0-2px / medium: 4-8px / rounded: 12px+)
- Spacing: {spacing} (compact / normal / spacious)
- Shadow Style: {shadowStyle} (flat / subtle / prominent)

IMPORTANT: You MUST strictly follow this design profile when generating HTML/CSS. Use the exact colors, typography, spacing, and visual style described above.
======================
```

**理由**: 明確的 block 格式讓 AI 容易識別設計規格，IMPORTANT 強調確保遵守。

### 4. 前端 Design 標籤頁

工作區左側面板改為有兩個標籤：**Chat** 和 **Design**。

Design 標籤內容：
- **描述欄** — 多行文字輸入，placeholder: "描述你的設計方向，例如：現代簡約風格，主打企業感..."
- **參考圖上傳** — 最多 5 張，每張顯示縮圖 + Vision 分析結果（可展開）
- **Design Tokens** — 表單：
  - 主色 / 次色（color picker）
  - 字型（select: system / sans-serif / serif / monospace 或自填）
  - 圓角（slider: 0px-24px）
  - 間距密度（radio: 緊湊/正常/寬鬆）
  - 陰影（radio: 無/輕柔/明顯）
- **儲存按鈕** — 儲存後顯示「已儲存，下次生成將套用此設計」

### 5. API

- GET `/api/projects/:id/design` — 取得 design profile（不存在時回傳 null）
- PUT `/api/projects/:id/design` — 建立或更新 design profile（upsert）
- POST `/api/projects/:id/design/analyze-reference` — 上傳參考圖並取得 Vision 分析

## Risks / Trade-offs

- **Vision API 費用** — 每次分析圖片會使用 gpt-4o，費用高於 gpt-4o-mini。但只在設計師主動上傳時呼叫，不影響一般生成。
- **設計師不填 Design Profile** — 沒有 profile 時行為完全不變，向下相容。
- **AI 不完全遵守設計規格** — 透過強調 IMPORTANT 和具體的 token 值盡量確保，但 AI 偶爾可能忽略。未來可加驗證層。
