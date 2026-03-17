## Why

目前只有 PM 能輸入文字規格，設計師無法貢獻設計意圖。生成的 UI 缺乏設計指導，導致原型的視覺品質低落，設計師無法用這個工具與其他角色協作。需要一個專屬於設計師的輸入區塊，讓他們定義視覺語言，並確保 AI 生成的原型忠實呈現設計意圖。

## What Changes

- 新增「Design Profile」面板，設計師可設定：文字描述設計方向、上傳視覺參考圖（mood board、截圖、設計稿）、設定設計 token（顏色、字型、間距、圓角、陰影風格）
- 視覺參考圖使用 OpenAI Vision API 分析，提取設計特徵描述
- Design Profile 存入資料庫，與專案綁定
- Design Profile 中的所有資訊注入 AI prompt，AI 生成時必須遵照設計規格
- 工作區新增「Design」標籤頁，和 Chat 標籤分開

## Capabilities

### New Capabilities
- `design-profile`: 設計師的設計輸入面板 — 描述、參考圖上傳（Vision 分析）、設計 token 設定，並注入 AI prompt

### Modified Capabilities
- `ai-chat-generation`: 在 AI prompt 中注入 design profile 資訊（新增行為，非破壞性變更）

## Impact

- **New dependency**: OpenAI Vision API（gpt-4o for image analysis，已有 key）
- **Database**: 新增 `design_profiles` 表（一個專案對應一個 profile）
- **APIs**: 新增 design profile CRUD + 參考圖上傳分析端點
- **Frontend**: 工作區新增 Design 標籤頁，含描述輸入、參考圖上傳、token 設定表單
