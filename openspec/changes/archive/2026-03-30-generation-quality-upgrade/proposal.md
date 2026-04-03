## Why

AI 生成的原型品質不穩定，主要問題：
1. **風格偏差**：生成結果常出現大面積黃色/橘色色塊、過度飽和的漸層、純白背景，與 HousePrice 實際網站風格嚴重不符
2. **Master Agent prompt 品質不足**：spec 描述過於簡短（< 50 字），sub-agent 得不到足夠資訊，導致頁面結構單薄
3. **Design Convention 內容不完整**：目前只有 1123 字的色彩列表，缺少 typography、component patterns、layout conventions、禁忌清單
4. **Sub-Agent 缺乏品質約束**：沒有明確的「不可以做什麼」指引，AI 自由發揮出不符品牌的設計

## What Changes

- 升級 Design Convention 為完整設計系統文件（~5000 字），包含色彩、字型、元件、layout、禁忌
- 重構 Master Agent prompt：要求每頁 spec 200+ 字、sharedCss 200+ 行、包含具體 component 描述
- 重構 Sub-Agent prompt：注入完整設計系統約束、加入「AVOID」清單、要求使用 CSS variables
- 新增 Design System Validator：生成後自動檢查是否違反設計規範（大面積色塊、錯誤字型、過大 shadow 等）
- 新增 Convention Enforcement：sub-agent 的 HTML 生成後自動修正違規的色彩值

## Capabilities

### New Capabilities
- `design-system-document`: 升級 design convention 為完整設計系統文件，包含色彩、typography、components、layout、anti-patterns
- `master-agent-quality`: 提升 master agent 的 spec 品質，強制每頁 200+ 字、完整 component 描述、navigation flow
- `sub-agent-constraints`: 在 sub-agent prompt 中注入設計系統約束和禁忌清單，確保生成結果符合品牌
- `post-generation-validator`: 生成後自動驗證設計規範合規性（色彩、shadow、font、layout），回報違規項目

### Modified Capabilities
(none)

## Impact

- **Server**: `masterAgent.ts`、`subAgent.ts` prompt 重構；新增 `designSystemValidator.ts`
- **DB**: `global_design_profile.design_convention` 內容升級
- **Client**: 品質評分 badge 可能新增設計規範合規維度
- **效果**: 生成結果視覺品質顯著提升，符合 HousePrice 品牌風格
