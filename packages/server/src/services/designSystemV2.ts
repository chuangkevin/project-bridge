export const HOUSEPRICE_DESIGN_SYSTEM_V2 = `
# HousePrice Design System v2

## 色彩系統 (Color Tokens)

### Primary — Purple
| Token | Hex | 用途 |
|---|---|---|
| c-purple-600 | #8E6FA7 | 主色：按鈕、選中狀態、focus border、搜尋按鈕 |
| c-purple-700 | #8557A8 | Hover 狀態 |
| c-purple-800 | #7D5B99 | Sub-nav hover |
| c-purple-400 | #9C74BC | 卡片 hover 文字 |
| c-purple-100 | #EBE3F2 | Tag/badge 背景 |

### Neutral — Gray Scale
| Token | Hex | 用途 |
|---|---|---|
| c-dark-900 | #333333 | 主要文字 |
| c-dark-800 | #434343 | Nav active 背景 |
| c-dark-700 | #666666 | 次要文字 |
| c-dark-600 | #8C8C8C | 第三層文字 |
| c-dark-500 | #B0B0B0 | 停用/placeholder |
| c-dark-400 | #D5D5D5 | 輸入框 border |
| c-dark-300 | #EAEAEA | 分隔線、hover bg |
| c-dark-200 | #F1F1F1 | 導覽列背景 |
| c-dark-100 | #F8F7F5 | 卡片背景 |

### Background — Warm Beige
| Token | Hex | 用途 |
|---|---|---|
| c-brown-600 | #B5A99D | 搜尋列背景 |
| c-brown-400 | #FAF4EB | 全站頁面背景（最重要！） |
| c-brown-300 | #F3F1EC | 次要區塊背景 |
| c-brown-100 | #FFFCF8 | 淺色卡片 |

### Accent / Status
| Token | Hex | 用途 |
|---|---|---|
| c-orange-700 | #F97D03 | CTA 漸層終點 |
| c-orange-300 | #EAAB57 | CTA 漸層起點 |
| c-red-700 | #EC3C1F | 降價、錯誤 |
| c-green-500 | #85BB0E | 漲價、正面 |

## Typography
- Font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif
- 標題: 24px font-weight 700
- 副標: 18px font-weight 700
- 內文: 16px font-weight 400
- 次要: 14px font-weight 400
- 最小: 12px font-weight 400
- Line-height: body 1.5, heading 1.25

## Component Patterns

### Buttons
- Primary: bg #8E6FA7, text white, border-radius 4px, padding 8px 16px
- CTA (最高優先): background linear-gradient(180deg, #EAAB57, #F97D03), text white
- Secondary: bg transparent, border 1px solid #D5D5D5, text #333
- Disabled: bg #E5E5E5, text #B0B0B0

### Cards
- Background: #F8F7F5 (NOT white, NOT bordered)
- Border: NONE (用背景色區分)
- Shadow: NONE or max 0px 1px 4px rgba(0,0,0,0.15)
- Border-radius: 0 or 4px (NOT rounded-lg, NOT rounded-xl)
- Image: 16:9 ratio, hover scale(1.05)
- Content padding: 16px 20px

### Inputs
- Background: white
- Border: 1px solid #D5D5D5
- Focus: border-color #8E6FA7
- Height: 48px
- Border-radius: 4px
- Padding: 8px 16px

### Badges / Tags
- Background: #EBE3F2 (purple-100)
- Text: #8E6FA7
- Font-size: 12px
- Padding: 2px 8px
- Border-radius: 4px

### Navigation
- Top bar: bg #8E6FA7, text white
- Sub-nav: bg #F1F1F1, text #434343 bold
- Active item: bg #434343, text white
- Hover: bg #EAEAEA or bg #434343 text white

## Layout Conventions
- Max-width: 1200px, margin 0 auto
- Grid: 2-3 columns desktop, 1 column mobile
- Card grid gap: 16-24px
- Section padding: 24px 0
- Compact, information-dense (NOT airy/spacious)
- Breakpoints: sm=640, md=768, lg=992, xl=1280

## ❌ ANTI-PATTERNS (MUST AVOID)
1. 大面積純色色塊 — 絕不用黃/橘/紫作為 section 背景，purple 只用在小元素
2. 純白背景 #FFFFFF — 頁面背景永遠用 #FAF4EB，卡片用 #F8F7F5
3. 大範圍漸層 — 漸層只用在小按鈕（CTA），絕不用在 hero section 或 header
4. 粗重陰影 — 最多 0px 1px 4px rgba(0,0,0,0.15)，絕不用 8px+ blur
5. 全圓角按鈕 — border-radius 最多 4px，絕不用 rounded-full/9999px
6. 彩色文字 — 文字只用灰階 (#333/#666/#8C8C8C)，狀態色例外 (紅=降/綠=漲)
7. 裝飾性字型 — 只用系統 sans-serif，絕不用 Google Fonts
8. 大量留白 — 設計偏資訊密集，section padding 不超過 32px
9. 藍色作為主色 — 主色是紫色 #8E6FA7，不是藍色
10. 有邊框的卡片 — 卡片用背景色 #F8F7F5 區分，不加 border
`;
