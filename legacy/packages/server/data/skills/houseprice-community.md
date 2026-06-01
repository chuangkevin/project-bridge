---
name: houseprice-community
description: Knowledge and query patterns for HousePrice 社區（Community）與買屋歸戶整體關聯架構. Always use this skill when asked about Community, NewBuild, BuBuilding, CmpWebCaseNewBuild, NewBuildGroup, WebCase, WebCaseGrouping, 社區主檔, 成屋, 新建案, 買屋歸戶, GroupId, BudFrom, CommunityType, MappingId, DealAllCaseList, TagBuildingHeadID, NewBuildDealCaseList, 實價登錄社區關聯, or any cross-table join involving the community data model. Invoke whenever the user mentions 社區資料, 買屋歸戶, 新建案社區, 成屋社區, 社區群組, 實價登錄如何關聯社區, DealAllCaseList 與 Community 關係, or wants to understand how HousePrice community tables relate to each other.
---

# HousePrice 社區 / 買屋歸戶 整體關聯

## 架構概覽

```
Community (核心主檔)
  ├── MappingId → HouseFun.BuBuilding   (成屋，CommunityType = null)
  ├── BuildId   → HousePrice.NewBuild   (新建案，CommunityType = 1)
  └── GroupId   → NewBuildGroup
                     └── BudFrom + BuildId → CmpWebCaseNewBuild
                                                └── GroupId → WebCase → WebCaseGrouping
```

**Community 是所有「社區」的唯一入口表。** 所有查詢都以 Community 為起點。

---

## 核心資料表

### HousePrice.Community（社區主檔）

| 欄位          | 說明                                                               |
| ------------- | ------------------------------------------------------------------ |
| MappingID     | 對應 `HouseFun.BuBuilding.BuildingID`（成屋）                      |
| MappingNo     | 對應 `HouseFun.BuBuilding.BudNo`                                   |
| BuildID       | 對應 `HousePrice.NewBuild.BuildId`（新建案）                       |
| BudFrom       | 社區資料來源                                                       |
| CommunityType | `NULL` = 成屋，`1` = 新建案                                        |
| GroupId       | 社區群組 Key，跨 `NewBuild` 與 `NewBuildGroup` 使用                |
| Enable        | 是否啟用                                                           |
| IsDirect      | 是否直營                                                           |

### HousePrice.NewBuildGroup（社區群組表）

| 欄位       | 說明                                           |
| ---------- | ---------------------------------------------- |
| SID        | PK                                             |
| GroupID    | 對應 `Community.GroupId`                       |
| BudFrom    | 來源系統                                       |
| BuildID    | 來源內建案 ID                                  |
| CreateDate | 建立時間                                       |

JOIN key：`NewBuildGroup.GroupId = Community.GroupId`

### HousePrice.CmpWebCaseNewBuild（買屋歸戶 GroupId 對應表）

| 欄位           | 說明                              |
| -------------- | --------------------------------- |
| GroupID        | 買屋歸戶 GroupId                  |
| BudFrom        | 來源系統                          |
| BuildID        | 來源內建案 ID                     |
| CommunityID    | 社區 Id（由黑豹排程補上）         |
| UpdateDatetime | 更新時間                          |

JOIN key（與 NewBuildGroup）：`BudFrom + BuildID`

JOIN key（與 WebCase）：`CmpWebCaseNewBuild.GroupId = WebCase.GroupId`

### HousePrice.DealAllCaseList（實價登錄）

實價登錄與社區關聯的核心欄位：

| 欄位                   | 說明                                         |
| ---------------------- | -------------------------------------------- |
| BuildingID             | 成屋大樓編號（對應 HouseFun.BuBuilding）     |
| CaseNo                 | 案件代碼                                     |
| DealKind               | 資料種類（OG/YC1/YC2）                       |
| TagBuildingHeadID      | 對應 `Community.ID`（社區主檔 Id）           |
| TagBuildingHeadGroupId | 對應 `Community.GroupId`（社區群組 Id）      |
| TagBuildingHeadName    | 社區名稱                                     |
| TagUpdateDatetime      | 標籤更新時間（NULL 表示待更新）              |

### HousePrice.NewBuildDealCaseList（新建案實登橋接表）

新建案實價登錄與社區的橋接表，用來關聯 DealAllCaseList 與 Community：

| 欄位            | 說明                                     |
| --------------- | ---------------------------------------- |
| SID             | 流水號_PK                                |
| DealKind        | 資料種類（YC1/YC2/OG）                   |
| CaseNo          | 案件代碼                                 |
| NewBuildGroupID | 新建案 GroupId（對應 Community.GroupId） |

**JOIN Key**：`DealAllCaseList.CaseNo = NewBuildDealCaseList.CaseNo AND DealAllCaseList.DealKind = NewBuildDealCaseList.DealKind`

### HouseFun.BuBuilding（成屋來源）

僅在 `CommunityType IS NULL` 時使用。

| 欄位       | 對應 Community 欄位   |
| ---------- | --------------------- |
| BuildingID | `Community.MappingId` |
| BudNo      | `Community.MappingNo` |

### WebCase / WebCaseGrouping（買屋歸戶物件）

- `WebCase`：DBA 提供的買屋歸戶物件（**不儲存** 社區 GroupId）
- `WebCaseGrouping`：黑豹整理後的買屋物件資料

---

## 關鍵對應規則

| 規則 | 說明 |
|------|------|
| `CommunityType IS NULL` | 成屋 → 來源為 `HouseFun.BuBuilding` |
| `CommunityType = 1` | 新建案 → 來源為 `HousePrice.NewBuild` |
| `GroupId` | 社區層級整併 Key，跨 `NewBuild` 與 `NewBuildGroup` |
| `BudFrom + BuildID` | 來源層級唯一鍵，用於 `NewBuildGroup ↔ CmpWebCaseNewBuild` |

---

## Common Query Patterns

### 查某社區的基本資訊（判斷成屋 / 新建案）

```sql
SELECT C.GroupId, C.CommunityType, C.BuildID, C.MappingID, C.Enable, C.IsDirect
FROM HousePrice.Community C WITH(NOLOCK)
WHERE C.GroupId = <group_id>
```

> `CommunityType IS NULL` → 成屋；`CommunityType = 1` → 新建案。

### 從社區找對應的新建案群組

```sql
SELECT NBG.SID, NBG.GroupID, NBG.BudFrom, NBG.BuildID, NBG.CreateDate
FROM HousePrice.Community C WITH(NOLOCK)
JOIN HousePrice.NewBuildGroup NBG WITH(NOLOCK) ON NBG.GroupID = C.GroupId
WHERE C.GroupId = <group_id>
```

### 從社區找買屋歸戶物件

```sql
SELECT CWN.GroupID AS WebCaseGroupId, CWN.BudFrom, CWN.BuildID, CWN.CommunityID
FROM HousePrice.Community C WITH(NOLOCK)
JOIN HousePrice.NewBuildGroup NBG WITH(NOLOCK) ON NBG.GroupID = C.GroupId
JOIN HousePrice.CmpWebCaseNewBuild CWN WITH(NOLOCK)
    ON CWN.BudFrom = NBG.BudFrom AND CWN.BuildID = NBG.BuildID
WHERE C.GroupId = <group_id>
```

### 從社區一路查到 WebCase

```sql
SELECT WC.*
FROM HousePrice.Community C WITH(NOLOCK)
JOIN HousePrice.NewBuildGroup NBG WITH(NOLOCK) ON NBG.GroupID = C.GroupId
JOIN HousePrice.CmpWebCaseNewBuild CWN WITH(NOLOCK)
    ON CWN.BudFrom = NBG.BudFrom AND CWN.BuildID = NBG.BuildID
JOIN WebCase WC WITH(NOLOCK) ON WC.GroupId = CWN.GroupID
WHERE C.GroupId = <group_id>
```

### 查成屋社區對應的 BuBuilding

```sql
SELECT BB.*
FROM HousePrice.Community C WITH(NOLOCK)
JOIN HouseFun.BuBuilding BB WITH(NOLOCK) ON BB.BuildingID = C.MappingID
WHERE C.CommunityType IS NULL
  AND C.GroupId = <group_id>
```

---

## Notes

- 所有查詢加 `WITH(NOLOCK)`，這是 read-only 查詢的專案慣例。
- `WebCase` 與 `WebCaseGrouping` **沒有儲存** 社區 GroupId，必須透過 `CmpWebCaseNewBuild` 橋接。
- `CommunityID` 欄位在 `CmpWebCaseNewBuild` 是由黑豹排程事後補上，查詢時可能為 NULL（代表尚未回填）。
- `GroupId` 是社區層級的整併 Key；`BudFrom + BuildID` 才是來源層級的唯一鍵，兩者意義不同，不要混用。

---

## DealAllCaseList 與 Community 關聯方式

### 雙軌制關聯邏輯

DealAllCaseList（實價登錄）與 Community 有兩種關聯路徑：

```
DealAllCaseList（實價登錄）
├── 成屋路徑：BuildingID → Community.MappingID → Community.ID → Community.GroupId
└── 新建案路徑：(CaseNo + DealKind) → NewBuildDealCaseList.NewBuildGroupID → Community.GroupId
```

| 社區類型   | DealAllCaseList 欄位 | 中間橋接表               | Community 關聯欄位 |
| ---------- | -------------------- | ------------------------ | ------------------ |
| **成屋**   | `BuildingID`         | 無（直接對應）           | `MappingID`        |
| **新建案** | `CaseNo + DealKind`  | `NewBuildDealCaseList`   | `GroupId`          |

### 成屋關聯詳細路徑

```
DealAllCaseList.BuildingID
    ↓
Community.MappingID（成屋對應欄位）
    ↓
Community.ID（社區主檔Id）
    ↓
Community.GroupId（社區群組Id）
```

**關鍵對應**：`DealAllCaseList.BuildingID = Community.MappingID = HouseFun.BuBuilding.BuildingID`

### 新建案關聯詳細路徑

```
DealAllCaseList.CaseNo + DealAllCaseList.DealKind
    ↓
NewBuildDealCaseList.NewBuildGroupID
    ↓
Community.GroupId
```

**關鍵對應**：`(CaseNo, DealKind)` 是 NewBuildDealCaseList 的複合 KEY，對應到 `NewBuildGroupID` 後可直接取得 Community GroupId

### 關聯寫入欄位

當建立關聯後，寫入 DealAllCaseList 的標籤欄位：

```sql
UPDATE DealALLCaseList
SET TagBuildingHeadID = @CommunityId          -- Community.ID
   ,TagBuildingHeadGroupId = @CommunityGroupId -- Community.GroupId
   ,TagBuildingHeadName = @CommunityName       -- Community.Name
   ,TagUpdateDatetime = @UpdateTime            -- 更新時間標記
WHERE SID = @Sid
```

### GetPriceWithBuildOrNewBuild 統一查詢

`PriceCommunityRepository.GetPriceWithBuildOrNewBuild()` 方法統一處理成屋與新建案的 GroupId 取得邏輯：

```sql
SELECT
    d.sid as Sid,
    d.TagBuildingHeadID as CommunityId,
    d.BuildingID,
    ISNULL(n.NewBuildGroupID,c.GroupId) as GroupId
FROM DealALLCaseList d WITH (NOLOCK)
    LEFT JOIN Community c WITH (NOLOCK) on d.TagBuildingHeadID=c.ID 
    LEFT JOIN NewBuildDealCaseList n WITH (NOLOCK) on n.CaseNo=d.CaseNo and n.DealKind=d.DealKind
WHERE ...
AND (ISNULL(BuildingID,0) <> 0 OR n.NewBuildGroupID is not null)
```

**關鍵邏輯**：使用 `ISNULL(n.NewBuildGroupID,c.GroupId)` 統一取得 GroupId
- 成屋：`NewBuildGroupID` 為 NULL，取 `c.GroupId`（透過 TagBuildingHeadID Join Community）
- 新建案：`NewBuildGroupID` 有值，直接取 `n.NewBuildGroupID`

### 標籤結轉流程

`DealAllCaseListJob` 執行標籤結轉時的查找邏輯：

1. **建立查找字典**（`BuildCommunityLookupDictionaries`）：
   - `communityByBuildingIdDict`：以 `MappingID`（即 BuildingID）為 key
   - `communityByGroupIdDict`：以 `GroupId` 為 key

2. **優先查找順序**（`GetUpdateTagParameter`）：
   - 優先使用 `BuildingID` 查找成屋社區
   - 其次使用 `NewBuildGroupID` 查找新建案社區

3. **寫入關聯**：找到社區後寫入 `TagBuildingHeadID`、`TagBuildingHeadGroupId`、`TagBuildingHeadName`
