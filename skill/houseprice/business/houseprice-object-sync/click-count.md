# 點擊數管理（ClickCount）

> **來源專案**：`Tasks.Buy.BusinessCase`

## 業務目的

灌水點擊數讓**經紀人**覺得物超所值（不是給 C 端看的）。有買廣告的物件會獲得更多灌水點擊。

---

## 灌水公式（GenerateFakeClickCount，每日 00:10）

依前日**實際點擊數**和**是否有買廣告**決定灌水量：

| 前日實際點擊 | 有廣告 | 無廣告 |
|-------------|--------|--------|
| ≤ 2 | 10-20 | 2-4 |
| 3-5 | 21-30 | 5-10 |
| 6-10 | 31-50 | 11-20 |
| > 10 | 實際+31 ~ 實際+50 | 實際+11 ~ 實際+20 |

**上限**：有廣告 80、無廣告 50。在範圍內隨機取值。

### 時段分配

灌水點擊分配到 7 個時段，模擬自然流量：

| 時段 | 佔比 | 備註 |
|------|------|------|
| 00:00-03:00 | 7% | |
| 06:00-08:00 | 8% | |
| 08:00-12:00 | 15% | |
| 12:00-15:00 | 16% | |
| 15:00-18:00 | 17% | |
| **18:00-21:00** | **20%** | **強制保底**（確保有點擊） |
| 21:00-24:00 | 17% | |

每個時段內再分配到具體時間點，寫入 `AdaptedWebCaseFakeClickCountDetail`。

---

## 定時釋放（UpdateFakeClickCount，每 5 分鐘）

每 5 分鐘檢查 detail 表，把「時間已到但還沒處理」的灌水點擊加到 master 表：

- 條件：`IsProcessed = 0 AND ActTime <= NOW`
- MERGE 到 `AdaptedWebCaseClickCount.FakeCount`
- 處理後標記 `IsProcessed = 1`

效果：灌水點擊隨時間逐步「釋放」，看起來像自然增長。

---

## 區域統計（CalculateDistrictClickCount，每日 00:10）

彙整過去 30 天每個「縣市+行政區」的總點擊數（實際+灌水合計），寫入 `AdaptedWebCaseCityDistrictClickCount`。

---

## 重置（ResetCaseClickCountAsync）

物件到期時觸發，將 `ClickCount` 和 `FakeCount` 都歸零。

---

## 歷史整理（ConsolidateHistoricalClickData，每日 02:00）

壓縮 180 天以上的舊資料：
- 依廣告期間彙總，保留最後一筆紀錄（寫入期間合計）
- 刪除同期間其他明細
- 每日最多跑到 06:00（4 小時上限），未完成隔天繼續

---

## 涉及的 Table

| Table | 用途 |
|-------|------|
| `AdaptedWebCaseClickCount` | 點擊數 master（ClickCount + FakeCount） |
| `AdaptedWebCaseFakeClickCount` | 每日灌水紀錄（RealCountToday、FakeActualCountToday） |
| `AdaptedWebCaseFakeClickCountDetail` | 灌水明細（具體時間點、IsProcessed） |
| `AdaptedWebCaseCityDistrictClickCount` | 區域統計（City + District） |
| `AdaptedWebCaseAdvertisements` | 判斷是否有廣告（HasAd） |
| `AdvertisementRecord` | 廣告期間（歷史整理用） |
