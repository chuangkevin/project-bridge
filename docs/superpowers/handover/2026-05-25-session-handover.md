# 交接文件：UI 重構 + OpenCode timeout 修復

**日期**：2026-05-25  
**Branch**：`main`  
**最後 commit**：`99ba59d`

---

## 一、本次 Session 完成的工作

### Phase 1：深色玻璃主題（視覺升級）

| Commit | 說明 |
|---|---|
| `806bb8b` | 建立 `theme-dark.css`，定義所有深色 CSS token |
| `26d93b9` | WorkspacePage inline styles → CSS variables |
| `ca20a4b` | ChatPanel 套用新色彩 |
| `b7b8d8b` | DesignPanel + StyleTweakerPanel 套用新色彩 |
| `5a983b7` | 修正 empty state card 殘留的 Catppuccin 顏色 |

### Phase 2：結構重組（元件拆分）

| Commit | 說明 |
|---|---|
| `7e904ff` | 抽出 `WorkspaceHeader`（245 行，含 inline 專案名稱編輯） |
| `87473ef` | 抽出 `ModeRail`（垂直 icon 列，取代舊的水平模式 tab） |
| `7f49434` | 新建 `ConsultantContextPanel`（ChatPanel wrapper + 顧問模式 header） |
| `ec00a60` | 新建 `DesignContextPanel`（設計/樣式 sub-tab + compact chat input） |
| `238d50d` | 新建 `ArchContextPanel`（架構工具 + compact chat input） |
| `2161406` | 新建 `ContextPanel`（mode-adaptive wrapper，`data-testid="context-panel"`） |
| `ce0bd92` | WorkspacePage 接入 ContextPanel + ModeRail，移除舊 tab 邏輯 |

### Phase 3：PreviewArea 抽離 + WorkspacePage 精簡

| Commit | 說明 |
|---|---|
| `4a710c5` | 新建 `PreviewArea`（24 props，抽出 code view + preview view 邏輯） |
| `537dfb4` | 修正 device frame 邊框殘留 `#333` → `var(--border-secondary)` |
| `21c2eac` | WorkspacePage 接入 PreviewArea，移除 `renderWorkspacePreviewPane()`（約 535 行）；目前 2302 行 |

### OpenCode timeout 修復

| Commit | 說明 |
|---|---|
| `99ba59d` | 修復三處造成 OpenCode timeout 的短 timeout 設定 |

---

## 二、根因與修復（OpenCode timeout）

### 問題
OpenCode 是 **pseudo-stream**：`streamContent()` 內部呼叫 `generateContent()` → `sendMessage()`，用 bare `fetch()` 等待**完整 LLM 回應**才 return。無法逐字串流。對 8192 token 的 UI HTML，本機 server 推論時間可達 60-120 秒。

### 三處 timeout 問題

| 檔案 | 舊值 | 新值 | 說明 |
|---|---|---|---|
| `packages/server/src/services/subAgent.ts:121` | 60s | **300s** | `generateWithSelection` 等待整頁 HTML (8192 token)，OpenCode 超過 60s → 拋出 "Timeout generating {page}" |
| `packages/server/src/services/skillConflictChecker.ts:77` | 15s | **60s** | JSON 衝突檢查 (2048 token)，OpenCode 需 20-60s |
| `packages/server/src/routes/chat.ts`（單頁生成路徑） | 無 heartbeat | **15s heartbeat** | `streamWithRetry` 等待 65536 token 回應時長達 2-5 分鐘，瀏覽器因 SSE 無資料而中斷連線 |

### 重要架構說明
- `OpenCodeProviderAdapter.sendMessage()` 使用 bare `fetch()` **沒有 timeout signal**
- Node 22 / undici 6.x 的 `headersTimeout` 預設 300s，因此 undici 本身不是問題
- 問題在於應用層的 `setTimeout` 早於 OpenCode 完成推論就觸發

---

## 三、目前元件結構

```
WorkspacePage（2302 行，仍有大型 styles 物件）
├── WorkspaceHeader              packages/client/src/components/WorkspaceHeader.tsx
├── ModeRail                     packages/client/src/components/ModeRail.tsx
├── ContextPanel（wrapper）       packages/client/src/components/ContextPanel.tsx
│   ├── ConsultantContextPanel   packages/client/src/components/ConsultantContextPanel.tsx
│   ├── DesignContextPanel       packages/client/src/components/DesignContextPanel.tsx
│   └── ArchContextPanel         packages/client/src/components/ArchContextPanel.tsx
└── PreviewArea                  packages/client/src/components/PreviewArea.tsx
```

---

## 四、CSS token 系統

主題檔案：`packages/client/src/styles/theme-dark.css`  
載入點：`packages/client/src/main.tsx`（緊接 theme.css 之後）

### 關鍵 token

| Token | 值 | 用途 |
|---|---|---|
| `--bg-root` | `#060d1a` | 最底層背景 |
| `--bg-primary` | `#0f172a` | 主背景 |
| `--bg-elevated` | `#1e293b` | 抬升面板 |
| `--accent-glass` | `rgba(124,92,191,0.22)` | active 背景 |
| `--text-primary` | `#f1f5f9` | 標題、主文字 |
| `--text-muted` | `#94a3b8` | **最低下限，不可再淺** |
| `--border-accent-hi` | `rgba(192,132,252,0.5)` | active 邊框 |

**對比度規則（強制）**：深色底文字最低 `#94a3b8`；accent 按鈕永遠 `#ffffff`；禁止淺底配淺字。

---

## 五、已知問題 / 未完成

### E2E Tests
前次會話後 E2E selectors 因 ModeRail 取代舊 tab 而部分失效。本次未修復（使用者明確指示「不要再 e2e 了」）。E2E 需依序核對 ModeRail 的 `data-testid`：

```
mode-consultant  → [data-testid="mode-consultant"]
mode-design      → [data-testid="mode-design"]  
mode-architecture → [data-testid="mode-architecture"]
```

### WorkspacePage 仍有大型 styles 物件
目前 2302 行，含大量 inline style 物件（部分已遷移至 CSS variables，但尚未全部完成）。  
規格目標是 ~450 行，仍有差距。

### 原始 ChatPanel.tsx 尚未移除
規格計畫逐步廢棄，目前仍存在。`ConsultantContextPanel` 是 wrapper 而非完整重寫，舊 `ChatPanel.tsx` 仍被 import。

---

## 六、相關文件位置

| 文件 | 路徑 |
|---|---|
| UI 重構設計規格 | `docs/superpowers/specs/2026-05-25-ui-refactor-design.md` |
| UI 重構實作計畫 | `docs/superpowers/plans/2026-05-25-ui-refactor.md` |
| 本交接文件 | `docs/superpowers/handover/2026-05-25-session-handover.md` |
| CSS token 系統 | `packages/client/src/styles/theme-dark.css` |
| Provider 單例 | `packages/server/src/services/provider.ts` |
| OpenCode timeout（修復後） | `packages/server/src/services/subAgent.ts:121`（300s）|

---

## 七、下次接手的起點

1. **確認 OpenCode fix 有效**：啟動 dev server (`pnpm dev:server` + `pnpm dev:client`)，用設計模式送一個有 3-4 頁的 UI 需求，確認 `parallel generation` 完整跑完不 timeout。
2. **E2E 修復**（若需要）：對照 ModeRail `data-testid` 更新 `workspace.spec.ts` 等相關測試。
3. **WorkspacePage 進一步精簡**（可選）：繼續將殘留 inline styles 遷移至 CSS variables，目標 ~450 行。
4. **移除 ChatPanel.tsx**（Phase 3 收尾）：將 `ConsultantContextPanel` 改為獨立實作，不再 import 舊 ChatPanel。
