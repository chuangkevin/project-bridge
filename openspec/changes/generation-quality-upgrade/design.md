## Architecture

### 1. Design System Document (~5000 字)

升級 `global_design_profile.design_convention` 內容，從 1123 字純色彩列表 → 完整設計系統：

```
# HousePrice Design System v2

## 色彩系統
- Primary: #8E6FA7 (purple) — 按鈕、選中狀態、focus border
- CTA: linear-gradient(180deg, #EAAB57, #F97D03) — 僅用於最高優先級按鈕
- Page BG: #FAF4EB — 全站暖米色，絕非純白
- Surface: #F8F7F5 — 卡片、區塊背景
- 完整 token 對照表（c-purple-100~900, c-dark-100~900, c-brown-100~600）

## Typography
- Font: system sans-serif (-apple-system, ...)
- 標題: 24px bold, 副標: 18px bold, 內文: 16px, 次要: 14px, 最小: 12px
- 行高: 1.5 body, 1.25 heading

## Component Patterns
- Button: solid purple #8E6FA7 / orange gradient CTA / brown secondary
- Card: bg #F8F7F5, NO border, NO heavy shadow, image 16:9 with overlay
- Input: white bg, #D5D5D5 border, focus #8E6FA7, height 48px
- Badge/Tag: bg #EBE3F2 (purple-100), text #8E6FA7
- Navigation: header #8E6FA7 purple, sub-nav #F1F1F1 gray

## Layout
- Max-width: 1200px centered
- Grid: 2-3 columns desktop, 1 column mobile
- Compact spacing, information-dense
- Breakpoints: sm=640, md=768, lg=992, xl=1280

## ❌ ANTI-PATTERNS (MUST AVOID)
1. 大面積純色色塊（尤其黃/橘/紫作為 section background）
2. 純白背景 #FFFFFF（用 #FAF4EB 或 #F8F7F5）
3. 大範圍漸層（漸層只用在小按鈕上）
4. 粗重 drop shadow（最多 0px 1px 4px rgba(0,0,0,0.15)）
5. 全圓角按鈕 rounded-full（用 rounded 4px）
6. 彩色文字（文字只用灰階，除了狀態色：紅=降、綠=漲）
7. 裝飾性字型（只用系統 sans-serif）
8. 大量留白（設計偏資訊密集）
9. 藍色作為主色（主色是紫色 #8E6FA7）
10. 有邊框的卡片（卡片用背景色區分，不用 border）
```

### 2. Master Agent Prompt 重構

`masterAgent.ts` 的 prompt 改動：

```diff
- You are a UI architecture planner.
+ You are a senior UI architect for HousePrice (好房網), Taiwan's real estate platform.
+ You MUST follow the HousePrice Design System strictly.

+ DESIGN SYSTEM RULES:
+ - Page background: ALWAYS #FAF4EB (warm beige), NEVER #FFFFFF
+ - Cards: bg #F8F7F5, no borders, minimal shadow
+ - Primary interactive color: #8E6FA7 (purple)
+ - Typography: system sans-serif only
+ - Layout: max-width 1200px, information-dense
+ - NEVER use large solid color blocks for section backgrounds
+ - NEVER use garish gradients on sections
```

spec field 強制要求：
- 200+ 字包含：layout 描述、component list（每個 component 的屬性、資料欄位、互動）、navigation flow、empty state
- constraints 欄位列出每頁 MUST-HAVE 的 UI elements

sharedCss 強制要求：
- 200+ 行完整 CSS：reset + tokens + nav + cards + buttons + forms + badges + grid + responsive
- 使用 CSS variables 對應 design system tokens

### 3. Sub-Agent Prompt 重構

`subAgent.ts` 的 prompt 注入完整設計系統：

```diff
+ HOUSEPRICE DESIGN SYSTEM (MANDATORY):
+ ${designConvention.slice(0, 6000)}
+
+ ❌ VIOLATIONS THAT WILL BE REJECTED:
+ - Using #FFFFFF as page/section background
+ - Large solid color blocks (>200px height) in orange/yellow/purple
+ - Drop shadows larger than 4px blur
+ - Fonts other than system sans-serif
+ - Rounded-full buttons
+ - Empty placeholder cards with no content
```

### 4. Post-Generation Validator

新增 `designSystemValidator.ts`：

```typescript
interface ValidationResult {
  passed: boolean;
  violations: { rule: string; severity: 'error' | 'warning'; detail: string }[];
  score: number; // 0-100
}

function validateDesignSystem(html: string): ValidationResult {
  const violations = [];

  // Check for pure white backgrounds
  if (/background(-color)?:\s*#fff(fff)?[^a-f0-9]/i.test(html)) {
    violations.push({ rule: 'no-white-bg', severity: 'warning', detail: 'Found #FFFFFF background, should use #FAF4EB or #F8F7F5' });
  }

  // Check for large solid color blocks (inline style with height > 200px and solid bg)
  // Check for heavy shadows (blur > 4px)
  // Check for non-system fonts
  // Check for rounded-full
  // Check CSS variable usage rate

  return { passed: violations.filter(v => v.severity === 'error').length === 0, violations, score };
}
```

### 5. Convention Color Auto-Fix

擴充現有 `injectConventionColors()` in `htmlSanitizer.ts`：

```typescript
// Replace common violations:
// #FFFFFF → #FAF4EB (for large backgrounds)
// border-radius: 9999px → border-radius: 4px (for buttons)
// box-shadow with blur > 8px → cap at 4px
// font-family declarations → system sans-serif
```

## Constraints

- Design Convention 更新必須保持向下相容（不破壞現有專案）
- Master/Sub Agent prompt 長度不能超過 Gemini context limit（注意 convention 截取長度）
- Validator 是 post-processing，不阻塞生成（只是報告 + 自動修正）
