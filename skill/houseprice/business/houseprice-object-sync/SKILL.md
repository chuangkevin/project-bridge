---
name: houseprice-object-sync
description: HousePrice 物件相關排程 Job 的 domain knowledge。當需要理解物件歸戶結轉流程、各排程 Job 的觸發時機與關係、物件到期處理、點擊數管理、AI 圖片處理流程時使用此 skill。適用於 Hangfire Job 開發、排程除錯、或需要理解物件資料從 MSSQL 到 ES 顯示層的完整同步鏈。
---

# HousePrice 物件同步排程 (Object Sync Jobs)

> **來源專案**：`Tasks.Buy.BusinessCase`、`Task.Business`

## Job 總覽

| 分類 | Job | 排程 | 說明 |
|------|-----|------|------|
| 買屋庫存 | AdaptedWebCaseJob | 每日 00:10 + 04:00 | 物件到期下架、異常修復 |
| 顯示層 B 端物件 | BuyBusinessCaseViewDataJob | 每月 1 號 01:00 | 物件歸戶結轉到 ES 顯示層 |
| 補缺少歸戶資料 | FillCaseMissingGroupInfoJob | 每 10 分鐘 | 補上缺少歸戶資訊的物件 |
| 庫存定期刷新 | InventoryRegularJob | 每日 00:01 | 定時更新庫存的更新時間 |
| 點擊數 | ClickCount | 每 5 分鐘 / 每日 | 灌水點擊數、區域統計、歷史整理 |
| 買屋廣告 | BuyCaseAdvertisementJob | 每日 00:00 | 廣告到期處理 |
| AI 美裝 | AIPictureJob | 每小時 | AI 圖片處理、孤立圖片清理 |
| Buy Chunk 同步 | BuyChunkJob | 手動觸發 | AI 語意搜尋 chunk 同步 |
| 行情結轉 | MarketStatsJob | 手動觸發 | 行情資料 MSSQL → ES |
| Feed 浮水印 | FeedWatermarkJob | 手動觸發 | FB Feed 用的浮水印圖片製作 |

### Task.Business 的 Job

| 分類 | Job | 排程 | 說明 |
|------|-----|------|------|
| 物件歸戶 | CaseClassificationGroupJob | — | 物件歸戶分組，呼叫 Tasks.Buy.BusinessCase 做結轉 |
| 認領物件 | AdaptedWebCaseJob | — | 發布到 ES、下架、狀態更新 |
| 雲端同步 | HousePriceCaseJob | — | 本地 AdaptedWebCase 同步到雲端 MySQL |
| 購物 Feed | FacebookFeedCaseJob | 每日 03:00/15:00 | FB 購物 CSV（含/不含浮水印） |
| 購物 Feed | GoogleFeedCaseJob | 每日 10:00 | Google 購物 CSV |
| 購物 Feed | LineFeedCaseJob | 每日 10:00 | Line 購物 CSV |
| 到期通知 | ActionRecordJob | 每日 03:00 | 物件到期日通知所有會員 |
| 經紀人辨識 | AgentJob | 每日 01:00 | 疑似經紀人帳號辨識 |
| 法拍屋 | ForeclosureOffShelfJob | — | 法拍屋自動下架（確認有在使用） |
| 付費物件 | AdaptedWebCasePaymentJob | — | 付費物件存入追蹤表 |
| 促銷活動 | AdaptedWebCaseActivityJob | 每日 00:30 | 刊一反一限時活動（退還額度） |
| ES 索引 | EsWebCaseGroupJobs | — | 007 物件 ES index (business_webcase_v2) 管理 |
| 下架管理 | WebCaseGroupJob | — | 下架物件寫入 WebCaseGroupingOffShelf |
| 會員行為 | UserBehaviorCollectionJob | — | 收集會員刊登行為數據 |
| 會員 MGM | MemberMgmJob | — | MGM 點數發放 |

### 兩個 Task 專案的分工

| 專案 | 職責 |
|------|------|
| **Tasks.Buy.BusinessCase** | C端顯示層結轉、物件到期下架、點擊數、AI 圖片、行情結轉 |
| **Task.Business** | 物件歸戶、Feed 產生、到期通知、ES 索引、經紀人辨識、法拍屋、促銷活動 |

### 兩個 AdaptedWebCaseJob 的關係

兩個專案各有一個 `AdaptedWebCaseJob`，**不衝突，互補**：

| | Tasks.Buy.BusinessCase | Task.Business |
|---|---|---|
| 驅動方式 | **排程驅動**（00:10、04:00） | **事件驅動**（API 觸發） |
| 職責 | 到期下架、異常修復、廣告移除 | 發布到 ES、委託到期狀態更新、下架寫入 ES |
| 操作 | 關閉狀態 + 清理廣告/點擊數 | ES index 更新 + 狀態轉換 |

操作不同欄位/不同關注點，不會同時競爭同一筆資料。

### ES Index 對照

| Index | 寫入者 | 讀取者 | 用途 |
|-------|--------|--------|------|
| `buy_business_case` | Tasks.Buy.BusinessCase（結轉 Job） | WS.Buy, WS.Price, WS.Community, WS.Business | B 端刊登物件的 C 端顯示層 |
| `business_webcase_v2` | Task.Business（EsWebCaseGroupJobs） | WebService.Business（007 搜尋） | B 端物件歸戶搜尋 |

兩者 document model 不同，消費者不同。

### 確認欄位是否存在

C 端搜尋/篩選/排序都基於 `buy_business_case` ES index。欄位不在這裡 = C 端搜不到。

確認方式：
- **ES 欄位**：用 `elasticsearch` skill 查 `buy_business_case` 的 mapping
- **SQL 欄位**：用 `mssql-mcp` 查 `AdaptedWebCase` 等 table 的 schema
- 不要靠記憶判斷欄位存不存在，**直接查**

> 結轉時從哪些 table 組裝到 ES → [consolidation.md](consolidation.md)

## 詳細說明

- [物件歸戶結轉](consolidation.md) — BuyBusinessCaseViewDataJob，將庫存組裝為 C 端顯示層
- [物件到期處理](expiration.md) — AdaptedWebCaseJob，到期下架與異常修復
- [點擊數管理](click-count.md) — 灌水、區域統計、歷史整理
- [AI 圖片處理](ai-picture.md) — 圖片美裝處理鏈與清理
- [廣告到期處理](advertisement.md) — 各廣告類型到期後的資源清理

## Job 共通模式

- **子 Job 隔離**：大量處理時拆成每筆一個子 Job，單筆失敗不影響整批
- **批次大小**：依操作複雜度不同，常見 500 / 1000 / 2000
- **Queue 策略**：`InventoryRegularJob` 使用自訂 queue "z"（低優先度）
- **鏈式觸發**：`BackgroundJob.ContinueJobWith()` 串接依序執行的 Job

## Notes

- 地址鎖定 Job（`AdaptedWebCaseAddressChangedJob`）已於 2025/05/22 停用，原本是刊登超過 30 天鎖定地址，因 591 策略改為 90 天刊登期
- `BuyChunkJob` 是給 AI 語意搜尋用的，同步 chunk 到 AI service endpoint
- 生活圈（LivingCircle）是結轉時動態查 ES 取得的，不是預先快取
