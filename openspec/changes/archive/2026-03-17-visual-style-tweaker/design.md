## Context

目前 WorkspacePage 的右側面板只有 ChatPanel 和 DesignPanel 兩個 tab。原型生成後，如需視覺微調（換色、改圓角）只能重新輸入 AI Prompt 重新生成，代價高且不直覺。

現有基礎建設：
- `bridgeScript.ts` 已有 postMessage 機制（navigate、annotation），可擴充
- `prototype_versions` 資料表儲存完整 HTML，可直接覆蓋更新
- DesignPanel 已有 CSS token 概念（primaryColor、borderRadius 等）

## Goals / Non-Goals

**Goals:**
- 從原型 HTML 自動萃取可編輯的樣式 token（CSS 變數優先，fallback 常見 class 模式）
- 提供即時預覽：用戶拖動滑桿/選色時，iframe 內樣式立即更新
- 儲存功能：將覆蓋樣式以 `<style id="__tweaker__">` 注入並更新資料庫 HTML
- 新增 tab「樣式」在 WorkspacePage 右側面板

**Non-Goals:**
- 不支援任意 CSS 屬性的 free-form 編輯（只針對偵測到的 token）
- 不修改 AI 生成邏輯
- 不支援多頁面各自獨立樣式覆蓋（套用到整份 HTML）
- 不做 undo/redo 堆疊（儲存即覆蓋）

## Decisions

### 1. CSS 萃取策略：CSS 變數為主，固定模式為輔

**決策**：先掃描 HTML 中所有 `:root { --xxx: value }` CSS 變數。若無變數，fallback 掃描常見模式：inline `background-color`、`color`、`border-radius` 出現頻率最高的值。

**理由**：gpt-4o 生成的 HTML 通常會用 CSS 變數集中管理主題色，直接萃取最可靠。Fallback 保障舊版本或無變數的原型也能微調。

**Alternatives considered**：全量掃描所有 CSS 規則太雜，使用者無法辨別哪個重要。

### 2. 即時注入方式：postMessage `inject-styles`

**決策**：在 bridgeScript 中新增 `{ type: 'inject-styles', css: string }` handler，收到後動態建立或更新 `<style id="__tweaker__">` 標籤。

**理由**：延續現有 postMessage 架構，iframe 不需 reload，延遲 < 50ms。

**Alternatives considered**：直接用 `srcdoc` 替換整個 iframe 內容——會閃爍且失去 DOM 狀態。

### 3. 儲存方式：`PATCH` 端點合併注入 style 標籤

**決策**：`PATCH /api/projects/:id/prototype/styles` 接收 `{ css: string }`，後端將 `<style id="__tweaker__">...</style>` upsert 進當前版本 HTML（若已存在則替換，否則插入 `</body>` 前），更新 `prototype_versions.html`。

**理由**：不建立新版本（避免污染版本歷史），只修改當前版本的樣式層。用戶可再次 AI 生成覆蓋，也可繼續微調。

**Alternatives considered**：建立新 prototype version——用戶才改個顏色就產生新版本，版本歷史會很亂。

### 4. UI 配置：新增第三個 tab「🎨 樣式」

**決策**：在 WorkspacePage tab bar 加入「🎨 樣式」tab，顯示 StyleTweakerPanel。只在有當前原型時才 enabled（無原型時 disabled + tooltip）。

**理由**：與 ChatPanel / DesignPanel 並列，使用者能明確知道這是第三個操作維度。

## Risks / Trade-offs

- **AI 生成的 HTML 格式不一致** → CSS 萃取可能漏掉部分 token。緩解：提供「手動新增」按鈕讓用戶自填 CSS 變數名稱作為補充。
- **覆蓋儲存後 AI 重新生成會蓋掉微調** → 屬於預期行為，在 UI 加一行說明「重新生成將重置樣式微調」。
- **`<style id="__tweaker__">` 與原有樣式衝突** → 因為插在 `</body>` 前，優先級最高，可覆蓋大部分情境。Edge case 如 `!important` 宣告無法覆蓋，屬已知限制。

## Migration Plan

- 無資料庫 schema 變更，純前端 + 單一新 API 端點
- 可隨時部署，不影響現有功能
- Rollback：移除 tab 入口即可，HTML 中殘留的 `<style id="__tweaker__">` 無害
