# Increase Agent Input Limits for Large Documents

## Problem Statement
使用者回報 Agent 無法讀取完整的大型規格書。經查，系統多處存在 50K - 80K 字元的硬編碼截斷，對於 50 頁以上的文件明顯不足。

## Proposed Solution
統一將關鍵環節的輸入上限提升至 **500,000 (500K)** 字元。
Gemini 2.5 Flash 支援 1M Context，500K (約 250K-350K Tokens) 處於安全且高效的範圍。

## Success Criteria
- [x] 大型文件（超過 80K 字元）能被完整提取頁面。
- [x] Agent 技能分析能考慮到文件的後半部分。
- [x] 多頁面原型在微調時不會因為 HTML 過大而被截斷。
