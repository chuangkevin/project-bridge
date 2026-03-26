---
name: nuget-decompile-with-ilspycmd
description: Use when C# 型別、列舉、方法或 namespace 看起來來自外部 NuGet 套件，尤其是 repo 只搜到使用處、搜不到定義，或公司內部 `HousePrice.*`、`Evertrust.*` namespace 命中後需要優先鎖定候選 DLL 並用 ilspycmd 驗證時。
---

# 使用 ILSpyCmd 反編譯 NuGet 套件

## 概述

當符號不在目前 repo 內時，不要停在「知道它可能來自 NuGet」；要繼續鎖定套件、版本、DLL，並優先用 `ilspycmd` 驗證。

核心原則：
- 先確認目前 repo 沒有定義，再判斷外部來源
- 公司內部 `HousePrice.*`、`Evertrust.*` namespace 一旦命中規則，就優先找對應 DLL
- 找不到 DLL 或 `ilspycmd` 時，要明說，不要猜
- 若 DLL 旁有 XML 文件，優先用它補齊摘要與說明
- `HousePrice.Nuget` 是 repo / package 命名家族，不是 namespace 前綴

## 使用時機

- repo 只找得到使用處，找不到型別定義
- `using` 或完整型別名稱看起來像來自外部套件
- 使用者要查 enum 成員、屬性、方法簽章、XML 摘要
- HousePrice 專案中看到 `HousePrice.*` 或 `Evertrust.*` namespace，但目前 repo 沒有定義

不要用在：
- 型別已存在目前 repo
- 問題只是在 repo 內追程式流程
- 既沒有本機 DLL，也沒有可確認的套件資訊

## 必要流程

1. 搜尋符號與完整 namespace，確認 repo 只有使用處沒有定義。
2. 檢查 `.csproj`、`Directory.Packages.props`、`packages.lock.json`、`obj/project.assets.json`。
3. 若命中下方 namespace 規則，直接縮小候選套件範圍。
4. 到本機 NuGet cache 找對應版本 DLL。
5. 優先用 `ilspycmd` 檢視型別，不要只靠使用處推測。
6. 若有同名 XML，讀取 XML 補齊摘要。
7. 回答時要附上套件名、版本、DLL 路徑、完整型別名稱。

## 公司內部 namespace 命中規則

看到下列 namespace，且目前 repo 搜不到定義時，優先懷疑對應 DLL：

| Namespace 命中 | 優先候選套件 / DLL | 備註 |
|---|---|---|
| `HousePrice.Models.*` | `HousePrice.Nuget.Models` / `HousePrice.Models.dll` | 最重要例外：套件名不是 `HousePrice.Models` |
| `HousePrice.Common.*` | `HousePrice.Common` / `HousePrice.Common.dll` | 常見於 helper、extension、utility |
| `HousePrice.Elasticsearch.Index.DocumentModel.*` | `HousePrice.Elasticsearch.Index.DocumentModel` / `HousePrice.Elasticsearch.Index.DocumentModel.dll` | 常見 `*DocumentModel` |
| `HousePrice.Http.*` | `HousePrice.Http` / `HousePrice.Http.dll` | 常見 `IApiHelper`、`IRedisCacheHelper`、middleware |
| `HousePrice.Observability.*` | `HousePrice.Observability` / `HousePrice.Observability.dll` | 常見 logging / tracing 整合 |
| `HousePrice.SharedViews.*` | `HousePrice.SharedViews` / `HousePrice.SharedViews.dll` | 偏 Razor / MVC 場景 |
| `HousePrice.Tracing`、`HousePrice.Tracing.*` | `HousePrice.Tracing` / `HousePrice.Tracing.dll` | 與 `HousePrice.Observability.Tracing` 容易混淆 |
| `Evertrust.*` | 先看 `PackageReference` 對應套件，再找相近名稱 DLL | 也是公司套件，找不到定義時同樣優先走 `ilspycmd` |

## 高優先關鍵字

若看到這些型別或 API，且 repo 搜不到定義，優先進入 `ilspycmd` 流程：

- `*DocumentModel`
- `*ViewModel`
- `*ParameterModel`
- `IApiHelper`
- `IRedisCacheHelper`
- `TracingParameterAttribute`
- `ActivityEnrichment`
- `LayoutMetaData`
- `AddApiHelper`
- `AddHousePriceRedisCache`
- `AddSharedViews`
- `AddTracing`
- `Evertrust.*`

## Evertrust 常見判斷範例

看到 `Evertrust.*` 且 repo 搜不到定義時，不要只停在「這是公司套件」；要先用 namespace 縮小到最接近的 package 家族，再進 `ilspycmd`：

- `Evertrust.Core.Common.AspNetCore.Extensions`、`Evertrust.Core.Common.AspNetCore.Misc`、`Evertrust.Core.Common.AspNetCore.Attributes`
  - 優先查 `Evertrust.Core.Common.AspNetCore`
  - 再找 `Evertrust.Core.Common.AspNetCore.dll`
- `Evertrust.Core.Dapper.AspNetCore`
  - 優先查 `Evertrust.Core.Dapper.AspNetCore`
  - 再找 `Evertrust.Core.Dapper.AspNetCore.dll`
- `Evertrust.Setting.Connections`、`Evertrust.Setting.Connections.Extensions.Redis`
  - 先看 `Evertrust.Setting.Connections*` 相關 `PackageReference`
  - 常見候選是 `Evertrust.Setting.Connections`、`Evertrust.Setting.Connections.Extensions.Redis`
- `Evertrust.ResponseWrapper.Models`、`Evertrust.ResponseWrapper.Extensions`、`Evertrust.ResponseWrapper.Middlewares`
  - 優先查 `Evertrust.ResponseWrapper`
  - 再找 `Evertrust.ResponseWrapper.dll`
- `Evertrust.Setting.Url`、`Evertrust.Setting.Url.AspNetCore.Microsoft.DependencyInjection`
  - 先看所有 `Evertrust.Setting.Url*` 套件，不要要求 package 名一定和 namespace 完全相同
  - 若看到較長 package 名，也要一併納入 DLL 候選

判斷原則：
- 先比 namespace 前綴，不要先比短型別名
- package 名可能與 namespace 完全相同，也可能是較長的宿主套件名
- 候選縮小後就直接找 DLL，用 `ilspycmd` 驗證，不要只靠命名猜測

## 警訊與例外

- `HousePrice.Models.*` 常對應安裝套件 `HousePrice.Nuget.Models`，不要只猜 `HousePrice.Models`
- `HousePrice.Nuget` 不是 namespace；它通常是 package / repo 命名，不要拿它當 `using` 前綴判斷
- `HousePrice.Tracing` 與 `HousePrice.Observability.Tracing` 是兩套路徑，要看完整 namespace 與 API 名稱
- 有些型別名可能重複，先看完整 namespace，不要只看短型別名
- 若 namespace 是 `Evertrust.*`，也屬於公司套件範圍；應優先查對應 Evertrust 套件與 DLL，而不是停在 repo 搜尋
- 若快取有多個版本 DLL，要以目前專案實際引用版本為準

## 建議命令

```bash
grep "SymbolName" -include "*.cs"
grep "PackageReference.*PackageName" -include "*.csproj"
where ilspycmd
ilspycmd -l c "C:\path\to\Package.dll"
ilspycmd -t Full.Namespace.TypeName "C:\path\to\Package.dll"
```

也要檢查：
- `Directory.Packages.props`
- `packages.lock.json`
- `obj/project.assets.json`
- DLL 同目錄 XML 文件

## 輸出規則

必須報告：
- 該符號是否來自外部 NuGet 套件
- 候選 namespace 規則是如何命中的
- 專案實際使用的套件名稱與版本
- 檢視的 DLL 路徑
- 反編譯的完整型別名稱

若是 enum：
- 列出全部成員
- 若沒有明確指定值，補上預設遞增值
- 若 XML 有摘要，優先引用 XML

若是 class / interface：
- 列出關鍵屬性、方法、簽章
- 若反編譯結果因缺少參考而不完整，要直接註明

## 常見失敗

- 搜到 namespace 後，只停在猜套件名，沒去開 DLL
- 把 `HousePrice.Models.*` 誤查成 `HousePrice.Models` 套件，而不是 `HousePrice.Nuget.Models`
- 把 `HousePrice.Nuget` 誤當成 namespace，而不是 package / repo 命名
- 忽略 XML 文件，錯過較乾淨的摘要
- 快取有多版本時，看錯 DLL
- 看到 `Evertrust.*` 卻沒有直接進入公司套件查找與 `ilspycmd` 流程

## 基線缺口

沒有這份技能時，常見行為是：
- 只知道符號像來自 NuGet
- 用 namespace 猜幾個候選套件後就停下來
- 遇到 `HousePrice.Models.*` 時，漏掉真正的套件名 `HousePrice.Nuget.Models`
- 遇到 `Evertrust.*` 時，只知道是公司套件，但沒有立刻去找 DLL

這份技能要求：只要命中公司套件規則且 repo 搜不到定義，就優先找 DLL，並用 `ilspycmd` 驗證。

## 範例

使用者問：

```text
原 repo 只有 using HousePrice.Models.Common.Enums;，但找不到 PlatformEnum 定義
```

預期做法：
- 先確認目前 repo 沒有 `PlatformEnum` 定義
- 命中 `HousePrice.Models.*` 規則
- 優先查 package `HousePrice.Nuget.Models`，不是把 `HousePrice.Nuget` 當 namespace
- 在 NuGet cache 找對應版本 `HousePrice.Models.dll`
- 用 `ilspycmd` 查看 `HousePrice.Models.Common.Enums.PlatformEnum`
- 需要描述時再讀同目錄 XML
