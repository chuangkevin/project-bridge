---
name: houseprice-price-es-tag-update
description: Knowledge and code-reading patterns for HousePrice PriceTag / PriceEs flow and the DealALLCaseList.TagUpdateDatetime process flag. Always use this skill when asked whether PriceEs fetches TagUpdateDatetime IS NULL rows, how PriceTag / PriceEs / PriceUpdateCommunity chain together, when TagUpdateDatetime becomes NULL or GETDATE(), how pending ES rebuild records are identified, or when the user mentions 實價登錄 ES, PriceEs, PriceTag, PriceTagJob, PriceUpdateCommunity, PriceCommunityUpdateJob, TagUpdateDatetime, onlyNew, GetDealAllCaseListWithUpdate, GetDealAllCaseListForPriceTagAsync, GetDealAllCaseListTagAsync, GetSidWithNeedUpdateAsync, 待更新資料, 重建 ES, or asks how this batch pipeline works.
---

# HousePrice PriceEs / TagUpdateDatetime Skill

## 流程概覽

`TagUpdateDatetime` 在這個專案裡不是單純的時間欄位，而是 `DealALLCaseList` 的流程旗標。

- `NULL`：這筆資料待補標籤、待進入 `PriceEs` 重建，或剛被標籤流程重設
- `非 NULL`：這筆資料已完成該輪標籤 / ES 後處理，時間值就是完成時間

排程依賴關係如下：

```text
PriceUpdateCommunity
  -> PriceTag
       -> PriceEs
            -> PriceEnd
```

對應程式位置：`HousePrice.Web.Task/HousePrice.Web.Task/Constants/JobConstants.cs`

---

## 關鍵判讀規則

回答相關問題時，優先用下面這組規則，不要把 `TagUpdateDatetime` 解讀成一般資料欄位：

| 狀態 | 意義 | 常見來源 |
|------|------|----------|
| `TagUpdateDatetime IS NULL` | 待處理 / 待重建 ES | 新資料、標籤異動後重設 |
| `TagUpdateDatetime IS NOT NULL` | 已完成處理 | `PriceEs` 或後續流程完成後寫回 |

### 重要結論

1. `PriceEs` 目前會撈 `TagUpdateDatetime IS NULL` 的資料。
2. 標籤更新流程與社區回填流程都可能把 `TagUpdateDatetime` 重設為 `NULL`，讓資料重新進入 ES 重建。
3. ES 批次成功後通常會把這批資料的 `TagUpdateDatetime` 更新成 `GETDATE()`；另外也有單筆更新路徑會直接寫 `GETDATE()`。

---

## 主要程式入口

### PriceEs 排程入口

- `HousePrice.Web.Task/HousePrice.Web.Task/Infrastructure/Jobs/PriceScheduleJob.cs`
  - `PriceEs(...)` 先刪既有 ES，再呼叫 `DealAllCaseListCreateElasticAsync(...)`

### PriceEs 取資料入口

- `HousePrice.Web.Task/HousePrice.Web.Task/Infrastructure/Jobs/DealAllCaseListJob.cs`
  - `DealAllCaseListCreateElasticAsync(...)`
  - 呼叫 `_dealAllCaseListService.GetDealAllCaseListWithUpdate(city)`

- `HousePrice.Web.Task/HousePrice.Web.Task.Service/Implement/Price/DealAllCaseListService.cs`
  - `GetDealAllCaseListWithUpdate(string county)`
  - 單純轉呼叫 repository

- `HousePrice.Web.Task/HousePrice.Web.Task.Repository/Implement/Price/HousePriceDealAllCaseListRepository.cs`
  - `GetDealAllCaseListWithUpdate(string county)`
  - 關鍵條件：`and tt.County = @County And [TagUpdateDatetime] is null`

### PriceEs 完成後寫回旗標

- `HousePrice.Web.Task/HousePrice.Web.Task/Infrastructure/Jobs/DealAllCaseListJob.cs`
  - ES 寫入成功後呼叫 `_dealAllCaseListService.UpdateFlag(...)`

- `HousePrice.Web.Task/HousePrice.Web.Task.Service/Implement/Price/DealAllCaseListService.cs`
  - `UpdateFlag(List<long> sidList)`

- `HousePrice.Web.Task/HousePrice.Web.Task.Repository/Implement/Price/HousePriceDealAllCaseListRepository.cs`
  - `UpdateTagUpdateTime(List<PriceUpdateFlagDataModel> updateFlagList)`
  - SQL：`TagUpdateDatetime = getdate()`

---

## TagUpdateDatetime 何時會被重設成 NULL

這是最容易被誤解的地方。回答時要明講：不是只有新資料才會是 `NULL`，既有資料只要標籤重算或社區對應更新，也可能被打回 `NULL`。

### 典型重設點

- `UpdateMRTTagAsync(...)`
  - 會更新 `TagMrtStation`
  - 同時把 `TagUpdateDatetime = null`

- `UpdateAllTagAsync(...)`
  - 會更新 `TagMrtStation`、`TagBuildingHeadID`、`TagBuildingHeadName` 等標籤欄位
  - 同時把 `TagUpdateDatetime = null`

因此，若使用者問「為什麼舊資料又被 PriceEs 撈到了」，預設判讀應是：標籤流程把它重設為待處理狀態。

### 另一個常見重設來源：PriceUpdateCommunity

- `PriceCommunityUpdateJob.Start(...)`
  - 會整理實登社區對應資料後呼叫 `PriceCommunityService.Update(...)`

- `PriceCommunityService.UpdateAsync(...)`
  - 會把 `UpdateTime = null` 傳進 repository

- `PriceCommunityRepository.UpdateAsync(...)`
  - SQL 會更新 `TagBuildingHeadID`、`TagBuildingHeadGroupId`、`TagBuildingHeadName`
  - 同時把 `TagUpdateDatetime = @UpdateTime`，也就是 `NULL`

因此只要社區對應有變動，這筆資料也可能重新回到待處理狀態。

---

## 常見查詢 / 程式判斷點

### PriceTag 排程版只抓待處理資料

`GetDealAllCaseListForPriceTagAsync(string county)` 使用條件：

```sql
AND tt.County = @County
AND tt.TagUpdateDatetime IS NULL
```

這裡指的是 `PriceTagJob.StartAsync(...)` 這條排程路徑。

### 也存在全量標籤路徑

`DealAllCaseListUpdateTagAsync(...)` 會呼叫：

```csharp
GetDealAllCaseListTagAsync(city, district)
```

因為沒有傳 `onlyNew: true`，所以這條路徑不一定只查 `TagUpdateDatetime IS NULL`。

### 行政區標籤查詢支援 onlyNew

`GetDealAllCaseListTagAsync(string county, string district, bool onlyNew = false)`

- `onlyNew = true` 時會補上：`AND [TagUpdateDatetime] IS NULL`
- 這表示「只查新資料」在這裡的實際定義，就是「只查流程旗標仍為待處理的資料」

### 系統判斷是否仍需更新

`GetSidWithNeedUpdateAsync()` 也包含：

```sql
and TagUpdateDatetime is null
```

這代表系統層面對「是否還有待處理實登」的判定，本質上也是看這個旗標。

---

## 回答這類問題時的建議說法

若使用者問：

- 「`PriceEs` 是不是撈 `TagUpdateDatetime is null` 的資料？」
  - 直接回答：**是**，`PriceEs` 取資料的 repository 條件明確包含 `TagUpdateDatetime is null`。

- 「`TagUpdateDatetime` 為什麼會是 null？」
  - 回答：可能是新資料尚未完成流程，也可能是標籤欄位剛被更新後重設成 `null`，等待 ES 重建。

- 「這欄位非 null 代表什麼？」
  - 回答：代表這筆資料目前不在待重建佇列，時間值通常是最後一次完成處理或單筆更新的時間。

- 「舊資料為什麼又進 PriceEs？」
  - 先檢查標籤更新流程是否把 `TagUpdateDatetime` 重設為 `null`。

---

## 常用 SQL 範例

### 查某縣市待進 PriceEs 的資料

```sql
SELECT SID, County, District, CaseNo, TagUpdateDatetime
FROM DealALLCaseList WITH(NOLOCK)
WHERE County = N'<county>'
  AND TagUpdateDatetime IS NULL
ORDER BY SID DESC
```

### 查某縣市已處理完成的資料

```sql
SELECT TOP 100 SID, County, District, CaseNo, TagUpdateDatetime
FROM DealALLCaseList WITH(NOLOCK)
WHERE County = N'<county>'
  AND TagUpdateDatetime IS NOT NULL
ORDER BY TagUpdateDatetime DESC
```

### 查特定 SID 目前是否在待處理狀態

```sql
SELECT SID, CaseNo, TagMrtStation, TagBuildingHeadID, TagBuildingHeadName, TagUpdateDatetime
FROM DealALLCaseList WITH(NOLOCK)
WHERE SID = <sid>
```

---

## Notes

- 這個 skill 的重點是「流程語意」而不是單看欄位名稱。
- `TagUpdateDatetime = NULL` 不等於資料壞掉，通常表示流程刻意標記為待重跑。
- `NULL` 的來源不只新資料，也包含標籤更新與社區對應回填。
- 回答時優先引用實際程式入口：Job -> Service -> Repository，再指出 SQL 條件。
- 若使用者問的是「目前正式邏輯會不會撈到」這類問題，應以 repository 的實際 SQL 為準，不要只看 DTO 或方法名稱推測。
