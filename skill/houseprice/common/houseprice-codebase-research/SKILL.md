---
name: houseprice-codebase-research
description: HousePrice codebase 查詢規格與邏輯的標準流程。當需要調查某個功能的實作方式、理解專案間的依賴關係、或產出 skill/PRD 文件前的 research 階段時使用此 skill。確保查詢過程一致、產出結構化、不遺漏跨 repo 關聯。
---

# HousePrice Codebase Research Flow

## 開始新領域前必做

1. **先建立/確認 skill template 規則** — 不要邊做邊定義
2. **讀 code + 問使用者併行** — 先從 code 查出已知的，整理後告訴使用者，再提出不知道的問題。不要卡住等回答，也不要只從 code 推斷就當事實
3. **資料流方向要驗證** — 「A → B → C」還是「C → B → A」，從 code 推斷後標記待驗證，確認後才寫入 skill

---

## 功能評估流程

收到功能需求（新增欄位、新增廣告類型、改刊登流程等）時的標準評估流程：

```
1. 判斷業務流程
   → 查 backend-architecture「業務流程跨專案分布」矩陣
   → 確認需求屬於哪個業務流程

2. 找影響的專案
   → 從矩陣的「寫入/排程/讀取」欄位找出涉及的專案
   → 跳到對應 skill 讀細節

3. 判斷影響等級
   → 查 object-management「欄位變更影響範圍」分層
   → 確認欄位/功能要出現在哪裡（B端? C端? 歸戶?）
   → 對應到影響等級（🟢小 / 🟡中 / 🔴大）

4. 確認欄位/資料是否已存在
   → 用 elasticsearch skill 查 ES mapping（不要靠記憶）
   → 用 mssql-mcp 查 SQL table schema
   → 已存在 = 改動小，不存在 = 需要新增

5. 列出需要改的 + 不需要改的
   → 查對應 skill 的「常見不需要做的情況」
   → 避免過度評估

6. 檢查交叉引用
   → 順著 skill 底部的「相關 skill」連結
   → 確認有沒有漏掉的上下游影響
```

---

## 查詢前準備

### 1. 確認 repo 可用性

```
需要查的 repo 是否已 clone 到本地？
  → 已 clone → git checkout develop && git pull（確保在 develop 分支且最新）
  → 未 clone → git clone -b develop {TFS_URL} 到 C:\Users\h3098\Desktop\repos\ 下
  → clone 失敗 → 退回 Gitea MCP（只能按路徑讀，不能搜尋）
```

**TFS Git URL 格式**：`http://tfs.evertrust.com.tw:8080/tfs/MISCollection/_git/{專案名稱}`

**分支**：develop / master / 測試機分支 — 專注在 **develop** 分支

### 2. 查既有文件

在開始讀 code 之前，先查是否已有相關知識：

- **HPSkills** — 對應業務領域資料夾下有沒有 skill
- **HP-Bible** — `2. 需求/`、`4. 結轉/` 等目錄下有沒有相關文件
- **Repo 內** — `CLAUDE.md`、`.claude/skills/`、`specs/`、`README.md`

---

## 查詢流程

### Phase 1: 找入口

```
從 Controller 找 API endpoint
  → 看 route、HTTP method、request/response DTO
  → 記錄 endpoint 清單
```

### Phase 2: 追邏輯鏈

```
Controller → Service → Repository
  → Service: 業務邏輯、狀態流轉、validation
  → Repository: 資料來源 (ES index / SQL table)
  → Model/DTO: 欄位意義
  → Enum: 狀態值、類型定義
```

### Phase 3: 找隱性知識

從 code 能看出的 → 直接記錄：
- Enum 值與命名
- 資料流方向
- 排程時間

從 code 看不出的 → 記入 blockers：
- 業務規則的 why
- 設計決策的理由
- 使用者操作流程

### Phase 4: 掃跨 repo 依賴

```
搜尋 URL Key 使用:
  → websiteUrlHelper / WebUrlOptions / HOUSEPRICE_WS_ / HOUSEPRICE_TASK_
  → 記錄: 本專案 → 呼叫 → 目標專案 (URL Key)
  → 同步更新 houseprice-project-mapping 的依賴 Map
```

---

## 跨 repo 處理

當邏輯跨越多個 repo 時：

### 佔位符機制

在目前 repo 看到呼叫外部 API 但無法追進去時，留下佔位符：

```markdown
<!-- CROSS-REPO: WS.Buy /api/v1/xxx — 待切換到 WebService.Buy 後補充 -->
```

### 補充時機

切換到新 repo 查詢時：
1. 搜尋所有佔位符 `CROSS-REPO`
2. 在新 repo 中找到對應的 endpoint
3. 補充完整邏輯後移除佔位符

---

## 產出格式

每次 research 完成後產出：

### 1. 發現記錄（寫入對應 skill 或新建）

只記錄**從 code 無法推斷的知識**：
- 系統間關係、資料流
- 狀態的業務意義
- 慣例 (convention)
- 例外與特殊情況

**來源標記**：每份 skill 的標題下方標記知識來自哪些專案，讓人可以追溯：

```markdown
# Skill 標題

> **來源專案**：`WebService.Business`、`Tasks.Buy.BusinessCase`
```

### 2. 待確認清單（寫入 blockers-and-questions.md）

```markdown
### [功能名稱]

**從 code 推斷（待驗證）：**
- [ ] 推斷 A — 正確？
- [ ] 推斷 B — 正確？

**從 code 看不出（需要使用者補充）：**
- [ ] 問題 A
- [ ] 問題 B

**跨 repo 佔位符（待切換 repo 後補充）：**
- [ ] CROSS-REPO: WS.Buy /api/v1/xxx
```

### 3. 依賴 Map 更新

發現新的 URL Key 使用 → 同步更新 `houseprice-project-mapping` skill。

---

## 驗證規則

### 1. 驗證 subagent 產出

Subagent 回報的關鍵邏輯（SQL query、API endpoint、資料流方向），**必須自己 grep/read 原始碼驗證後才能寫入 skill**。不能直接信任 subagent 的摘要。

> 教訓：subagent 曾回報 `EntrustDateTime < NOW` 作為到期判斷 SQL，但實際 repository 查的是 `AdaptedWebCaseAdvertisements.ExpiredDate`。

### 2. 區分「定義存在」vs「實際被使用」

看到 enum 值、status、feature flag 時，不只看定義，還要 **grep 它的呼叫端**確認是否有實際使用：

```
發現 enum 值或 status
  → grep 定義處（確認存在）
  → grep 呼叫處（確認有 Service/Job 設置這個值）
  → 沒有呼叫 → 標記為「歷史遺留」
```

> 教訓：`EntrustDueDate` 作為 enum 存在但沒有任何自動觸發機制，應該標記為歷史遺留。

### 3. 推斷 vs 事實分離

從 code 推斷的結論，在寫入 skill 前**必須標記為待驗證**，等使用者確認後才正式寫入。不能把自己的推斷當作既定事實。

```
我推斷 X → 先寫進 blockers「從 code 推斷（待驗證）」
使用者確認 → 才寫入 skill
使用者否定 → 修正 skill + 記錄正確答案
```

> 教訓：「委託期限和刊登期限是兩個不同的到期機制」是推斷，但寫成了既定事實。實際上只有刊登期限在運作。

### 4. 核心流程必須讀到 Repository 層

核心流程（觸發條件、狀態判斷、跨服務呼叫）**必須讀到 repository 層的實際 SQL/API call**，不能只停在 Service 層的方法名。

```
追邏輯鏈時:
  Controller → Service → ⚠️ 不能停在這裡
    → Repository → 讀實際 SQL query / HTTP call
    → 確認查的是哪張 table、哪個欄位、什麼條件
```

> 教訓：Service 層的方法名叫 `GetExpiredBuyCaseAsync` 但不代表裡面查的是你預期的欄位。

---

## 每次更新 Checklist

每次產出或收到回答，強制執行：

- [ ] **Skill 更新了？** — 新知識寫入對應 skill
- [ ] **Blockers 更新了？** — 關閉已解決、新增未解決
- [ ] **依賴關係更新了？** — 新的跨服務呼叫/ES 讀寫寫入對應 skill

漏任何一項 = 沒完成。

---

## 踩過的坑

### 1. 信任 subagent 不驗證
subagent 回報 `EntrustDateTime < NOW` 作為到期 SQL，實際是 `AdaptedWebCaseAdvertisements.ExpiredDate`。
→ **subagent 的關鍵邏輯必須自己 grep 驗證**

### 2. 推斷當事實
「委託期限和刊登期限是兩個不同的到期機制」是推斷，寫成既定事實。實際只有刊登期限。
→ **推斷先進 blockers 待驗證，確認後才寫入 skill**

### 3. 資料流方向搞反
一開始寫 WebCase → WebCaseGrouping → AdaptedWebCase，實際是反過來。
→ **從 code 推斷後標記待驗證，把已知的告訴使用者 + 提出不確定的，確認後才正式寫入**

### 4. 更新不同步
收到回答只更新 blockers 忘了 skill，查到新依賴忘了更新 map。
→ **強制 checklist：skill + blockers + 依賴**

### 5. 粒度失控
初版塞了 ES 分頁查詢、CoreProfiler、DI code example，全是雜訊。
→ **業務知識配合 codebase 結合，不是搬 code**

### 6. 規則建立太晚
template 和驗證規則是踩坑後才建立，前面的產出品質不一致。
→ **新領域開始前先確認規則**

---

## 注意事項

- **不要隨意操作測試機 API** — 只用 GET 查詢，POST/PUT/DELETE 需要使用者確認
- **排程時間等 snapshot 資訊** — 可以寫但不是重點
- **佔位符不要遺忘** — 定期檢查還有多少未補充的 CROSS-REPO 標記
