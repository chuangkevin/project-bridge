---
name: houseprice-backend-architecture
description: HousePrice 後端架構通用 pattern 與資料流。當需要理解 MSSQL → ES 資料同步機制、排程 Job 結構、快取策略、系統間關係時使用此 skill。適用於新人 onboarding、跨 repo 開發、或需要理解資料從 DB 到 API 的完整流程。專案清單與 URL 對應請參考 houseprice-project-mapping skill。
---

# HousePrice Backend Architecture Overview

## 內部術語

| 術語 | 等價 | 說明 |
|------|------|------|
| 007 = business = B端 = 2B | 同一個東西 | 不動產經紀人刊登平台 |
| buy = C端 = 2C | 同一個東西 | 使用者找不動產的平台 |
| 物件 | — | 不動產 |
| 庫存 | — | 已上傳到平台的物件（不論是否公開） |

---

## 技術棧

| 技術 | 角色 |
|------|------|
| MSSQL | 主資料庫（source of truth），所有寫入操作都在這裡 |
| Elasticsearch (ES) | 查詢用資料源，除管理平台外前端資料皆由 ES 提供 |
| C# (.NET 8) | 後端語言，WebService API + 排程 Job |
| RabbitMQ | 事件驅動同步（少數專案，如物件狀態變更） |
| Redis | 快取（少數專案） |

> **內部框架 Evertrust**：提供 connection string 管理、跨專案 URL 查找（`IWebsiteUrlHelper`）、API response 標準化包裝、event bus 等共用基礎設施。各專案不會直接管理 connection string，統一由 `Evertrust.Setting` 處理。

---

## 呼叫鏈

```
Frontend → Web → WebService (WS)
```

- Frontend **不會**直接打 WebService
- Web 層負責組合/轉發，WS 層提供 API 服務
- 部分場景只有 Web 層，沒有對應 WS

**例外**：管理平台（`Web.Admin`）為內部服務，直接 query SQL，不經 WS 層。

---

## 資料流

```
MSSQL (source of truth)
  → 排程 Job [90%+] / RabbitMQ event [少數]
    → Elasticsearch (查詢用資料源)
      → Repository (90% 直查 ES, 少數帶快取判斷)
        → WebService API
          → Web
            → Frontend
```

**例外**：管理平台（`Web.Admin`、`Web.Task`）直接查 MSSQL，不經 ES。

---

## 排程 Job

- 使用 **Hangfire** 框架，SQL Server 作為 storage
- 三層結構：**Job → TransformService → Repository**
  - Job 只負責觸發，不含業務邏輯
  - TransformService 協調同步流程
  - Repository 負責資料讀寫
- 所有 recurring job 集中在 `HangfireJobTrigger.OnStart()` 註冊

---

## ES 同步

核心邏輯：**從 MSSQL 讀資料，批次寫入 ES**。具體實作因專案而異。

| 模式 | 用途 | 說明 |
|------|------|------|
| **Incremental Sync** | 日常同步 | 只處理有異動的資料，批次 upsert/delete |
| **Full Transform** | 全量重建（部分專案） | 建新 index → 批次寫入 → alias 切換（zero downtime） |

> 各專案的批次大小、狀態管理方式、觸發條件都不同，開發時以該專案的實際程式碼為準。

---

## 快取

少數專案使用 Redis 或 Memory Cache，透過 Decorator pattern 包裝 repository。

---

## Domain Event

少數專案使用 RabbitMQ 發布 domain event（透過 `Evertrust.EventBus`）。例如 `WebService.Business` 的物件上架/下架/修改會觸發事件。

---

## 業務流程跨專案分布

| 業務流程 | 寫入/觸發 | 排程/同步 | 讀取/顯示 | 相關 skill |
|---------|----------|----------|----------|-----------|
| 物件 CRUD & 刊登 | WS.BusinessCase | Task.Business | Web.Business | object-management |
| 付費 & 額度 | WS.Order | Tasks.Order | Web.Business.Order, Web.Business | order-quota |
| C端顯示層同步（ES: `buy_business_case`） | Task.Business → Tasks.Buy.BusinessCase | Tasks.Buy.BusinessCase | WS.Buy, WS.Price | object-sync/consolidation |
| 廣告加值 | WS.BusinessCase → WS.Order | Tasks.Buy.BusinessCase | WS.Buy | object-sync/advertisement |
| 物件歸戶 | WS.BusinessCase → Task.Business | Task.Business (SP15) | WS.Business | object-sync/consolidation |
| 會員管理 | WS.Member | — | Web.Business | business-member, business-member |
| 店鋪/經紀人設定 | WS.Realtor | — | Web.Business, Web.Realtor | business-member |
| 社區 | WS.Community | Task.Community | WS.Buy, WS.Community | houseprice-community |

---

## Notes

- 所有 read-only 查詢加 `WITH(NOLOCK)`，這是專案慣例
- 專案清單、URL 對應、Port 資訊請參考 `houseprice-project-mapping` skill
