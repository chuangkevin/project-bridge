## Context

現有設計系統：每個專案有獨立的 `design_profiles` 記錄（description、reference_analysis、tokens）。生成時將其注入為 `=== DESIGN PROFILE ===` 區塊。目前無全域概念，每個專案獨立。

需新增一層「全域設計」疊加在專案設計之上，同時維持向後相容（未繼承的專案行為不變）。

## Goals / Non-Goals

**Goals:**
- 全域設計 CRUD（`GET/PUT /api/global-design`），儲存於 `global_design_profile` 表（單一記錄）
- `design_profiles` 加 `inherit_global` (default 1) 和 `supplement` (TEXT) 欄位
- 生成時合成邏輯：全域 tokens + 描述 → 專案 tokens 覆蓋衝突 → 補充說明附加
- DesignPanel 顯示全域預覽（唯讀）、繼承開關、補充欄位
- 首頁新增「全域設計」入口按鈕，或在 WorkspacePage toolbar 加全域設計連結
- 全域 Design 也支援 analyze-reference（使用同一個端點）

**Non-Goals:**
- 多個全域 profile（品牌變體）——只有一個全域設計
- 版本歷程（history）
- 專案完全覆寫（不繼承）時，全域設計完全不影響

## Decisions

### D1: 全域設計儲存方式 — 單一固定 ID 記錄

**決定**: `global_design_profile` 表只有一筆記錄，使用固定 ID `'global'`，UPSERT 操作。

**理由**: 全域設計是單一概念，不需要多租戶、多版本。簡單 UPSERT 避免「找不到記錄」的邊界情況。

**替代方案**: 放進 `settings` KV 表（JSON blob）— 拒絕，因為 tokens 是結構化資料，分欄儲存更易查詢。

### D2: 合成注入順序 — 全域先，專案後

**決定**: System prompt 注入順序：
```
=== GLOBAL DESIGN ===
...全域描述、reference_analysis、tokens...

=== PROJECT DESIGN ===
...專案描述、reference_analysis、tokens（覆蓋衝突）...

=== PROJECT SUPPLEMENT ===
...補充說明...
```

**理由**: AI 閱讀順序為上到下，後面的指示會覆蓋前面。讓專案 tokens 在後面自然覆蓋全域衝突值。

**替代方案**: 在 server 端合併 tokens 物件再注入單一區塊 — 可行但隱藏了層次結構，AI 無法理解優先級意圖。

### D3: 前端全域設計入口 — 首頁 toolbar 按鈕

**決定**: 在 HomePage 右上角加「🌐 全域設計」按鈕，導向 `/global-design` 路由（新頁面 `GlobalDesignPage`，與 DesignPanel 共用相同 UI 結構）。

**理由**: 全域設計是跨專案操作，放在首頁比放在某個專案內更合理。

**替代方案**: 放在每個 WorkspacePage 的 toolbar — 拒絕，會混淆「這是全域還是專案的設定」。

### D4: DesignPanel 繼承模式顯示方式

**決定**: 當 `inherit_global=true` 時：
- 在 DesignPanel 頂部顯示「繼承全域設計」開關（ON 狀態）
- 開關下方顯示全域設計的摘要（description 前 80 字 + tokens 主色）作為唯讀預覽
- 設計細節（tokens）欄位顯示為「全域值 + 可覆蓋」——輸入框顯示 placeholder 為全域值，空白表示繼承
- 補充說明 textarea：自由填寫，附加在全域和專案設計之後

**決定**: 當 `inherit_global=false` 時：顯示與現在完全相同（獨立的設計設定）。

## Risks / Trade-offs

- **已有專案的向後相容**: `inherit_global` 預設為 1，現有專案全部自動繼承全域設計。若全域設計為空，合成邏輯跳過全域區塊，行為與舊版相同。風險低。
- **全域設計為空時的行為**: 全域 `description`、`tokens`、`reference_analysis` 皆空時，不注入 `=== GLOBAL DESIGN ===` 區塊，避免無意義的 prompt 雜訊。
- **補充說明衝突**: 使用者可能在補充說明中寫出與全域/專案矛盾的指示。→ 在 prompt 末尾加一行：「PROJECT SUPPLEMENT takes priority for any conflicting attributes.」

## Migration Plan

1. 新增 migration `005_global_design.sql`
2. 部署後，全域設計為空，`inherit_global=1` 的專案行為不變（全域空 = 不注入）
3. 使用者主動到「全域設計」頁面設定後才開始影響生成
4. 無需 rollback 腳本（新增欄位有 DEFAULT，刪除全域設計記錄即可回復）
