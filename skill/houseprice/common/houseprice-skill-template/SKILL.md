---
name: houseprice-skill-template
description: 撰寫 HousePrice skill 的標準模板與規則。當需要新建或修改 skill 時使用此 skill，確保格式一致、內容符合原則。
---

# HousePrice Skill 撰寫模板

## 核心原則

1. **記錄從 code 看不出的業務知識，並配合 codebase 結合** — 業務邏輯 + 對應的程式碼位置/流程
2. **來源標記** — 每份 skill 標記知識來自哪些專案
3. **推斷必須驗證** — 從 code 推斷的結論先進 blockers 待驗證，確認後才寫入 skill
4. **endpoint 可以寫，實作不 copy** — 寫流程和呼叫關係，不搬方法內部邏輯
5. **SQL 可以寫如果幫助判斷** — 例如到期判斷的條件，但不是搬整段 query
6. **排程時間可以寫但不是重點** — 重點是流程有沒有過時
7. **歷史遺留要標記** — enum/feature 存在但沒被使用的，標記 ⚠️ 歷史遺留
8. **每次更新同步三件事** — skill + blockers + 依賴 map

---

## 檔案結構

### 標準 Skill（單檔）

```
skills/{業務領域}/{skill-name}/
└── SKILL.md
```

### 大 Skill（目錄化）

當 SKILL.md 過大時，SKILL.md 作為索引，連結到子檔案：

```
skills/{業務領域}/{skill-name}/
├── SKILL.md          ← 索引（總覽 + 連結）
├── sub-topic-1.md
├── sub-topic-2.md
└── sub-topic-3.md
```

### 業務領域分類

```
skills/
├── common/       # 共用/跨領域（架構、專案對照、工具）
├── business/     # 2B/007（物件管理、同步、會員）
├── community/    # 社區
├── price/        # 成交行情
└── {新領域}/     # 隨需求新增
```

---

## SKILL.md 模板

```markdown
---
name: houseprice-{功能名}
description: {一句話描述什麼時候該使用此 skill。包含關鍵觸發詞讓 AI 能判斷何時調用。}
---

# {標題}

> **來源專案**：`{專案1}`、`{專案2}`

## {核心概念/術語}

寫從 code 看不出的業務知識，並配合 codebase 作結合。

## {流程/資料流}

寫「誰呼叫誰做什麼」，endpoint 可以寫，實作不 copy。

## {狀態/類型}

Enum 值的業務意義。沒被使用的標記 ⚠️ 歷史遺留。

## Notes

慣例、例外、踩雷。
```

---

## 目錄化 SKILL.md 模板

```markdown
---
name: houseprice-{功能名}
description: {觸發描述}
---

# {標題}

> **來源專案**：`{專案1}`、`{專案2}`

## 總覽

{總覽表格或摘要}

## 詳細說明

- [{子主題1}](sub-topic-1.md) — 一句話描述
- [{子主題2}](sub-topic-2.md) — 一句話描述

## 共通模式

{跨子主題的共通知識}

## Notes

{全局注意事項}
```

---

## 寫作規則

### 語言
- 中文為主，技術術語維持英文
- 表格欄位名用英文，說明用中文

### 內容判斷

| 要寫 | 不寫 |
|------|------|
| 業務規則的 why | 方法內部的 if/else |
| 系統間呼叫關係 | 單一方法的實作細節 |
| 狀態的業務意義 | 能從 enum 定義直接看出的 |
| API endpoint | 方法的參數處理邏輯 |
| 跨 repo 才能看到的全貌 | 單一 repo 內讀 code 就能理解的 |
| 歷史脈絡/設計決策 | 當前程式碼的描述 |
| 踩雷筆記 | 正常運作的描述 |

### 驗證

- Subagent 回報的關鍵邏輯 → 自己 grep/read 驗證
- Enum/status → grep 呼叫端確認是否實際使用
- 推斷 → 先進 blockers，使用者確認後才寫入
- 核心流程 → 讀到 repository 層的 SQL/API call

### 更新同步

每次更新必須同步：
1. **Skill** — 新知識寫入（包含依賴關係、ES index 讀寫，寫在對應功能的 skill 中）
2. **blockers-and-questions.md** — 關閉已解決、新增未解決

### 依賴關係記錄原則

依賴關係（專案間呼叫、ES index 讀寫）**跟著各功能 skill 走**，不集中在 project-mapping。
- project-mapping 只負責專案清單、Port、URL Key 等事實性對照
- 各功能 skill 記錄自己的依賴（探索時已驗證，更可靠）
