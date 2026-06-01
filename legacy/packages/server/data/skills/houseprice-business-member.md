---
name: houseprice-business-member
description: Knowledge and query patterns for HousePrice 2B (business/professional) vs 2C (consumer) membership. Always use this skill when asked about HousePrice member types, checking if a phone number belongs to a 2B member, querying the BusinessMember table, looking up real estate broker/agent status, identifying active business members, or working with the Member + BusinessMember tables. Invoke whenever the user mentions 2B members, business members, 不動產經紀人, 經紀業, or wants to verify a member's business identity.
---

# HousePrice Business Member (2B) Skill

## Membership Model Overview

HousePrice 的會員分為兩種類型：

| Type | 說明 | 備註 |
|------|------|------|
| **2C** (B2C) | 一般網站會員 — 買方、賣方、一般大眾 | 僅有基本帳號，**實質上沒有任何平台功能** |
| **2B** (B2B) | 不動產經紀人 / 營業員 等專業從業人員 | **主要客戶**，擁有完整平台功能 |

**核心概念**：所有會員都存在 `dbo.Member`，但只有 2B 專業會員在 `dbo.BusinessMember` 有對應的啟用記錄。2C 會員就是單純有帳號，平台功能對他們是關閉的。業務邏輯、功能開關、查詢重點都以 2B 為主。

---

## 查詢會員的兩種方式

### 方式一：API（`scripts/query_member.ps1`）

Member Service 測試環境端點：
- `GET /api/Member/ByPhone/{phone}` — 以電話查
- `GET /api/Member/{id}` — 以會員 UUID 查

```powershell
.\scripts\query_member.ps1 -Mode phone -Value 0900000000
.\scripts\query_member.ps1 -Mode id -Value c5d2d44e-8d0d-4181-9ec4-e6d97a9069e6
```

> 兩個端點都回傳 `dbo.Member` 的基本資料。通常先用電話查到 `Id`，再視需要用 Id 查詢。

### 方式二：直接查 DB（適合深入查詢）

判斷是否為啟用中 2B 會員 — 標準查詢：

```sql
SELECT M.Id, M.Phone, M.Name, M.Email,
       BM.CertificateType, BM.Brand, BM.ContactStore, BM.ContactCompany,
       BM.City, BM.District, BM.IsActive AS BM_IsActive, BM.Permissions
FROM dbo.Member M WITH(NOLOCK)
JOIN dbo.BusinessMember BM WITH(NOLOCK) ON M.Id = BM.Id
WHERE BM.IsActive = 1
```

以電話號碼查特定會員是否為 2B：

```sql
SELECT M.Id, M.Phone, M.Name, M.Email,
       BM.CertificateType, BM.Brand, BM.ContactStore, BM.ContactCompany,
       BM.City, BM.District, BM.IsActive AS BM_IsActive, BM.Permissions
FROM dbo.Member M WITH(NOLOCK)
JOIN dbo.BusinessMember BM WITH(NOLOCK) ON M.Id = BM.Id
WHERE M.Phone = N'<phone_number>'
  AND BM.IsActive = 1
```

> **判斷規則**：有 `BusinessMember` 記錄且 `BM.IsActive = 1` → 2B 會員。否則（無記錄或 IsActive = 0）→ 視為 2C（僅一般帳號）。

---

## Key Fields 說明

需要特別注意的欄位（其餘欄位字面意義即可）：

- `BusinessMember.CertificateType` — `1`=不動產經紀人, `2`=不動產營業員, `0`=未知
- `BusinessMember.IsActive` — 2B 身份的開關，`1` 才算有效 2B 會員
- `BusinessMember.Permissions` — 功能權限 bitmask，bit 1 = 個人店鋪（每位 2B 會員至少有此權限）
- `Member.Phone` — varchar(10)，不含國碼，查詢主要 key

---

## Common Query Patterns

### 快速確認某電話是否為 2B 會員
```sql
SELECT CASE WHEN COUNT(1) > 0 THEN '2B Member' ELSE 'Not 2B (2C or inactive)' END AS MemberType
FROM dbo.Member M WITH(NOLOCK)
JOIN dbo.BusinessMember BM WITH(NOLOCK) ON M.Id = BM.Id
WHERE M.Phone = N'0900000000'
  AND BM.IsActive = 1
```

### 列出所有啟用中的 2B 會員
```sql
SELECT M.Phone, M.Name, M.Email,
       BM.CertificateType, BM.ContactCompany, BM.ContactStore,
       BM.City, BM.District, BM.Permissions
FROM dbo.Member M WITH(NOLOCK)
JOIN dbo.BusinessMember BM WITH(NOLOCK) ON M.Id = BM.Id
WHERE BM.IsActive = 1
ORDER BY M.Name
```

### 2B / 2C 人數統計
```sql
-- 啟用中 2B 會員數
SELECT COUNT(*) AS Active2BCount
FROM dbo.BusinessMember WITH(NOLOCK) WHERE IsActive = 1

-- 全部已啟用帳號數
SELECT COUNT(*) AS TotalMembers
FROM dbo.Member WITH(NOLOCK) WHERE IsActive = 1
```

---

## Notes

- Always include `WITH(NOLOCK)` on both tables — this is the project convention for read-only queries.
- Phone numbers in `Member.Phone` are stored without country code (e.g., `0900000000`), varchar(10).
- `BM.Permissions` is a bitmask; bit 1 = 個人店鋪 (always set for any 2B member). Higher bits represent additional feature permissions.
- A member may have an inactive BusinessMember row (they were once 2B but are now deactivated). Always filter `BM.IsActive = 1` to get currently active 2B members.
- 2C 會員沒有 BusinessMember 記錄，平台功能對其無效，業務邏輯不需特別處理其行為。
