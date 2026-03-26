# 物件歸戶結轉

> **來源專案**：`Task.Business`、`WebService.BusinessCase`、`Tasks.Buy.BusinessCase`

## 歸戶觸發（事件驅動，非排程）

經紀人操作物件時觸發歸戶，**不是排程 Job**：

| 觸發點 | 來自 | 說明 |
|--------|------|------|
| 物件上架 (Open) | `WebService.BusinessCase` → `InventoryOpenService` | 庫存設為公開時 |
| 物件修改 (Change) | `WebService.BusinessCase` → `BuyInventoryChangeService` | 價格、地址等變更時 |
| 物件刊登 (Publish) | `WebService.BusinessCase` → `InventoryPublishedService` | 付費刊登完成時 |

## 完整流程

```
經紀人操作（上架/修改/刊登）
  ↓
WebService.BusinessCase 的 Service
  ↓
HTTP POST → Task.Business /api/v1/ClassifyCase/ClassifyPublishCaseGroup/{caseSid}
  ↓
Hangfire 排入背景 Job
  ↓
CaseClassificationGroupJob.ClassifyPublishCaseGroupAsync(caseSid)
  │
  ├─ Step 1: 執行 SP15（歸戶）
  │   └─ EXEC BI_DB.EXTDWFM.dbo.sp_WebCase15_HPCase
  │   └─ AdaptedWebCase → SP15 → WebSellCase → WebCaseGrouping
  │   └─ 從結果取回 GroupID
  │
  └─ Step 2: 結轉到 C 端顯示層
      └─ HTTP POST → Tasks.Buy.BusinessCase /api/v1/BuyBusinessCase/UpsertViewData
      └─ 組裝完整資料寫入 ES
```

## SP15 — 歸戶的核心

```sql
EXEC BI_DB.EXTDWFM.dbo.sp_WebCase15_HPCase @CaseNo = @SID, @CaseFrom='HousePrice';
SELECT GroupID FROM dbo.WebCase WITH(NOLOCK)
WHERE CaseFrom = 'HousePrice' AND CaseNo = @SID;
```

- 由 BI_DB（外部資料庫）執行，DBA 管理，我們不需要知道內部邏輯
- SP15 會參照物件資料做轉資料：AdaptedWebCase → WebSellCase → WebCaseGrouping
- Timeout: 180 秒

## 錯誤處理

- SP15 失敗（GroupID 為 null）→ **拋 exception**，Job 失敗
- C 端結轉 API 失敗 → **只 log 不 throw**，歸戶本身不受影響

---

## 所有寫入 buy_business_case ES index 的觸發點

### 全量結轉（Bulk Upsert）

| 觸發方式 | 來源 | 說明 |
|---------|------|------|
| 歸戶後 UpsertViewData | `Task.Business` → `Tasks.Buy.BusinessCase` API | 歸戶完成後結轉單筆 |
| 全台結轉 | `Tasks.Buy.BusinessCase` BuyBusinessCaseViewDataJob | 依縣市逐一串接，手動觸發 |
| 月度定期 | `Tasks.Buy.BusinessCase` UpsertAllRegularAsync | 每月 1 號，更新屋齡 |
| 補缺歸戶 | `Tasks.Buy.BusinessCase` FillCaseMissingGroupInfoJob | 每 10 分鐘 |

### Event-Driven 寫入（RabbitMQ → Tasks.Buy.BusinessCase）

#### 庫存操作

| Event | Handler | 動作 |
|-------|---------|------|
| `InventoryCaseChangedEvent` | UpdateBuyBusinessCaseViewData | 全量更新 |
| `InventoryCaseNonPubliciseEvent` | UpsertBuyBusinessCaseViewData | 全量更新 |
| `InventoryCaseDeletedEvent` | DeleteBuyBusinessCaseViewData | 從 ES 刪除 |
| `InventoryCaseClosedEvent` | DeleteBuyBusinessCaseViewData | 從 ES 刪除 |
| `InventoriedForcedOffShelvedEvent` | DeleteBuyBusinessCaseViewData | 從 ES 刪除 |
| `ContinuePublishCaseEvent` | UpdateBuyBusinessUpdateTimeViewData | 更新刊登時間 |
| `InventoryRegularUpdateCreatedEvent` | UpdateBuyBusinessRefreshTimeViewData | 更新刷新時間 |

#### 會員/經紀人變更

| Event | Handler | 動作 |
|-------|---------|------|
| `AgentModifiedEvent` | UpdateBuyBusinessCaseOwnerInfoViewData | 更新物主資訊 |
| `MemberChangedPhoneEvent` | UpdateBuyBusinessCaseOwnerPhoneViewData | 更新物主電話 |

#### 歸戶變更

| Event | Handler | 動作 |
|-------|---------|------|
| `WebCaseGroupingUpdatedEvent` | UpdateBuyBusinessCaseGroupInfoViewData | 更新歸戶資訊 |

#### 廣告變更

| Event | Handler | 動作 |
|-------|---------|------|
| `HighQualityAdvertisementCreatedEvent` | AddHighQualityAdTypeViewData | 加上優質推薦 |
| `HighQualityAdvertisementDeletedEvent` | DeleteHighQualityAdTypeViewData | 移除優質推薦 |
| `FocusAdvertisementCreatedEvent` | AddFocusAdTypeViewData | 加上關注焦點 |
| `FocusAdvertisementDeletedEvent` | DeleteFocusAdTypeViewData | 移除關注焦點 |

#### 社區變更

| Event | Handler | 動作 |
|-------|---------|------|
| `CommunityOnShelfEvent` | UpdateBuyBusinessCaseCommunityOnShelfViewData | 社區上架 |
| `CommunityOffShelfEvent` | UpdateBuyBusinessCaseCommunityOffShelfViewData | 社區下架 |
| `CommunityPriceIncreasedEvent` | UpdateBuyBusinessCaseCommunityPriceViewDataToIncreased | 社區漲價 |
| `CommunityPriceDecreasedEvent` | UpdateBuyBusinessCaseCommunityPriceViewDataToDecreased | 社區跌價 |
| `CommunityPriceUnChangedEvent` | UpdateBuyBusinessCaseCommunityPriceViewDataToNoChanged | 社區持平 |

> **共 19 個 event handler** + 4 個 bulk 觸發方式寫入此 ES index。

---

## 讀取 buy_business_case ES index 的服務

| 專案 | 用途 |
|------|------|
| **WebService.Buy**（C端） | C 端物件列表查詢、搜尋（BuyBusinessCaseListController） |
| **WebService.Price** | 行情統計中引用 B 端物件（MarketStatsController） |
| **WebService.Community** | 社區專家相關 |
| **WebService.Business** | 007 ES 查詢（ESCaseRepository） |
| ❌ WebService.BuyCase | 待確認（未 clone） |
| ❌ Web.Buy | 待確認（未 clone） |

---

## 結轉涉及的 Table

### 讀取的 Table（全量結轉組裝 ES 文件時）

| Table | 用途 | 關鍵欄位 |
|-------|------|---------|
| **AdaptedWebCase** | 物件基本資料 | SID, CaseName, City, District, TotalPrice, UnitPrice, State, GroupID, Lat, Lng |
| **AdaptedWebCaseDescription** | 物件描述 | Description |
| **AdaptedWebCaseVideoInfo** | 影片資訊 | VRUrl, YouTubeUrl, VideoOrientation |
| **AdaptedWebCaseUserInputAreaInfo** | 面寬/深度 | Frontage, Depth, RoadWidth |
| **AdaptedWebCasePriceChangeHistory** | 價格變更紀錄 | TotalPrice, CreateTime（取最新一筆） |
| **AdaptedWebCasePicture** | 物件照片 | PictureUrl, Type, Sort |
| **AdaptedWebCaseAdvertisements** | 廣告資訊 | AdType, CreateDate |
| **AdaptedWebCaseNotShowSetting** | 顯示控制 | Item（DownPrice, PriceAnalyze） |
| **AdaptedWebCaseCommunityInfo** | 社區關聯 | IsCommunity, CommunityGroupId |
| **DefaultAdaptedWebCaseContactInfo** | 預設聯絡資訊 | ContactName, ContactPhone |
| **Member** | 會員 | Name, Phone |
| **BusinessMember** | 經紀人資訊 | Brand, ContactCompany, ContactStore |
| **MemberPhoto** | 會員照片 | PhotoUrl |
| **WebCaseGrouping** | 歸戶資訊 | GroupID, KWsLabel, OtherKw, BasicSID, CommunityId |
| **Community** | 社區 | Name, ID, GroupId, Lat, Lng |
| **CommunityAvgPriceRecord** | 社區均價 | Percent, GroupId |
| **CommunityTag** | 社區標籤 | （透過 Service 取得） |
| **CaseTradeInfo** | 區域成交行情 | District, PriceType, PinPrice |
| **Brand** | 品牌字典 | Brand code mapping |

### 讀取的 ES Index

| Index | 用途 |
|-------|------|
| **LivingCircle** | 生活圈（由座標查詢） |
| **AI美裝 pictures** | AI 處理後的圖片 |
| **AI影音 videos** | AI 生成的影片 |

### 寫入

| 目標 | 說明 |
|------|------|
| **ES: buy_business_case** | 最終 C 端搜尋用的顯示層資料 |
| **AdaptedWebCase.LivingCircleSid** | 回寫生活圈 SID |
| **AdaptedWebCase.JobId** | Job 追蹤（完成後清除） |

---

## 最終 ES 文件結構（buy_business_case index）

| 區塊 | 來源 | 主要欄位 |
|------|------|---------|
| 基本資訊 | AdaptedWebCase | CaseSid, CaseName, City, District, BuildAge, State |
| 面積 | AdaptedWebCase | BuildPin, MainPin, PublicPin, LandPin, PublicRatio |
| 格局 | AdaptedWebCase | Rm, LivingRm, BathRm, FromFloor, TotalFloor |
| 價格 | AdaptedWebCase + PriceChangeHistory | TotalPrice, UnitPrice, LastTimeTotalPrice, DownRatio |
| 照片 | AdaptedWebCasePicture + AI | PhotoList, CoverPhoto, PatternPhoto |
| 物主 | Member + BusinessMember + MemberPhoto | Name, Phone, Brand, ContactStore, ProfilePicture |
| 歸戶 | WebCaseGrouping | GroupId, FeatureTag（from KWsLabel + OtherKw） |
| 社區 | Community + CommunityAvgPriceRecord | CommunityName, CommunityGroupId, PriceChange, Percent |
| 座標 | AdaptedWebCase（或 Community 座標優先） | Latitude, Longitude |
| 廣告 | AdaptedWebCaseAdvertisements | AdType |
| 顯示控制 | AdaptedWebCaseNotShowSetting | ShowDownPrice, ShowPriceAnalyze |

---

## 踩雷筆記

來自 HP-Bible：
- GroupId 查找失敗可能原因：`WebCaseGroup` 資料缺失、`ShortAddress` 為 NULL
- SP15 成功但找不到匹配的 group 也會失敗
