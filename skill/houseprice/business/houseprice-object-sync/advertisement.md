# 廣告到期處理（BuyCaseAdvertisementJob）

> **來源專案**：`Tasks.Buy.BusinessCase`

## 廣告類型

| BuyAdTypeEnum | 說明 | 排序權重 |
|---------------|------|---------|
| 物件刊登 | 物件本身的刊登 — **不在此 Job 處理**，有獨立的到期下架流程 | — |
| 關注焦點 | 焦點位廣告 | 8（最高） |
| 優質推薦 | 推薦位廣告 | 4 |
| AI影音 | AI 生成影片 | 2 |
| AI美裝 | AI 照片美化 | 1（最低） |
| 定時更新 | 自動刷新物件排序 | — |

物件的 **SortPriority = 所有有效廣告權重加總**。廣告到期後權重移除，排序降低。

---

## 到期判斷

每日 00:00 執行，查詢：

```
AdaptedWebCaseAdvertisements.ExpiredDate < NOW
AND AdType IN (關注焦點, 優質推薦, 定時更新, AI美裝, AI影音)
```

**注意**：`物件刊登`（AdType=0）的到期由另一個 Job（AdaptedWebCaseJob.ExpireAsync）處理，不在這裡。

---

## 各類型到期流程

### AI美裝 / AI影音

```
刪除 AdaptedWebCaseAdvertisements 紀錄
  → AI美裝: 排入 AIPictureJob 刪除 C 端 AI 圖片 + 重算排序
  → AI影音: 排入 BuyBusinessCaseViewDataJob 更新 C 端影音資訊
```

### 優質推薦 / 關注焦點

```
Transaction:
  1. 更新 CaseUseProductLog.Status → 過期
  2. 刪除 AdaptedWebCaseAdvertisements 紀錄
  → 排入 BuyBusinessCaseViewDataJob 更新廣告類型和排序
```

### 定時更新

```
Transaction:
  1. 更新 CaseUseProductLog.Status → 過期
  2. 刪除 AdaptedWebCaseRegularUpdateSettings（時間排程設定）
  3. 刪除 AdaptedWebCaseAdvertisements 紀錄
  → 無 C 端更新（刷新停止即可）
```

---

## 物件到期 vs 廣告到期

| | 物件到期（刊登到期） | 加值廣告到期 |
|---|---|---|
| AdType | 物件刊登 (0) | AI美裝/AI影音/定時更新/優質推薦/關注焦點 |
| 處理 Job | AdaptedWebCaseJob.ExpireAsync | BuyCaseAdvertisementJob |
| 影響 | **整個物件下架，C 端消失** | 移除特定加值功能，物件仍在刊登 |
| CaseUseProductLog | 不更新 | 更新為過期（優質推薦/關注焦點/定時更新） |

兩者都用 `AdaptedWebCaseAdvertisements.ExpiredDate` 判斷，但 AdType 不同。

---

## 涉及的 Table

| Table | 動作 |
|-------|------|
| `AdaptedWebCaseAdvertisements` | 刪除到期紀錄 |
| `CaseUseProductLog` | Status 從 使用中(1) → 過期(2)（優質推薦/關注焦點/定時更新） |
| `AdaptedWebCaseRegularUpdateSettings` | 刪除時間排程（僅定時更新） |

> **相關 skill**：
> - 廣告購買/額度扣除 → `houseprice-order-quota`（「與物件管理的關係」段落）
> - 物件本身的到期下架 → `houseprice-object-sync/expiration.md`
