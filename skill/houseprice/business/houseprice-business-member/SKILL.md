---
name: houseprice-business-member
description: HousePrice 會員、店鋪、品牌的完整 domain knowledge 與查詢模式。當需要理解 2B/2C 會員架構、經紀人與店鋪的關係、品牌管理、權限系統、會員查詢、或開發會員/店鋪相關功能時使用此 skill。Invoke whenever the user mentions 2B members, business members, 不動產經紀人, 經紀業, 店鋪, Brand, Permission, or wants to verify a member's business identity.
---

# HousePrice 會員/店鋪/品牌

> **來源專案**：`WebService.Business`、`WebService.Member`、`WebService.Realtor`、`Web.Business`、`WebService.BusinessCase`

## 核心關係

```
Brand（品牌/公司）
  └─ BusinessMember（經紀人，掛在某品牌下）
      └─ Member（基本帳號，1:1 對應）
      └─ Permission（Agent/Store 等權限）
      └─ AdaptedWebCase（經紀人的物件，透過 CreateUserID 關聯）
```

| 概念 | 說明 |
|------|------|
| **Member** | 基本帳號，Phone 是主要查詢 key |
| **BusinessMember** | 經紀人擴充資料（證照、品牌、聯絡門市），與 Member 1:1 |
| **Brand** | 不動產公司/品牌（如永慶、信義等），多個經紀人共用一個品牌 |
| **Store** | 實體門市，不是獨立 table，而是經紀人設定中的一種**權限狀態** |
| **Agent** | 個人經紀人，也是一種**權限狀態** |

---

## 會員類型

| 類型 | 說明 |
|------|------|
| 2C（C端會員） | 在 007 或 Buy 平台註冊，**目前沒有功能** |
| 2B（B端會員） | 有 BusinessMember 紀錄且 IsActive=1 的會員，**主要客戶** |

- 沒有特別的審核流程，直接註冊
- 2B 判斷規則：Member JOIN BusinessMember，兩邊 IsActive 都是 1
- 2C 沒有 BusinessMember 記錄，平台功能對其無效

---

## 權限系統

權限有兩種表示：

- **SQL 欄位**：`BusinessMember.Permissions` 是 bitmask（long 整數）
- **API 層**：透過 `ToEnumFlags<PermissionEnum>()` 轉成 `IEnumerable<PermissionEnum>`

兩者是同一個東西的不同表示。

### PermissionEnum 值

| 值 | 說明 | 備註 |
|----|------|------|
| **Agent** | 個人經紀人 | **預設值** — 所有 2B 會員至少有此權限。Permissions 欄位為 null 時預設 Agent |
| **Store** | 店鋪 | 一個店鋪只能有一個人開通 Store 權限 |

只有這兩個值。`PermissionHandlerFactory` 只處理 Agent 和 Store。

### ForB vs ForC API

| | ForB（業者端） | ForC（消費者端） |
|---|---|---|
| 認證 | 需要 JWT | 不需要 |
| Agent 設定 | GET/PATCH（可修改） | GET only（用 phone 查） |
| Store 設定 | GET/PATCH（可修改） | GET only（用 phone 查） |
| 權限查詢 | GET `/api/Permission` | 透過 `/api/Realtor/{phone}/{permission}/IsActive` 查 |

---

## 品牌 (Brand)

| 欄位 | 說明 |
|------|------|
| BrandId | 品牌 ID（int） |
| BrandName | 短名稱 |
| BrandFullName | 法定全名 |
| BrandBan | 統一編號 |
| EffectYn | 是否有效（Y/N）— 被動欄位，我們不管理（見下方說明） |

- 品牌是共用資源，多個經紀人掛同一個品牌
- BusinessMember.Brand（int）→ 對應 BrandDataModel.BrandId
- 品牌資料從 `WS.Common` 取得（`/api/v1/Base/GetBrandAsync`）
- **Brand 有新舊兩套 table**：舊 Brand table 與其他單位共用，會被外部影響，所以查詢時要篩選 `EffectYn = 'Y'`。新 Brand table 不與其他單位共用，不需要管 EffectYn

---

## 經紀人/店鋪設定

Agent 和 Store 共用 `RealtorBasicSettingModel` 基礎欄位：

| 欄位 | 說明 |
|------|------|
| IsStoreActive | 是否啟用 |
| Name / AliasName | 真實姓名 / 顯示名稱 |
| Phone / AliasPhone | 真實電話 / 顯示電話 |
| DefaultChannel | 預設頻道 |
| BannerPicUrl | 橫幅圖片（Web/Mobile） |
| StoreProfilePicUrl[] | 門市照片 |
| StoreProfileText | 門市介紹 |

Store 額外有地址欄位（City/District/Road/座標等）和證照號碼。

設定透過 `WS.Realtor` 微服務管理，`Web.Business` 是 facade。

### Store vs Agent 差異

| | Store | Agent |
|---|---|---|
| Permission code | 1 | 2 |
| 預設 IsStoreActive | false | true |
| 地址欄位 | 有（City/District/Road + 座標） | 無 |
| 證照 | 有（經紀人 + 租屋） | 無 |
| 建立方式 | 第一次 PATCH settings 時隱式建立 | 同左 |
| 停用方式 | IsStoreActive 設 false | 同左 |

### 店鋪成員管理

- 同一個 `ContactStore + ContactCompany` 下的 BusinessMember = 同一個門市的成員
- `RealtorExcludeMembers` table 可以排除特定成員不顯示在門市團隊中
- 一個門市只能有一個人開通 Store 權限

### 資料儲存

RealtorSettings table（EF Core）：
- `BusinessMemberId`（FK → BusinessMember）
- `Permission`（1=Store, 2=Agent）
- `PermissionStatus`（合約是否有效）
- `IsStoreActive`（使用者是否啟用）
- 設定欄位 + 圖片（透過 transaction 更新，先刪舊圖再插新圖）

---

## 會員生命週期

### 刪除

會員刪除時發布 `MemberRemovedEvent`：

- `WebService.BusinessCase` 的 `CloseMemberInventoryEventHandler` 接收
- 自動關閉該會員**所有庫存**（CloseReason = MemberRemoved）

### 停用

- Member.IsActive 或 BusinessMember.IsActive 設為 0
- 查詢時兩邊都檢查 `IsActive = 1`

---

## 與物件的關係

- `AdaptedWebCase.CreateUserID` → 對應 `Member.Id`
- `AdaptedWebCase.ShopId` → 對應實體門市（optional）
- 物件數量**沒有上限**

---

## Key Fields

| 欄位 | 說明 |
|------|------|
| `BusinessMember.CertificateType` | `1`=不動產經紀人, `2`=不動產營業員, `0`=未知 |
| `BusinessMember.IsActive` | 2B 身份的開關，`1` 才算有效 |
| `BusinessMember.Permissions` | bitmask (long)，透過 ToEnumFlags 轉 enum。Agent=預設, Store=一店一人 |
| `Member.Phone` | varchar(10)，不含國碼，查詢主要 key |

---

## 查詢模式

### API 查詢（`scripts/query_member.ps1`）

Member Service 測試環境端點：
- `GET /api/Member/ByPhone/{phone}` — 以電話查
- `GET /api/Member/{id}` — 以會員 UUID 查

```powershell
.\scripts\query_member.ps1 -Mode phone -Value 0900000000
.\scripts\query_member.ps1 -Mode id -Value c5d2d44e-8d0d-4181-9ec4-e6d97a9069e6
```

### SQL 查詢

判斷是否為啟用中 2B 會員：

```sql
SELECT M.Id, M.Phone, M.Name, M.Email,
       BM.CertificateType, BM.Brand, BM.ContactStore, BM.ContactCompany,
       BM.City, BM.District, BM.IsActive AS BM_IsActive, BM.Permissions
FROM dbo.Member M WITH(NOLOCK)
JOIN dbo.BusinessMember BM WITH(NOLOCK) ON M.Id = BM.Id
WHERE M.Phone = N'<phone_number>'
  AND BM.IsActive = 1
```

快速確認某電話是否為 2B：

```sql
SELECT CASE WHEN COUNT(1) > 0 THEN '2B Member' ELSE 'Not 2B' END AS MemberType
FROM dbo.Member M WITH(NOLOCK)
JOIN dbo.BusinessMember BM WITH(NOLOCK) ON M.Id = BM.Id
WHERE M.Phone = N'0900000000'
  AND BM.IsActive = 1
```

---

## 相關 skill

> - 物件與會員的關係 → `houseprice-object-management`（會員與物件段落）
> - 會員刪除連動關閉物件 → `houseprice-object-sync/expiration.md`

---

## Notes

- 所有 read-only 查詢加 `WITH(NOLOCK)`
- Phone 不含國碼，varchar(10)
- 會員可能有 inactive 的 BusinessMember（曾經是 2B 但已停用），查詢時務必篩選 `BM.IsActive = 1`
