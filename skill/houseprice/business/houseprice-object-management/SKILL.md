---
name: houseprice-object-management
description: HousePrice 2B 物件管理（AdaptedWebCase）的 domain knowledge。當需要理解物件資料流（AdaptedWebCase → WebSellCase → WebCaseGrouping → ES）、物件狀態流轉、刊登流程、或開發物件相關功能時使用此 skill。程式碼中提到的「物件」都是指 AdaptedWebCase。
---

# HousePrice 2B 物件管理 (Object Management)

> **來源專案**：`WebService.Business`、`WebService.BusinessCase`、`Task.Business`、`Web.Business`、`Tasks.Buy.BusinessCase`

## 術語

| 術語 | 說明 |
|------|------|
| 物件 | 不動產。程式碼中提到的「物件」都是指 **AdaptedWebCase** |
| 庫存 | 已上傳到平台的物件（不論是否公開） |
| Adapted | 歷史命名。網站初期沒有自己的不動產物件，從外部（591/樂居等）爬進來「收編」，故命名 AdaptedWebCase。**現在已沒有收編動作**，經紀人直接建立物件 |

---

## 經紀人刊登流程

```
經紀人登入 007 平台
  → 進入庫存畫面
  → 購買使用額度
  → 扣除額度
  → 填寫物件資訊（可從外部 URL 轉入資料）
  → 寫入 AdaptedWebCase
  → 觸發 DBA 的 SP
  → 轉入 WebSellCase
  → 彙總到 WebCaseGrouping
  → 結轉到 ES
  → Buy 平台（C端）可見
```

### 商業模式

- 刊登物件是**付費**的，額度 = 代幣概念，一個額度 = 一個物件的一段刊登期
- 額度購買/管理透過 `WS.Order` 處理
- 刊登期限（AdDueDate）是唯一的到期機制，**為了持續消耗使用者的費用**
- `EntrustDueDate`（委託到期）是歷史遺留，目前無自動觸發機制
- 廣告加值服務（AI美裝、優質推薦等）的定價邏輯需由 PM 提供

---

## 資料流

```
AdaptedWebCase（經紀人建立的物件）
  → DBA 的 SP
    → WebSellCase（DBA 管理，包含我們的資料+其他網站的，同物件多筆，以 GroupId 為依據）
      → WebCaseGrouping（彙總成一筆）
        → ES（C端搜尋用）
```

| 層級 | 管理者 | 說明 |
|------|--------|------|
| **AdaptedWebCase** | 我們 | 經紀人建立的物件，程式碼中「物件」都指這個 |
| **WebSellCase** | DBA（SP15 產出） | 包含我們的資料+外部網站的資料，同一物件會有多筆，以 GroupId 區分 |
| **WebCaseGrouping** | 我們 | 將 WebSellCase 彙總成一筆 |
| **WebCase** | DBA | DBA 爬外部網站（591/樂居等）的原始資料，**我們不需要管** |

> **注意**：DBA 管理的 SP/Table（SP15、SP17、WebSellCase、WebCase）不需要知道內部邏輯，它們會參照物件資料做轉資料。我們管理 AdaptedWebCase 和 WebCaseGrouping。

---

## 欄位變更影響範圍

新增或修改 AdaptedWebCase 欄位時，影響範圍取決於**欄位要出現在哪裡**：

| 欄位用途 | 需要改的地方 | 不需要改的地方 |
|---------|------------|--------------|
| **只在 B 端庫存頁面顯示** | AdaptedWebCase table + WebService.BusinessCase | 不需要改 SP、ES、結轉 Job |
| **要在 C 端搜尋結果顯示** | 加上 Tasks.Buy.BusinessCase 結轉邏輯 + ES `buy_business_case` mapping | 不需要改 SP（除非歸戶需要） |
| **要在 C 端做篩選/排序** | 同上 + ES mapping 設計（keyword/text/數值型別） | |
| **要參與歸戶判斷** | 加上跟 DBA 協調 SP15 | 這是最複雜的情況 |

### 兩個 ES Index 是獨立的

| Index | 寫入者 | 消費者 | 改一個不代表要改另一個 |
|-------|--------|--------|----------------------|
| `buy_business_case` | Tasks.Buy.BusinessCase | WS.Buy（C 端搜尋） | 欄位要出現在 C 端才需要改 |
| `business_webcase_v2` | Task.Business | WS.Business（007 搜尋） | 欄位要出現在 007 搜尋才需要改 |

### 常見「不需要做」的情況

- 欄位只在 B 端庫存頁面用 → **不需要**改 ES mapping、不需要改結轉 Job、不需要跟 DBA 協調
- 欄位不參與歸戶 → **不需要**改 SP15
- 欄位只在 `buy_business_case` 用 → **不需要**改 `business_webcase_v2`，反之亦然
- 欄位不影響排序 → **不需要**改 SortPriority 計算

---

## 物件狀態 (InventoryStateEnum)

草稿是狀態，表示資料不完整。

### 公開/非公開

| 值 | 名稱 | 說明 |
|----|------|------|
| 1 | Public | 公開 — C端可見 |
| 2 | NonPubliciseBySelf | 自行非公開 — 經紀人手動隱藏 |
| 5 | NonPublicise | 非公開 |
| 6 | NonPubliciseByAdmin | 管理員設為非公開 |

### 關閉

| 值 | 名稱 | 說明 |
|----|------|------|
| 3 | CloseByAdDueDate | 刊登到期關閉 — 廣告期限到了 |
| 4 | CloseBySelf | 自行關閉 |
| 10 | CloseByChangeStore | 變更仲介店關閉 |
| 11 | CloseByEntrustDueDate | 委託到期關閉 — ⚠️ 歷史遺留，目前無自動觸發 |
| 12 | CloseByStoreNotApproved | 仲介店未通過審核關閉 |
| 13 | CloseByMemberRemoved | 會員刪除關閉 |
| 15 | CloseByForceOffShelf | 客服強制下架 |

### 草稿/追蹤

| 值 | 名稱 | 說明 |
|----|------|------|
| 7 | InventoryDraft | 庫存草稿 — 資料不完整 |
| 8 | TrackDraft | 追蹤草稿 |
| 9 | Track | 追蹤 — B端可看到競品列表，經紀人標記追蹤感興趣的競品物件 |
| 14 | ImportInventory | 匯入庫存 |

### 狀態分組 (AdaptedWebCaseStatusGroupEnum)

UI/篩選用的邏輯分組：

| 值 | 名稱 | 包含的狀態 |
|----|------|-----------|
| 0 | Inventory | 庫存 |
| 1 | Public | 公開中 |
| 2 | NonPublicise | 非公開 |
| 3 | Close | 所有關閉狀態 |
| 4 | Track | 追蹤中 |

### 上下架影響

- **上架**：C端（Buy 平台）搜尋可見
- **下架**：C端**完全消失**，不是標記已下架

### C 端搜尋機制

C 端搜尋**走 Elasticsearch**，不是直接查 SQL。物件資料經結轉寫入 ES `buy_business_case` index 後，C 端才能搜尋到。

因此：
- 要讓 C 端可以**篩選/排序**某個欄位 → 該欄位必須存在於 ES index 中
- 只存在 SQL 但不在 ES 中的欄位 → C 端搜不到

---

## 專案職責分工

| 專案 | 角色 | 說明 |
|------|------|------|
| **WebService.BusinessCase** | 庫存管理/刊登 API | CRUD、發布、下架、廣告管理。**事件驅動**：每個操作都發 RabbitMQ event |
| **Web.Business** | 007 前端 API | 經紀人操作的入口，呼叫多個 WS |
| **WebService.Business** | 007 B端查詢 API | ES 查詢、物件搜尋、客戶配對 |
| **Task.Business** | 007 背景排程 | 物件歸戶、Feed 產生（FB/Google/Line）、到期通知、ES 索引 |
| **Tasks.Buy.BusinessCase** | 物件同步排程 | 顯示層結轉、到期下架、點擊數、AI 圖片 |

### 租屋獨立

租屋有獨立的管理系統，`WebService.BusinessCase` 雖然有租屋 controller，但租屋的庫存管理是獨立的。

---

## Domain Events

物件狀態變更時透過 RabbitMQ 發布事件（`Evertrust.EventBus`）。

### 來自 WebService.Business

| Event | 觸發時機 | 攜帶資料 |
|-------|---------|---------|
| `AdaptedWebCaseOnShelfEvent` | 物件上架（C端可見） | `CaseSid` |
| `AdaptedWebCaseOffShelfEvent` | 物件下架（C端消失） | `CaseSid` |
| `AdaptedWebCaseModifiedEvent` | 物件編輯 | `CaseSid` |

### 來自 WebService.BusinessCase

| Event | 觸發時機 |
|-------|---------|
| `InventoryCaseCreatedEvent` | 新建庫存 |
| `InventoryCaseChangedEvent` | 庫存修改 |
| `InventoryCaseOpenedEvent` | 庫存上架 |
| `InventoryCaseClosedEvent` | 庫存關閉 |
| `InventoryCaseDeletedEvent` | 庫存刪除 |
| `InventoryCaseNonPubliciseEvent` | 庫存設為非公開 |
| `MemberRemovedEvent` | 會員刪除 → **自動關閉該會員所有庫存** |

---

## 廣告加值服務

物件可以綁定付費廣告服務，廣告到期時排程 Job 自動清理：

- **AI美裝** — AI 照片美化
- **AI影音** — AI 生成影片
- **定時更新** — 自動刷新物件排序
- **優質推薦** — 推薦位廣告
- **關注焦點** — 焦點位廣告

> **相關 skill**：
> - 購買/額度扣除流程 → `houseprice-order-quota`
> - 到期處理排程 → `houseprice-object-sync/advertisement.md`

---

## C端互動

使用者在 Buy 平台看到物件後做留言，系統會通知經紀人。

---

## 會員與物件

- 一個會員可以管理的物件數量**沒有上限**
- C端會員目前沒有功能
- 2B/2C 會員都是在 007 或 Buy 平台直接註冊，沒有特別的審核流程

---

## Notes

- `SID`（流水號）用於排程 Job 追蹤與事件攜帶；`ID`（GUID）用於 API 操作
- `LatestChangeStateTime` 記錄最近一次狀態變更時間
- 現在只有刊登期限（AdDueDate），驅動付費循環
- 租屋有獨立的管理系統
