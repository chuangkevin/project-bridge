# DesignBridge UI 重構設計規格

**日期**：2026-05-25
**範圍**：全面重構 — 視覺設計升級、版面結構重組、程式碼拆分

---

## 一、目標與背景

### 重構目標

1. **視覺設計全面升級**：套用深色玻璃擬態主題，提升品牌識別與設計工具質感
2. **版面結構重組**：引入 Context Panel 概念，消除 tab 切換混亂
3. **程式碼結構拆分**：WorkspacePage（2900 行）、ChatPanel（2444 行）等巨型檔案切割為職責單一的元件

### 核心痛點（重構前）

- Chat Panel 預設寬度佔空間過多，Preview 區域太小
- Header toolbar 按鈕過多，主次不明
- 左側 chat/design/style 三個 tab 關係不清楚
- 整體視覺缺乏設計工具的精緻感與品牌識別

---

## 二、視覺方向

**深色玻璃擬態（Dark Glassmorphism）**

- 配色：B 方案（深色主視覺 + 紫色漸層 accent）
- 結構：A 方案（固定左側欄 + 右側 Preview）
- 版面概念：B 方案（Icon Rail + Context Panel + Preview）

---

## 三、色彩系統

### 背景層

| Token | 值 | 用途 |
|---|---|---|
| `--bg-root` | `#060d1a` | 最底層背景 |
| `--bg-primary` | `#0f172a` | 主背景 |
| `--bg-elevated` | `#1e293b` | 抬升面板 |
| `--bg-input` | `#334155` | 輸入框背景 |

### 品牌 / Accent

| Token | 值 | 用途 |
|---|---|---|
| `--accent-grad` | `linear-gradient(135deg, #7c5cbf, #c084fc)` | 主要 CTA 按鈕、active 狀態 |
| `--accent` | `#7c5cbf` | 單色 accent |
| `--accent-glass` | `rgba(124, 92, 191, 0.22)` | Glass active 背景 |
| `--accent-subtle` | `rgba(192, 132, 252, 0.15)` | 淡 accent 底色 |

### 文字層（深色底）

| Token | 值 | 用途 |
|---|---|---|
| `--text-primary` | `#f1f5f9` | 標題、主文字 |
| `--text-secondary` | `#e2e8f0` | 區塊標題 |
| `--text-body` | `#cbd5e1` | 內文重點 |
| `--text-muted` | `#94a3b8` | 一般內文（**最低下限，不可再淺**） |
| `--text-accent` | `#e9d5ff` | Accent 區域 label / caption |

### 邊框

| Token | 值 | 用途 |
|---|---|---|
| `--border-default` | `#334155` | 一般邊框 |
| `--border-subtle` | `#1e293b` | 細分隔線 |
| `--border-accent` | `rgba(192, 132, 252, 0.3)` | Accent 邊框 |
| `--border-accent-hi` | `rgba(192, 132, 252, 0.5)` | Active 高亮邊框 |

---

## 四、對比度規則（強制）

### 允許

- 深色背景 → `#f1f5f9` / `#e2e8f0`（白/淺灰字）
- Glass panel → `#f1f5f9` 以上（白字）
- Accent 按鈕 → `#ffffff` 純白字（永遠不例外）
- Muted 文字在深色底最低 `#94a3b8`
- Accent 區域 label → `#e9d5ff`

### 禁止

- 淺色/半透明背景 + 淺灰字（對比不足）
- Purple tint 背景 + 紫色字
- 任何文字低於 `#94a3b8`（深色底下）
- Glass card + `#64748b` 以下字色
- **淺底 + 淺字任意組合**

> 設計原則：所有文字配色在實作前先以肉眼確認，若需辨識努力則視為不合格。

---

## 五、Glass 效果規格

### Context Panel Glass

```css
background: rgba(20, 30, 50, 0.75);
backdrop-filter: blur(16px);
border: 1px solid #334155;
border-radius: 0; /* 邊框貼合版面 */
```

### Active / Selected Glass

```css
background: rgba(124, 92, 191, 0.25);
backdrop-filter: blur(8px);
border: 1px solid rgba(192, 132, 252, 0.4);
border-radius: 8px;
```

### Floating Card Glass

```css
background: rgba(15, 23, 42, 0.90);
backdrop-filter: blur(20px);
border: 1px solid rgba(192, 132, 252, 0.2);
box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
border-radius: 10px;
```

---

## 六、字體層級

| 層級 | 大小 / 字重 | 顏色 | 用途 |
|---|---|---|---|
| 頁面標題 | 20px / 700 | `#f1f5f9` | 主標題 |
| 區塊標題 | 16px / 600 | `#e2e8f0` | 區塊 heading |
| 內文重點 | 14px / 500 | `#cbd5e1` | 強調內文 |
| 一般內文 | 14px / 400 | `#94a3b8` | 說明文字（最低下限） |
| Label / Caption | 11px / 700 caps | `#e9d5ff` | 分區標籤（accent 區域） |
| 按鈕文字 | 13-14px / 600 | `#ffffff` | 所有按鈕（永遠純白） |

---

## 七、版面結構

### 整體佈局

```
WorkspacePage（全螢幕）
├── WorkspaceHeader（頂部，固定高度 44px）
└── WorkspaceBody（flex row，剩餘空間）
    ├── ModeRail（最左，寬 48px，icon 垂直列）
    ├── ContextPanel（可調寬，預設 300px）
    └── PreviewArea（右側，flex: 1）
```

### WorkspaceHeader

- Logo + 專案名稱（可 inline 編輯）
- 右側只保留：Share 按鈕、匯出按鈕
- 移除：DeviceSize selector（搬至 PreviewArea）、模式切換 tab（搬至 ModeRail）

### ModeRail

- 垂直 icon 列，切換三種模式：設計 / 顧問 / 架構
- Active 狀態：`--accent-glass` 背景 + `--border-accent-hi` 邊框
- 每個 icon 下方顯示文字標籤（12px 以上，`#f1f5f9`）
- 底部放設定入口

### ContextPanel（Context Panel 概念）

根據 `activeMode` 渲染對應子元件：

| activeMode | 渲染元件 | 說明 |
|---|---|---|
| `'consultant'` | `ConsultantContextPanel` | 完整 chat UI |
| `'design'` | `DesignContextPanel` | Design 控制區 + 底部 compact chat input |
| `'architecture'` | `ArchContextPanel` | 架構工具 + 底部 compact chat input |

### PreviewArea

- 頂部小 toolbar：Preview / Spec / Code tab + DeviceSize selector
- 主區域：iframe preview 或 spec / code 面板

---

## 八、資料流設計

### 共享 messages thread（方案 1）

`messages: ChatMessage[]` 永遠存在 WorkspacePage，三個 ContextPanel 子元件共享同一份陣列。

- 切換模式不重置對話
- 顧問模式討論的需求，設計模式的 AI 完整可見
- `onSendMessage` callback 向上傳遞，三個子 Panel 皆可 append

### ContextPanel Props 介面

```typescript
interface ContextPanelProps {
  activeMode: 'design' | 'consultant' | 'architecture';
  messages: ChatMessage[];
  onSendMessage: (text: string, images?: File[]) => void;
  html: string | null;
  setHtml: (html: string) => void;
  project: Project;
  width: number;
  onResize: (width: number) => void;
}
```

### 各模式 Chat 呈現

- **顧問模式**：完整 ChatPanel UI（訊息列表 + 輸入框 + 檔案上傳）
- **設計模式**：Design 控制區佔主體，底部固定 compact 輸入列
- **架構模式**：架構工具佔主體，底部固定 compact 輸入列

---

## 九、程式碼拆分計畫

### 檔案對照表

| 新檔案 | 來源 | 類型 | 目標行數 |
|---|---|---|---|
| `WorkspacePage.tsx` | 現有（2900 行）精簡 | 精簡 | ~450 行 |
| `WorkspaceHeader.tsx` | 從 WorkspacePage 抽出 | 新建 | ~150 行 |
| `ModeRail.tsx` | 從 WorkspacePage 抽出 | 新建 | ~100 行 |
| `ContextPanel.tsx` | 新 wrapper 元件 | 新建 | ~80 行 |
| `ConsultantContextPanel.tsx` | ChatPanel.tsx（2444 行）重構 | 重構 | ~600 行 |
| `DesignContextPanel.tsx` | DesignPanel + StyleTweaker 合併重構 | 重構 | ~500 行 |
| `ArchContextPanel.tsx` | ArchitectureTab.tsx 重構 | 重構 | ~300 行 |
| `PreviewArea.tsx` | 從 WorkspacePage 抽出 | 新建 | ~200 行 |
| `theme-dark.css` | theme.css 擴充 | 新建 | ~120 行 |
| `ChatPanel.tsx`（舊） | — | 逐步廢棄 | 移除 |

### CSS 策略

- **不**引入 CSS Modules 或 Tailwind，保持現有架構一致
- 新增 `packages/client/src/styles/theme-dark.css`，定義深色玻璃 CSS tokens
- 現有 inline style 物件逐步遷移至 CSS variables
- 新 token 命名：`--bg-glass`、`--border-accent`、`--accent-grad` 等

---

## 十、分階段執行計畫

### Phase 1：主題系統（視覺升級）— 最低風險

不動元件結構，只改視覺：

1. 新增 `theme-dark.css`，定義所有深色 token
2. WorkspacePage inline styles → CSS variables
3. ChatPanel、DesignPanel 同步套用新色彩規格
4. 驗證對比度規則全部通過（目測 + WCAG AA 4.5:1）

### Phase 2：結構重組（元件拆分）

1. 建立 `WorkspaceHeader`、`ModeRail`
2. 建立 `ContextPanel` wrapper
3. ChatPanel → `ConsultantContextPanel`（接入 shared messages）
4. DesignPanel + StyleTweakerPanel → `DesignContextPanel`
5. ArchitectureTab → `ArchContextPanel`
6. WorkspacePage 精簡至 ~450 行

### Phase 3：PreviewArea 抽離 + 收尾

1. Preview / Spec / Code tab 邏輯抽出為 `PreviewArea`
2. DesignContextPanel、ArchContextPanel compact chat input 實作
3. 舊 `ChatPanel.tsx` 等廢棄檔案移除
4. E2E 全套 61 tests 驗收通過

---

## 十一、測試策略

- 每個 Phase 完成後執行 `pnpm test:e2e:smoke`，確認無 regression
- Phase 3 完成後執行完整 61 tests：`pnpm test:e2e`
- 視覺對比度變更不影響現有 E2E 邏輯，Phase 1 風險最低
- 拆分元件時保持 props interface 向後相容，避免連帶破壞

---

## 十二、不在範圍內

- HomePage、SettingsPage、LoginPage 等非 Workspace 頁面
- 新功能開發（僅重構現有功能）
- 後端 / API 變更
- E2E test 新增（僅驗收現有 tests）
- Mobile viewport 行為（保持現有邏輯不動）
