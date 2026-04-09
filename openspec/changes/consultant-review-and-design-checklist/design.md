## Context

顧問模式原本只有一個泛用 prompt，容易把「需求審查」回答成「產品顧問建議」。
設計模式雖然會顯示 thinking 與 phase，但缺少對外可見的 checklist，使用者難以判斷系統是否真的完成需求確認、規則檢查與驗證。

## Decisions

### 1. Raw-text-first review

文件審查先讀原始 `extracted_text`，`analysis_result` 只當次要上下文。

理由：避免先前的 lossy summary 在第二輪分析中繼續污染結果。

### 2. Consultant sub-modes

顧問模式不是單一人格，而是依任務切換：
- `spec-review`: 保留 contract，先 diff 再結論
- `architecture-review`: 先事實，再假設，再建議
- `ux-review`: 先問題，再改善
- `general`: 一般顧問回答

理由：不同任務需要不同輸出結構，否則容易混成散文式回答。

### 3. Visible checklist in design mode

規劃完成後，server 送出 checklist SSE event，client 直接渲染在生成進度區。

Checklist 至少包含：
- 確認需求與文件範圍
- 規劃頁面與流程
- 檢查技能與業務規則衝突
- 逐頁生成
- 驗證導航與內容完整性

理由：讓使用者看到系統目前做到哪裡，且 checklist 項目可對應真實後端步驟，而非空泛的 loading 狀態。
