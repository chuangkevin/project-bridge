---
name: houseprice-order-quota
description: HousePrice 訂單與額度（代幣）系統的 domain knowledge。當需要理解物件刊登的付費機制、額度購買/扣除/到期/轉帳流程、訂單生命週期、或開發訂單相關功能時使用此 skill。
---

# HousePrice 訂單與額度系統

> **來源專案**：`WebService.Order`

## 核心概念

| 概念 | 說明 |
|------|------|
| 訂單 (Order) | 經紀人購買方案的交易紀錄 |
| 方案 (Package) | 可購買的產品組合，包含一定數量的額度 |
| 額度 (Quota) | 代幣概念，**一個額度對應一種產品類型**。購買時指定產品，附加到物件上 |
| 產品 (Product) | 額度對應的具體服務類型（物件刊登、AI美裝等） |
| 點數 | 舊的實作名稱，本質等同額度，之後會轉移為額度 |

---

## 業務流程

```
經紀人購買方案（Order）— 方案包含指定產品類型的額度
  → 付款完成（IsPaid = 完成）
  → 額度（Quota）分配到會員帳號（按產品類型分開計算）
  → 經紀人刊登物件或購買加值服務時，扣除對應產品類型的額度
  → 額度有效期限到期 → 需重新購買
```

### 新增產品類型的流程

1. **NuGet**：在 `HousePrice.Models` 的 `ProductTypeEnum` 新增 enum 值
2. **Admin**：由內部人員在後台新增商品種類、定價
3. **Developer**：撰寫新產品的業務流程與入口
4. **相關專案**：`Web.Business.Order`（購買 UI）、`WS.Order`（額度管理）、`Tasks.Order`（排程）

---

## 產品類型 (ProductTypeEnum)

> 定義在 NuGet 套件 `HousePrice.Models.Order.Enums.ProductTypeEnum`

### 買屋

| 值 | 名稱 | 說明 | 對應 BuyAdTypeEnum |
|----|------|------|-------------------|
| 100000 | 物件刊登 | 物件本身的刊登額度 | 物件刊登 |
| 200000 | 自動更新 | 定時刷新物件排序 | 定時更新 |
| 300000 | 關注焦點 | 焦點位廣告 | 關注焦點 |
| 700000 | 優質推薦 | 推薦位廣告 | 優質推薦 |
| 800000 | 特色標籤 | | |

### 買屋 AI

| 值 | 名稱 | 說明 |
|----|------|------|
| 10000 | AI美裝 | AI 照片美化 |
| 10001 | AI影音 | AI 生成影片 |
| 10002 | AI-LINE貼圖 | |
| 10003 | AI-知識圖卡 | |

### 租屋

| 值 | 名稱 |
|----|------|
| 1000 | 租屋物件刊登 |
| 1001 | 租屋關注焦點 |
| 1002 | 租屋自動更新 |

### 其他

| 值 | 名稱 | 說明 |
|----|------|------|
| 400000 | 點數 | 舊實作，之後轉為額度 |
| 500000 | 開發工具 | |
| 600000 | 電傳 | 調閱電傳 |
| 900000 | 講座 | |
| 901000 | 線上課程 | |
| 902000 | 社區專家 | |
| 99999 | 廣告版位 | 暫時的商品（2024/09/25 備註） |

---

## 涉及的 Table

### 訂單層

| Table | 用途 | 關鍵欄位 |
|-------|------|---------|
| **Orders** | 訂單主檔 | Id, MemberId, IsPaid, PayType, OrderType, TotalPrice, ActivateTime |
| **OrderPackage** | 訂單內的方案 | PackageId, OrderId, PackageInfoName, Price, Quantity |
| **OrderPackageProduct** | 方案內的商品 | ProductId, MemberId, ProductTypeId, Amount, UsedAmount, StartDate, EndDate, Status |
| **OrderInvoice** | 發票 | OrderId, InvoiceNumber |
| **OrderPayment** | 金流 | OrderId, CashId |

### 額度層

| Table | 用途 | 關鍵欄位 |
|-------|------|---------|
| **Quotas** | 額度主檔 | Id, MemberId, Quota(初始), Remain(剩餘), ProductTypeId, ChannelType, EndDate, Version(樂觀鎖) |
| **QuotaHistory** | 額度異動紀錄 | Id, MemberId, HistoryType(獲得/使用), SourceType(來源), SourceId, Description |
| **QuotaHisotryDetail** | 異動明細 | QuotaHistoryId, QuotasId, Quota(本次異動量), EndDate |

### 使用追蹤

| Table | 用途 | 關鍵欄位 |
|-------|------|---------|
| **CaseUseProductLog** | 物件使用哪個額度 | ProductLogId, MemberId, ProductTypeId, CaseSid, Status(使用中/過期), StartDate, EndDate |

---

## 資料流

### 1. 訂單付款 → 額度分配

```
Orders.IsPaid → 完成
  → 遍歷 OrderPackageProduct
    → INSERT Quotas（Remain = Amount）
    → INSERT QuotaHistory（HistoryType=獲得, SourceType=訂單來源）
    → INSERT QuotaHisotryDetail
```

EndDate = ActivateTime + DurationDays（方案決定的有效天數）。

### 2. 刊登物件 → 額度扣除

```
查詢 Quotas（MemberId + ProductTypeId + Remain > 0 + EndDate >= NOW，依到期日排序）
  → UPDATE Quotas SET Remain = Remain - 1, Version = Version + 1
    WHERE Version = @OldVersion（樂觀鎖，防並發衝突）
  → INSERT CaseUseProductLog（CaseSid + ProductTypeId + 使用中）
  → INSERT QuotaHistory（HistoryType=使用, SourceType=物件使用）
```

### 3. 額度轉帳

業務場景：
- 店團購：admin 先轉給店內一人，該人再在 007 平台轉給其他人
- 不做這行的人有剩餘額度要轉移

```
UPDATE Quotas SET Remain = Remain - N（轉出者）
INSERT Quotas（轉入者，Remain = N，繼承原 EndDate）
INSERT QuotaHistory（雙方各一筆，SourceType=轉帳）
```

### 4. 額度到期

```
Quotas.EndDate < NOW AND Remain > 0
  → UPDATE Quotas SET Remain = 0
  → INSERT QuotaHistory（HistoryType=使用, SourceType=過期）
```

---

## 訂單狀態 (OrderIsPaidEnum)

| 值 | 狀態 | 說明 |
|----|------|------|
| -1 | 註銷訂單 | 已取消 |
| 0 | 等待付款 | 一般訂單初始狀態 |
| 1 | 完成 | 付款完成，額度已分配 |
| 2 | 付款失敗 | |
| 3 | 子單未分配 | 店團購的子單 |
| 4 | 母單未付款 | 店團購的母單初始狀態 |
| 5 | 建立訂單 | |
| 6 | 訂單成立 | |
| 7 | 逾期作廢 | |

## 訂單類型 (OrderTypeEnum)

| 值 | 類型 | 說明 |
|----|------|------|
| 1 | 一般訂單 | 經紀人自己購買 |
| 2 | 店團購訂單 | 母單，店長/公司批量購買 |
| 3 | 店團購分配 | 子單，從母單分配給個別經紀人 |

**店團購實務流程**：admin 由內部人員轉移給店中一人，該人再在 007 平台轉給其他人（因為 admin 直接分配太麻煩）。

---

## 付款方式 (OrderPayTypeEnum)

| 值 | 方式 |
|----|------|
| 1 | 線上 — 信用卡 |
| 2 | 線上 — 銀行轉帳 |
| 3 | 贈送 |
| 4 | 點數（等同額度，舊實作） |
| 7 | 線上 — 超商繳費 |
| 8 | 線下 — 刷卡 |
| 9 | 線下 — 銀行匯款 |

---

## 額度來源 (SourceTypeEnum)

| 值 | 來源 |
|----|------|
| 1 | 訂單購買 |
| 2 | 物件使用（扣除） |
| 3 | 物件過期使用 |
| 4 | 後台扣除 |
| 5 | 轉帳 |
| 99 | 系統建立 |

---

## 並發控制

Quotas 表使用 **Version 欄位做樂觀鎖**：
- 每次扣除 `Version = Version + 1`
- UPDATE 條件包含 `WHERE Version = @OldVersion`
- 版本不符 → 表示有人正在操作 → 拋錯誤

---

## 與物件管理的關係

| 動作 | 誰呼叫 WS.Order | 做什麼 |
|------|-----------------|--------|
| 經紀人刊登物件 | WebService.BusinessCase | 扣除「物件刊登」額度 |
| 購買加值廣告 | WebService.BusinessCase | 扣除對應產品額度 |
| 廣告到期 | Tasks.Buy.BusinessCase | 更新 CaseUseProductLog 為過期 |
| 查詢剩餘額度 | Web.Business | 顯示在 007 前端 |

---

## Notes

- 額度有兩層追蹤：OrderPackageProduct（訂單層面的 Amount/UsedAmount）和 Quotas（實際扣減的 Remain）
- 所有額度操作使用 DbContext Transaction 保證原子性
- 點數是舊的實作名稱，之後會轉移為額度
