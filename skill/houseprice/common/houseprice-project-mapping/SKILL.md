---
name: houseprice-project-mapping
description: Knowledge of HousePrice 全黑豹專案對應關係與部署資訊. Always use this skill when asked about which WebService or Task project corresponds to a Web project, or when needing to find downstream projects to trigger from Repository layer. Invoke whenever the user mentions 專案對應、下游專案、WebService 對應、Task 對應、部署資訊、Port 查詢、URL Key、IWebsiteUrlHelper、Nuget 套件, or wants to understand project dependencies and which API to call via Evertrust.Url.
---

# HousePrice 全黑豹專案對應關係

## 專案架構概覽

```
Web 專案 (前端/入口)
  ├── HousePrice.Web.Wakanda → HousePrice.WebService.Wakanda
  ├── HousePrice.Web.Protal  → HousePrice.WebService.BuyCase / HousePrice.WebService.Buy
  ├── HousePrice.Web.Buy     → HousePrice.WebService.Buy
  ├── HousePrice.Web.Rent    → HousePrice.WebService.Rent
  ├── HousePrice.Web.Price   → HousePrice.WebService.Price
  ├── HousePrice.Web.Community → HousePrice.WebService.Community
  ├── HousePrice.Web.News    → HousePrice.WebService.Common
  ├── HousePrice.Web.Realtor → YCHF.WebService.Common.HP
  └── HousePrice.Web.Admin   → (多個 WebService)

Task 專案 (背景排程)
  ├── HousePrice.Web.Task
  ├── HousePrice.Tasks.Buy.BusinessCase
  ├── HousePrice.Tasks.Notification
  ├── HousePrice.Tasks.Order
  ├── HousePrice.Tasks.Rent
  ├── HousePrice.Tasks.Report
  ├── HousePrice.Task.Business
  └── HousePrice.Tasks.Buy
```

**核心原則**：從 Repository 層觸發下游時，需要知道對應的 WebService 或 Task 專案。透過 Evertrust.Url 套件存取對應的 Key 來呼叫 API。

---

## Web 專案

> **URL 補充規則**：
>
> - 正式環境 domain 直接使用主網域，例如：`https://price.houseprice.tw`
> - 測試環境 domain 先以 `-s2` 規則註記，例如：`https://price-s2.houseprice.tw`
> - WebService 也套用同一規則，例如：`https://ws-price.houseprice.tw` → `https://ws-price-s2.houseprice.tw`
> - 無法從目前程式碼與技能來源明確確認的專案，先保留 `-`，後續再手動補

| 專案名稱 | 正式機 Port | 測試機 Port | Web URL | 是否上雲 | URL Key | TFS 連結 | 備註 |
|---------|-----------|-----------|---------|---------|---------|---------|------|
| HousePrice.Web.Wakanda | 9525 | 16800 | `https://manager.houseprice.tw` | ✅ | - | [TFS](https://tfs.evertrust.com.tw/tfs/MISCollection/HousePrice.Web.Wakanda/_release) | 僅部屬雲端 |
| HousePrice.Web.Protal | 9539 | 16801 | `https://www.houseprice.tw` | ✅ | `HOUSEPRICE_WS_BUY` | [TFS](https://tfs.evertrust.com.tw/tfs/MISCollection/HousePrice.Web.Protal/_release) | |
| HousePrice.Web.Buy | 9537 | 16802 | `https://buy.houseprice.tw` | ✅ | `HOUSEPRICE_WS_BUY` | [TFS](https://tfs.evertrust.com.tw/tfs/MISCollection/HousePrice.Web.Buy/_release) | |
| HousePrice.Web.Rent | 9542 | 16803 | `https://rent.houseprice.tw` | ✅ | `HOUSEPRICE_WS_RENT` | [TFS](https://tfs.evertrust.com.tw/tfs/MISCollection/HousePrice.Web.Rent/_release) | |
| HousePrice.Web.Price | 9544 | 16804 | `https://price.houseprice.tw` | ✅ | `HOUSEPRICE_WS_PRICE` | [TFS](https://tfs.evertrust.com.tw/tfs/MISCollection/HousePrice.Web.Price/_release) | |
| HousePrice.Web.Community | 9540 | 16805 | `https://community.houseprice.tw` | ✅ | `HOUSEPRICE_WS_COMMUNITY` | [TFS](https://tfs.evertrust.com.tw/tfs/MISCollection/HousePrice.Web.Community/_release) | |
| HousePrice.Web.News | 9524 | 16806 | `https://news.houseprice.tw` | ✅ | `HOUSEPRICE_WS_COMMON` | [TFS](https://tfs.evertrust.com.tw/tfs/MISCollection/HousePrice.Web.News/_release) | 僅部屬雲端 |
| HousePrice.Web.Realtor | 9550 | 16807 | `https://realtor.houseprice.tw` | ✅ | `HOUSEPRICE_WS_YCHF_COMMON` | [TFS](https://tfs.evertrust.com.tw/tfs/MISCollection/HousePrice.Web.Realtor/_release) | 僅部屬雲端 |
| HousePrice-rent (前端 ssr) | 9551 | 16808 | - | ✅ | - | [TFS](https://tfs.evertrust.com.tw/tfs/F2EWeb/HousePrice-rent/_release) | |
| Living (前端 ssr) | 9538 | 16810 | - | ✅ | - | [Gitea](https://gitea.housefun.com.tw/F2E_HP/HousePrice-buy-living) | |
| HousePrice.Web.Admin | - | - | `https://admin.houseprice.tw` | ❌ | - | [TFS](https://tfs.evertrust.com.tw/tfs/MISCollection/HousePrice.Web.Admin/_release) | |
| HousePrice.Web.Business.Order | - | - | `https://007-order.houseprice.tw` | ❌ | `HOUSEPRICE_WS_ORDER` | [TFS](https://tfs.evertrust.com.tw/tfs/MISCollection/Houseprice.Web.Business.Order/_release) | |
| HousePrice.Web.Video | - | - | `https://video.houseprice.tw` | ❌ | - | [TFS](https://tfs.evertrust.com.tw/tfs/MISCollection/HousePrice.Web.Video/_release) | |
| HousePrice.Web.Business | - | - | `https://007.houseprice.tw` | ❌ | `HOUSEPRICE_WS_BUSINESS` | [TFS](https://tfs.evertrust.com.tw/tfs/MISCollection/HousePrice.Web.Business/_release) | |
| HousePrice.Web.Member | - | - | `https://member.houseprice.tw` | ❌ | `HOUSEPRICE_WS_MEMBER` | [TFS](https://tfs.evertrust.com.tw/tfs/MISCollection/HousePrice.Web.Member/_release) | |
| HousePrice.Web.Land | - | - | - | ❌ | - | [TFS](https://tfs.evertrust.com.tw/tfs/MISCollection/HousePrice.Web.Land/_release) | |
| HousePrice.Web.CRM | - | - | - | ❌ | - | [TFS](https://tfs.evertrust.com.tw/tfs/MISCollection/HousePrice.Web.CRM/_release) | |

---

## WebService 專案

| 專案名稱 | 正式機 Port | 測試機 Port | WebService URL | 是否上雲 | URL Key | TFS 連結 | 備註 |
|---------|-----------|-----------|----------------|---------|---------|---------|------|
| HousePrice.WebService.Wakanda | 9526 | 16800 | - | ✅ | - | [TFS](https://tfs.evertrust.com.tw/tfs/MISCollection/HousePrice.Webservice.Wakanda/_release) | 僅部屬雲端 |
| HousePrice.WebService.BuyCase | 9570 | 16801 | `https://ws-buycase.houseprice.tw` | ✅ | `HOUSEPRICE_WS_BUY` | [TFS](https://tfs.evertrust.com.tw/tfs/MISCollection/HousePrice.WebService.BuyCase/_release) | |
| HousePrice.WebService.Buy | 9536 | 16802 | `https://ws-buy.houseprice.tw` | ✅ | `HOUSEPRICE_WS_BUY` | [TFS](https://tfs.evertrust.com.tw/tfs/MISCollection/HousePrice.WebService.Buy/_release) | |
| HousePrice.WebService.Rent | 9543 | 16803 | `https://ws-rent.houseprice.tw` | ✅ | `HOUSEPRICE_WS_RENT` | [TFS](https://tfs.evertrust.com.tw/tfs/MISCollection/HousePrice.Webservice.Rent/_release) | |
| HousePrice.WebService.Price | 9545 | 16804 | `https://ws-price.houseprice.tw` | ✅ | `HOUSEPRICE_WS_PRICE` | [TFS](https://tfs.evertrust.com.tw/tfs/MISCollection/HousePrice.WebService.Price/_release) | |
| HousePrice.WebService.Community | 9541 | 16805 | `https://ws-community.houseprice.tw` | ✅ | `HOUSEPRICE_WS_COMMUNITY` | [TFS](https://tfs.evertrust.com.tw/tfs/MISCollection/HousePrice.WebService.Community/_release) | |
| HousePrice.WebService.Common | 9538 | 16806 | `https://ws-common.houseprice.tw` | ✅ | `HOUSEPRICE_WS_COMMON` | [TFS](https://tfs.evertrust.com.tw/tfs/MISCollection/HousePrice.WebService.Common/_release) | |
| YCHF.WebService.Common.HP | 9550 | 16807 | `https://ws-ychf-common.houseprice.tw` | ✅ | `HOUSEPRICE_WS_YCHF_COMMON` | [TFS](https://tfs.evertrust.com.tw/tfs/MHJCollection/YCHF.WebService.Common.HP/_release) | 先依命名規則註記，後續可手動修正 |
| HousePrice.WebService.Realtor | - | - | `https://ws-realtor.houseprice.tw` | ❌ | - | [TFS](https://tfs.evertrust.com.tw/tfs/MISCollection/HousePrice.WebService.Realtor/_release) | |
| HousePrice.WebService.Member | - | - | `https://ws-member.houseprice.tw` | ❌ | `HOUSEPRICE_WS_MEMBER` | [TFS](https://tfs.evertrust.com.tw/tfs/MISCollection/HousePrice.WebService.Member/_release) | |
| HousePrice.WebService.BusinessCase | - | - | `https://ws-007case.houseprice.tw` | ❌ | - | [TFS](https://tfs.evertrust.com.tw/tfs/MISCollection/HousePrice.WebService.BusinessCase/_release) | |
| HousePrice.WebService.Message | - | - | `https://ws-message.houseprice.tw` | ❌ | - | [TFS](https://tfs.evertrust.com.tw/tfs/MISCollection/HousePrice.WebService.Message/_release) | |
| HousePrice.WebService.Order | - | - | `https://ws-order.houseprice.tw` | ❌ | `HOUSEPRICE_WS_ORDER` | [TFS](https://tfs.evertrust.com.tw/tfs/MISCollection/HousePrice.WebService.Order/_release) | |
| HousePrice.WebService.Report | - | - | - | ❌ | - | [TFS](https://tfs.evertrust.com.tw/tfs/MISCollection/HousePrice.WebService.Report/_release) | |
| HousePrice.WebService.Transcript | - | - | `https://ws-transcript.houseprice.tw` | ❌ | - | [TFS](https://tfs.evertrust.com.tw/tfs/MISCollection/HousePrice.WebService.Transcript/_release) | |
| HousePrice.Notification | - | - | `https://ws-notify.houseprice.tw` | ❌ | - | [TFS](https://tfs.evertrust.com.tw/tfs/MISCollection/HousePrice.Notification/_release) | |
| HousePrice.WebService.Business | - | - | `https://ws-007.houseprice.tw` | ❌ | `HOUSEPRICE_WS_BUSINESS` | [TFS](https://tfs.evertrust.com.tw/tfs/MISCollection/HousePrice.WebService.Business/_release) | |
| HousePrice.WebService.Land | - | - | - | ❌ | - | [TFS](https://tfs.evertrust.com.tw/tfs/MISCollection/HousePrice.WebService.Land/_release) | |
| HousePrice.WebService.CRM | - | - | `https://ws-crm.houseprice.tw` | ❌ | - | [TFS](https://tfs.evertrust.com.tw/tfs/MISCollection/HousePrice.WebService.CRM/_release) | |
| HousePrice.WebService.AI | - | - | - | ❌ | `HOUSEPRICE_WS_AIFACTORY` | - | AI 服務 |
| HousePrice.WebService.Manager | - | - | `https://manager.houseprice.tw` | ❌ | `HOUSEPRICE_WS_MANAGER` | - | 管理服務 |

> **補充**：部分 URL Key 對應的並非獨立專案，而是同一專案的不同用途端點：
>
> - `HOUSEPRICE_WS` — HousePrice.WebService.Common 的主服務入口
> - `HOUSEPRICE_WS_COMMON_LOC` — HousePrice.WebService.Common 的在地服務端點（捷運結轉、行政區）
> - `HOUSEPRICE_WS_LINE` — Line 推播服務
> - `HF_WS_RENT` — 好房網租屋服務（HouseFun.WebService.Rent）
> - `HF_WS_NEWHOUSE` — 好房網新建案服務（HouseFun.WebService.NewHouse）

> **URL Key 命名規則**：Key 格式為 `{服務名稱}[_{後綴}]`，後綴代表部署環境：
>
> | 後綴 | 意義 | 範例 |
> |------|------|------|
> | `_AWS` | 雲端環境 | `HOUSEPRICE_WS_COMMON_AWS` |
> | `_LOC` | 地端環境 | `HOUSEPRICE_WS_COMMON_LOC` |
> | （無後綴） | 預設環境 | `HOUSEPRICE_WS_COMMON` |

---

## Task 專案列表

Task 專案都是背景排程服務，**全部尚未上雲**。

| Task 專案 | 雲端部署 | 主要功能 | URL Key |
|----------|---------|---------|---------|
| HousePrice.Web.Task | ❌ | 通用排程 | - |
| HousePrice.Tasks.Buy.BusinessCase | ❌ | 買屋商機案件處理 | - |
| HousePrice.Tasks.Notification | ❌ | 通知排程 | `HOUSEPRICE_TASK_NOTIFICATION` |
| HousePrice.Tasks.Order | ❌ | 訂單處理 | - |
| HousePrice.Tasks.Rent | ❌ | 租屋相關排程 | - |
| HousePrice.Tasks.Report | ❌ | 報表產生 | - |
| HousePrice.Task.Business | ❌ | 商務相關排程 | `HOUSEPRICE_TASK_BUSINESS` |
| HousePrice.Tasks.Buy | ❌ | 買屋相關排程 | `HOUSEPRICE_TASK_BUY` |
| HousePrice.Task.Community | ❌ | 社區相關排程 | - |
| HousePrice.Tasks.Agent | ❌ | 房仲相關排程 | - |
| HousePrice.Tasks.Monitor | ❌ | 監控排程 | - |

---

## 專案依賴與 ES Index 關係

依賴關係和 ES index 讀寫關係分散記錄在各功能 skill 中（探索時已驗證），不集中在此。

查詢依賴關係請參考：
- **物件管理** → `business/houseprice-object-management/SKILL.md`（專案職責分工）
- **物件同步** → `business/houseprice-object-sync/SKILL.md`（ES index 對照、Job 分工）
- **歸戶結轉** → `business/houseprice-object-sync/consolidation.md`（跨服務呼叫、table 讀寫）
- **到期下架** → `business/houseprice-object-sync/expiration.md`（跨服務呼叫）

---

## 外部服務 URL Key

以下 Key 對應的是外部（非 HousePrice）服務，可透過 `IWebsiteUrlHelper` 或 `WebUrlOptions` 取得。

| Key 名稱 | 說明 |
|---------|------|
| `HOUSEPRICE_FPS` | 圖片處理服務 |
| `GEOGRAPHY` | 地理服務（區域/路段資訊） |
| `TRADEINFO` | 交易資訊服務 |
| `YC_BMS` | 永慶上稿系統 |
| `GTWS` | GT WebService |
| `EA_AREA` | EA 區域服務 |
| `EA_IMAGE_WS` | 底層圖片服務 |
| `EA_API` | EA API（api.evertrust.com.tw）- 縣市行政區道路 |



## 雲環境主機資訊

### Web 專案主機

**正式機**
```
SRVHPDK11-AWS
SRVHPDK12-AWS
SRVHPDK13-AWS
```

**測試機**
```
SRVHPDKWEB-S-AWS
```

### WebService 專案主機

**正式機**
```
SRVHPDK14-AWS
SRVHPDK15-AWS
SRVHPDK16-AWS
SRVHPDK17-AWS
SRVHPDK18-AWS
```

**測試機**
```
SRVHPDKWS-S-AWS
```

---

## Nuget 共用套件

| 套件名稱 | 說明 | 主要元件 |
|---------|------|---------|
| `HousePrice.Http` | HTTP 相關工具 | `IApiHelper`、`IRedisCacheHelper`、`CheckUserAgent`、安全中介軟體 |
| `HousePrice.Models` | 共用資料模型 | Rent、Buy、Realtor、Line 等領域模型與 Enums |
| `HousePrice.Common` | 通用工具 | `EnumUtils`、`UrlClassifier`、`PageAgent` 分頁元件 |
| `HousePrice.Tracing` | 分散式追蹤 | `TracingParameter`、`TracingActionFilter`、Tempo 整合 |
| `HousePrice.Observability` | 可觀測性 | Logging、Loki、Tempo、Exceptionless 設定 |
| `HousePrice.Elasticsearch.Index.DocumentModel` | ES 文件模型 | `WebCaseDocumentModel`、`RentCaseDocumentModel`、`CommunityDocumentModel` 等 |
| `HousePrice.SharedViews` | 共用 View 元件 | Layout、Channel 相關的 Razor 元件 |

**套件位置**：`D:\TFS\HP\HousePrice.Nuget\`

---

## DI 註冊範例

### 註冊 WebsiteUrlHelper

```csharp
using Repository.Helpers;

// 地端環境
services.AddSingleton<IWebsiteUrlHelper, WebsiteUrlHelper>();

// 雲端環境（AWS）
services.AddSingleton<IWebsiteUrlHelper, WebsiteUrlCloudHelper>();
```

### 註冊 WebUrlOptions（.NET 8）

```csharp
using HousePrice.WebService.Business.Common.Options;

services.AddOptions<WebUrlOptions>()
    .Bind(Configuration.GetSection("WebUrlOptions"));
```

---

## 統計摘要

### Web 專案 (17個)
- ✅ 已上雲：10個
- ❌ 未上雲：7個

### WebService 專案 (19個)
- ✅ 已上雲：8個
- ❌ 未上雲：11個

### Task 專案 (11個)
- ✅ 已上雲：0個
- ❌ 未上雲：11個

### 總計 (47個專案)
- ✅ 已上雲：18個 (38.3%)
- ❌ 未上雲：29個 (61.7%)

---

## 使用 IWebsiteUrlHelper 取得 URL

透過 DI 注入 `IWebsiteUrlHelper` 取得對應的 API URL：

```csharp
public class MyRepository(IWebsiteUrlHelper websiteUrlHelper)
{
    public async Task CallBuyServiceAsync()
    {
        // 取得 Buy WebService URL
        var url = websiteUrlHelper.HousePriceWsBuyUrl;
        // 或透過 WebUrlOptions
        // var url = webUrl.Value.HousePriceWsBuy;
    }
}
```

**注意**：URL Key 請見上方 WebService / Task 專案表格中的「URL Key」欄位。

---

## 查詢範例

### 從 Web 專案找對應的 WebService

**問題**：我在 HousePrice.Web.Buy 的 Repository，需要呼叫哪個 WebService？

**答案**：
1. Web 專案：`HousePrice.Web.Buy`
2. 對應 WebService：`HousePrice.WebService.Buy`
3. Port：正式機 9536 / 測試機 16802
4. 雲端部署：✅ 已上雲
5. URL Key：`HOUSEPRICE_WS_BUY`

### 從 Repository 層觸發下游 Task

**問題**：我需要更新租屋相關資料，應該觸發哪個 Task？

**答案**：
1. Task 專案：`HousePrice.Tasks.Rent`
2. 雲端部署：❌ 尚未上雲
3. 說明：租屋相關的背景排程處理

---

## 備註

- ✅ 表示已有雲環境
- ❌ 表示沒有雲環境
- Port 欄位顯示該專案在雲環境中使用的埠號（Web/WebService）
- URL Key 可透過 `IWebsiteUrlHelper` 或 `WebUrlOptions` 取得，詳見各專案表格中的「URL Key」欄位
- 本文件中的測試環境 URL 先以 `-s2` 規則整理；若實際專案使用特殊網域或不同命名，請以實際部署為準並手動修正
- 部分 WebService 專案沒有對應的 Web 前端，主要提供內部 API 服務
