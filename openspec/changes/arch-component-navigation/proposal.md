## Why

目前架構圖只能定義頁面間的連線（Page A → Page B），無法指定是頁面上哪個元件觸發導航。這導致 AI 生成時不知道「搜尋按鈕導到搜尋結果頁」還是「卡片點擊導到詳細頁」，只能猜測。

更關鍵的是，許多 UI 元件有**狀態切換**行為：下拉選單選「租屋」時下方列表要換成租屋版面、Radio button 選不同選項會顯示不同頁面內容。這些目前完全無法在架構圖中表達。

## What Changes

### 架構圖頁面節點擴展
- 每個頁面節點可以**展開**，顯示該頁的元件列表
- 元件來源：從 analysis_result 的 components 自動載入，或使用者手動新增
- 每個元件可以輸入**描述**（如「坪數輸入框，限正數 0-10000」）
- 每個元件可以設定**限制條件**（type, min, max, pattern, required）

### 元件級導航連線
- 元件可以拉線連到其他頁面（如：搜尋按鈕 → 搜尋結果頁）
- 按鈕/連結類元件：點擊 → 導航到目標頁面
- 下拉選單/Radio button 類元件：**多狀態導航** — 不同選項對應不同頁面或不同佈局
  - 例如：Tab「買屋/租屋/社區」→ 選買屋時顯示買屋列表，選租屋時顯示租屋列表
  - 例如：Radio「月租/年租」→ 選月租顯示月租價格欄位，選年租顯示年租價格欄位

### 狀態切換定義
- 下拉選單、Tab、Radio button 類元件可以定義**多個狀態**
- 每個狀態可以關聯到：
  - 導航到不同頁面（`showPage('租屋列表')`)
  - 切換同頁面內的區塊顯示（`showSection('rent-section')`)
  - 改變下方元件的內容（如篩選器選項改變）

### 生成 prompt 升級
- 從「Page A clickable elements → Page B」升級為：
  ```
  Page 首頁:
    - search-btn (按鈕): onClick → showPage('搜尋結果頁')
    - recommend-card (卡片): onClick → showPage('詳細頁')
    - tab-buy (Tab): onClick → showPage('買屋列表')
    - tab-rent (Tab): onClick → showPage('租屋列表')
    - type-dropdown (下拉選單):
      - 選「住宅」→ 顯示住宅篩選器
      - 選「土地」→ 顯示土地篩選器
      - 選「商辦」→ 顯示商辦篩選器
  ```

## Capabilities

### New Capabilities
- `arch-component-list`: 架構圖頁面節點內的元件列表 — 自動從 analysis_result 載入或手動新增，每個元件有名稱、類型(button/input/select/radio/tab/card/link)、描述、限制條件
- `arch-component-navigation`: 元件級導航連線 — 從特定元件拉線到目標頁面，取代現有的頁面級 edge
- `arch-state-switching`: 多狀態元件定義 — 下拉選單/Tab/Radio 的每個選項可關聯不同目標頁面或區塊切換
- `arch-generation-prompt-upgrade`: 生成 prompt 從頁面級導航升級為元件級導航 + 狀態切換指令

### Modified Capabilities
- `prototype-preview`: 生成的 prototype 中，狀態切換元件(Tab/dropdown/radio)會有實際的 onclick/onchange handler 切換對應區塊

## Impact

- **Server**: architecture.ts 擴展 arch_data schema（nodes 內含 components 陣列）；chat.ts 的 architectureBlock 生成邏輯重寫（元件級導航指令）
- **Client**: ArchPageNode.tsx 擴展為可展開的元件列表；新增 ComponentEditor 彈窗（名稱、類型、描述、限制條件、狀態列表）；ArchFlowchart 支援元件到頁面的連線
- **DB**: arch_data JSON schema 擴展，向下相容（舊資料沒有 components 欄位時當空陣列處理）
- **AI prompts**: architectureBlock 從 `Page A → Page B` 升級為 `Page A / component-name (type) → Page B [on state: value]`
