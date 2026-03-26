# Next Steps — Multi-AI Pipeline

## 問題
1. Keyword matching 太蠢 — 一個字 match 就覆蓋整個需求
2. AI analysis 經常 429 失敗 → fallback 到 keyword
3. Sub-agent 生成的內容跟需求不符（揪團→訂餐）
4. 沒有驗證機制 — 生成完就交給使用者，不確認品質

## 目標架構：Multi-AI Discussion Pipeline

```
1. Planner AI (1 call)
   - 分析需求、推理頁面、決定功能
   - 產出：{ pages, features, navigation, constraints }
   - 串流 reasoning 到 client

2. Reviewer AI (1 call)
   - 檢查 planner 的輸出
   - 確認頁面名稱合理、功能覆蓋需求
   - 指出盲點（例如：揪團系統需要聊天、地圖）
   - 產出：修正後的 plan

3. Sub-Agents (N calls, parallel)
   - 根據 reviewed plan 生成每頁 HTML
   - 每頁有明確的 spec + constraints

4. Validator AI (1 call)
   - 檢查生成結果
   - 確認：所有連結有效、內容相關、沒有 placeholder
   - 如果不通過 → 標記問題頁面 → 回到 step 3 重新生成

5. Assembler + Post-process
   - fixNavigation
   - designSystemValidator
   - qualityScorer
```

## 優先修復
- [ ] 移除 keyword matching（太危險）
- [ ] AI analysis 必須成功（retry 5 keys）
- [ ] Planner + Reviewer 可以用同一把 key（sequential，不 parallel）
- [ ] Validator 在 assembler 後自動跑
