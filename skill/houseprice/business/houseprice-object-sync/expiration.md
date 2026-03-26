# 物件到期下架

> **來源專案**：`Tasks.Buy.BusinessCase`、`WebService.BusinessCase`

## 到期判斷

依據 `AdaptedWebCaseAdvertisements.ExpiredDate`（廣告到期日），條件：

```sql
AWCA.ExpiredDate < NOW AND AWCA.AdType = 物件刊登
```

**不是** `EntrustDateTime`。是廣告（物件刊登類型）到期驅動下架。

---

## 自動到期流程（每日 00:10）

```
ExpireAsync()（Tasks.Buy.BusinessCase）
  ↓
查詢 AdaptedWebCaseAdvertisements.ExpiredDate < NOW 且 AdType = 物件刊登
  ↓
依 MemberId 分批
  ├─ Enqueue CloseBuyCaseAsync（每批關閉物件）
  │   ↓
  │   呼叫 WebService.BusinessCase 的 API 更新狀態
  │   ↓
  │   下架完成後 Enqueue GetExpiredBuyCasesAndDispatchAdDeletionsAsync
  │     ↓
  │     查詢已過期物件的 AdType=物件刊登 廣告
  │     ↓
  │     Enqueue BulkDeleteExpiredBuyCaseAdAsync（每 500 筆批次移除廣告）
  │
  └─ Enqueue ResetCaseClickCountAsync（重置點擊數）
```

---

## 異常修復（每日 04:00）

`HandleAnomalousExpiredBuyCasesAsync()` 檢測兩種資料不一致：

- **情境一**：物件仍在刊登（State=1）但**缺乏有效廣告**支撐 → 應該下架但沒下架
- **情境二**：物件已下架（State≠1）但**過期廣告未移除** → 廣告該清沒清

找到後重新排入標準到期處理流程修復。

---

## 強制下架（Force Off-Shelf）

由客服/管理員手動觸發：

```
POST → WebService.BusinessCase /api/v2/Inventory/ForceOffShelfInventory/{sid}
  ↓
InventoryForceOffShelfService.HandleAsync()
  ├─ 驗證：必須是 Open 狀態
  ├─ Transaction（原子性）
  │   ├─ DELETE AdaptedWebCaseAdvertisements（硬刪除所有廣告）
  │   ├─ UPDATE AdaptedWebCase.State → Close (ForceOffShelf)
  │   └─ INSERT AdaptedWebCaseStateChangeHistory
  ├─ EXEC SP17（BI 倉庫下架）
  ├─ DELETE → C 端顯示層
  ├─ 發布 InventoriedForcedOffShelvedEvent
  └─ 通知訂閱者
```

### 自動到期 vs 強制下架

| | 自動到期 | 強制下架 |
|---|---------|---------|
| 觸發 | 排程（廣告 ExpiredDate 過期） | 客服手動 API |
| 廣告紀錄 | 分發子 Job 批次移除 | **Transaction 內硬刪除** |
| CloseReason | AdDueDate | ForceOffShelf |
| 可恢復 | 使用者可重新刊登 | **不可恢復** |

---

## 關閉原因 (InventoryCloseReason)

| Reason | 說明 | 觸發方式 |
|--------|------|---------|
| AdDueDate | 刊登到期 | 自動排程 |
| EntrustDueDate | 委託到期 | ⚠️ 歷史遺留，目前無自動觸發機制 |
| Self | 自行關閉 | 經紀人手動 |
| ChangeStore | 變更仲介店 | 系統/管理員 |
| StoreNotApproved | 仲介店未通過審核 | 系統 |
| MemberRemoved | 會員刪除 | 會員刪除時連動關閉所有庫存 |
| ForceOffShelf | 客服強制下架 | 客服手動 |

---

## 清理的東西

| 目標 | 動作 |
|------|------|
| AdaptedWebCase.State | 更新為 Close + CloseReason |
| AdaptedWebCaseStateChangeHistory | 新增歷史紀錄 |
| AdaptedWebCaseAdvertisements | 移除到期廣告（AdType=物件刊登） |
| ES buy_business_case | 刪除（透過 Tasks.Buy.BusinessCase API） |
| AI 影片 | 隱藏（透過 IS service） |
| BI 倉庫 | SP17 處理下架 |
| 訂閱通知 | 通知訂閱者（透過 Task.Notification） |
| 點擊數 | 重置（ResetCaseClickCountAsync） |

---

## 阻擋條件

**不能關閉**：ImportInventory 狀態、已被 ForceOffShelf 的物件

**不能強制下架**：物件不存在、狀態不是 Open
