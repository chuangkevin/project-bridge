## Why

目前設計風格（顏色、字型、圓角、陰影等）只能在每個專案個別設定，跨專案時需重複配置，無法統一品牌形象。需要一個全域設計系統，讓品牌基礎風格一次設定、全部專案自動套用，同時保留各專案微調的彈性。

## What Changes

- **新增全域設計設定頁面**：可設定全域的設計方向、設計細節（tokens）與美術風格說明
- **專案繼承開關**：每個專案的 Design 面板新增「繼承全域設計」開關（預設開啟）
- **專案補充欄位**：繼承時，專案可填寫額外的補充說明（如「此頁面按鈕使用橘色強調色」）
- **合成邏輯**：AI 生成時，將全域設計 + 專案設計合併注入 system prompt；專案設定覆蓋全域衝突的部分
- **全域美術風格**：全域 Design 也支援上傳視覺參考圖、AI 分析與 art style 偵測

## Capabilities

### New Capabilities
- `global-design-profile`: 全域設計規格的 CRUD，儲存全域設計方向、tokens、reference_analysis
- `project-design-inheritance`: 專案層級的繼承開關與補充說明，以及全域 + 專案設計的合成注入邏輯

### Modified Capabilities
- `design-input`: 現有設計輸入需支援「繼承全域」模式，DesignPanel 顯示全域設計預覽與補充欄位

## Impact

- **新 API**: `GET/PUT /api/global-design` — 全域設計規格
- **DB 變更**: 新增 `global_design_profile` 表；`design_profiles` 加 `inherit_global` 和 `supplement` 欄位
- **修改**: `packages/server/src/routes/chat.ts` — 合成全域 + 專案設計注入
- **修改**: `packages/client/src/components/DesignPanel.tsx` — 繼承開關、補充欄位、全域預覽
- **新增**: `packages/server/src/routes/globalDesign.ts`
- **新增**: `packages/client/src/pages/GlobalDesignPage.tsx`（可從首頁或設定入口）
