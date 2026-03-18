# 設計系統準則（HousePrice 系列產品）

> 以下準則由 buy.houseprice.tw / living、list、rent、price 頁面源碼分析歸納而來，適用於所有 HousePrice 相關產品。

---

## 一、色彩使用語義

### 主色（互動色）— 紫色系
| Token | Hex | 用途 |
|---|---|---|
| `c-purple-600` | `#8E6FA7` | 主要 CTA 按鈕背景、active 選取狀態、checkbox 圖示、focus border、搜尋按鈕 |
| `c-purple-700` | `#8557A8` | 下拉選單中已選取項目的文字色 |
| `c-purple-800` | `#7D5B99` | 次導覽 hover 文字色 |
| `c-purple-400` | `#9C74BC` | 卡片 hover 狀態文字色 |
| `c-purple-100` | `#EBE3F2` | 紫色輕底色、chip 背景 |

### 中性文字色 — 深灰色系
| Token | Hex | 用途 |
|---|---|---|
| `c-dark-900` | `#333333` | 主要內文文字、卡片標題 |
| `c-dark-800` | `#434343` | 導覽列 active 背景（深色版）、nav 文字 |
| `c-dark-700` | `#666666` | 次要文字、placeholder 文字 |
| `c-dark-600` | `#8C8C8C` | 第三層文字、區塊標籤（如「熱門生活圈」） |
| `c-dark-500` | `#B0B0B0` | 停用狀態圖示、empty state 文字、清除按鈕 |
| `c-dark-400` | `#D5D5D5` | 輸入框 border（預設）、分隔線 |
| `c-dark-300` | `#EAEAEA` | Hover 背景（nav 項目）、輕分隔線 |
| `c-dark-200` | `#F1F1F1` | 導覽列背景、下拉選單背景、卡片底色 |
| `c-dark-100` | `#F8F7F5` | 卡片元件背景、列表區塊底色 |

### 頁面背景色 — 棕色系
| Token | Hex | 用途 |
|---|---|---|
| `c-brown-600` | `#B5A99D` | 搜尋列背景、Search icon 色、漢堡選單圖示色 |
| `c-brown-400` | `#FAF4EB` | 全域頁面背景色（`c-background`） |
| `c-brown-300` | `#F3F1EC` | 次要背景區塊 |
| `c-brown-100` | `#FFFCF8` | 卡片極淡底色 |

### 強調 / 狀態色
| Token | Hex | 用途 |
|---|---|---|
| `c-orange-700` | `#F97D03` | Autocomplete 關鍵字高亮 |
| `c-orange-400` | `#F7991C` | CTA 漸層按鈕主色 |
| `c-red-700` | `#EC3C1F` | 降價徽章文字、錯誤狀態 |
| `c-red-500` | `#FD6141` | 降價徽章背景漸層 |
| `c-green-500` | `#85BB0E` | 漲跌正向 |
| `c-yellow-500` | `#FFFB83` | 頂部欄 hover 文字（`text-c-yellow-500`） |

---

## 二、漸層按鈕用法
| Token | 用途 |
|---|---|
| `gradient-orange-btn` | 主要 CTA 按鈕（橘色漸層，180deg #EAAB57→#F97D03） |
| `gradient-orange-btn-hover` | 橘色 CTA hover 狀態 |
| `gradient-brown-btn` | 次要按鈕（棕色漸層） |
| `gradient-brown-btn-active` | 次要按鈕 active 狀態 |
| `gradient-btn-disabled` | 停用按鈕 |
| `gradient-red` | 降價標籤背景 |
| `gradient-purple` | 紫色漸層裝飾元素 |

---

## 三、元件規格

### 搜尋框（Search Input）
- 背景：`bg-white`，圓角：`rounded`
- 高度：`lg:h-[48px]`，內距：`px-4 py-2`（desktop）/ `py-3`（mobile）
- 字色：`text-c-dark-900`，placeholder：`text-c-dark-700`
- Search icon 色：`text-c-brown-600`，尺寸：`size="20px"`
- Focus border：`border-c-purple-600`
- 清除按鈕：`text-c-dark-500 hover:text-c-dark-700`

### 下拉選單（Dropdown）
- 容器：`bg-white border border-gray-100 shadow-lg rounded`，最大高度：`max-h-80`
- 列表項：`px-4 py-3 text-sm text-c-dark-900 hover:bg-gray-50 transition-colors`
- 選取狀態：`bg-c-purple-600 text-white`
- 未選中：`bg-white text-c-dark-900 hover:bg-gray-100`
- 左側縣市欄：`bg-gray-50 border-r`
- 分隔線：`border-b border-gray-100`

### Autocomplete 下拉
- 背景：`bg-white border border-gray-200 rounded shadow-lg z-10`
- 關鍵字高亮文字色：`text-c-orange-700`
- 區塊標題（「熱門生活圈」）：`text-sm font-medium text-c-dark-600 px-4 py-3`

### Checkbox（自訂）
- 選取圖示：`fa-solid:check-square text-c-purple-600 size="16px"`
- 未選取圖示：`fa-regular:square text-c-dark-600 size="16px"`

### 主要按鈕（CTA）
- 搜尋按鈕：`bg-c-purple-600 text-white rounded`（desktop inline）
- 手機版全寬：`bg-c-purple-600 text-white px-4 py-3 w-full fixed bottom-0`

### 卡片（Card）
- 背景：`bg-c-dark-100`，圓角：無（預設）
- 圖片比例：`aspect-[16/9]`，hover 縮放：`lg:group-hover:scale-105`（`transition-transform duration-300`）
- 圖片漸層遮罩：`bg-gradient-to-b from-transparent to-black from-[73.843%]`
- 標題（overlay）：`font-bold text-white text-2xl leading-9`（`overflow-hidden whitespace-nowrap`）
- 內容區：`px-5 pt-4 pb-5 gap-2`
- 描述文字：`font-bold text-lg text-c-dark-900 line-clamp-2 lg:group-hover:text-c-purple-400`
- 位置文字：`text-sm text-c-dark-900`，位置圖示：`text-c-dark-900 size="16px"`

### 導覽列（Header）
- 頂部欄背景：`bg-c-purple-600`，文字：`text-white hover:text-c-yellow-500`
- 主導覽背景：`bg-c-dark-200`，文字：`text-c-dark-800 font-bold text-base`
- Nav 高度：`h-[60px]`
- Active 項目：`bg-c-dark-800 text-white`
- Hover：`hover:bg-c-dark-800 hover:text-white`（有子選單）/ `hover:bg-c-dark-300`（無子選單）
- 下拉選單：`bg-c-dark-200 shadow-[0px_1px_4px_0px_rgba(0,0,0,0.15)] rounded-b`，子項 hover：`hover:text-c-purple-600`
- 手機版漢堡選單圖示：`text-c-brown-600`

---

## 四、排版規格

### 字體大小（Tailwind 對應）
| 用途 | Class | 大小 |
|---|---|---|
| 卡片主標題（圖片上） | `text-2xl font-bold` | 24px |
| 卡片描述 / 次標題 | `text-lg font-bold` | 18px |
| 導覽文字 | `text-base font-bold` | 16px |
| 輸入框 / 一般文字 | `text-base` | 16px |
| 副文字 / 標籤 / 清單項 | `text-sm` | 14px |
| 小徽章 / 說明 | `text-xs` | 12px |

### 斷點（非標準，注意 lg = 992px）
| 名稱 | 寬度 |
|---|---|
| sm | 640px |
| md | 768px |
| **lg** | **992px**（非 Tailwind 預設 1024px） |
| xl | 1280px |
| 2xl | 1536px |

### 容器
- 最大寬度：`max-w-[1200px] mx-auto w-full`（class: `lay-1200`），只在 `lg` 以上啟用

---

## 五、互動狀態規則

1. **選取 / Active**：背景改 `bg-c-purple-600`，文字改 `text-white`
2. **Hover（深色）**：背景改 `bg-c-dark-800`，文字改 `text-white`
3. **Hover（淺色）**：背景改 `bg-gray-50` 或 `bg-c-dark-300`
4. **Focus（輸入框）**：border 改 `border-c-purple-600`，移除預設 outline
5. **Disabled**：使用 `gradient-btn-disabled`，圖示色 `text-c-dark-500`
6. **卡片 Hover**：圖片 `scale-105`，描述文字色改 `text-c-purple-400`

---

```
/*
  以下為設計常用色碼
  背景色        c-background
  LINE 背景色   c-line-green
  FB 背景色     c-facebook-blue
  漲跌用 (紅)   red-500
  漲跌用 (綠)   green-500
*/

const customColors = {
  // Configure your color palette here
  // Figma 色碼表 https://www.figma.com/design/Y7lr3j9F03HApoLrJOx5Ws/UI-kit?node-id=1-47&node-type=frame&m=dev
  'c-dark-900': '#333333',
  'c-dark-800': '#434343',
  'c-dark-700': '#666666',
  'c-dark-600': '#8c8c8c',
  'c-dark-500': '#b0b0b0',
  'c-dark-400': '#d5d5d5',
  'c-dark-300': '#eaeaea',
  'c-dark-200': '#f1f1f1',
  'c-dark-100': '#f8f7f5',
  'c-brown-900': '#66492e',
  'c-brown-700': '#9d8f81',
  'c-brown-600': '#b5a99d',
  'c-brown-500': '#e3d9cf',
  'c-brown-400': '#faf4eb',
  'c-brown-300': '#f3f1ec',
  'c-brown-200': '#fbf8f1',
  'c-brown-100': '#fffcf8',
  'c-orange-700': '#f97d03',
  'c-orange-500': '#eb8e13',
  'c-orange-400': '#f7991c',
  'c-orange-300': '#eaab57',
  'c-orange-200': '#f5e1cb',
  'c-orange-100': '#fdebcf',
  'c-yellow-500': '#fffb83',
  'c-red-700': '#ec3c1f',
  'c-red-500': '#fd6141',
  'c-green-700': '#3d9921',
  'c-green-500': '#85bb0e',
  'c-blue-900': '#0f87ba',
  'c-blue-700': '#4a88e6',
  'c-blue-200': '#eaf1ff',
  'c-purple-900': '#5b3977',
  'c-purple-800': '#7d5b99',
  'c-purple-700': '#8557a8',
  'c-purple-600': '#8E6FA7',
  'c-purple-400': '#9c74bc',
  'c-purple-300': '#d5a4ff',
  'c-purple-200': '#d7c8e4',
  'c-purple-100': '#ebe3f2',
};


const customColorsAlias = {
  'c-mobile-header-background': customColors['c-dark-800'],
  'c-background': customColors['c-brown-400'],
  'c-line-green': '#02BA02',
  'c-facebook-blue': '#276EE1',
  'c-youtube-red': '#FF0000',
};

```