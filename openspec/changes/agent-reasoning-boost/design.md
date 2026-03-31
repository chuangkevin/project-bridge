## Context

現有 `plannerAgent.ts`：
- 4 個 agent 各一次 `callAIStream` call（Echo PM → Lisa UX → David QA → Bob Tech）
- 每個 agent prompt 是自由文字，只有「控制在 X 行以內」的約束
- 沒有對話歷史、沒有 examples、沒有結構化思考框架
- 最後一次 `callAIJSON` 產出 JSON plan

`planAndReview` 函數簽名：
```typescript
planAndReview(userMessage: string, onThinking: (text: string) => void, skills: Skill[])
```

## Goals / Non-Goals

**Goals:**
- 用 Flash model 達到更好的推理品質（不換 model）
- 每個 agent 的輸出更有結構、更深入
- 第二輪以後的對話有上下文
- 最終 plan 更完整（更少空頁面、更少導航死角）

**Non-Goals:**
- 不升級到 Pro model
- 不增加生成延遲超過 5 秒
- 不改前端 UI（只改 server-side prompt）

## Decisions

### 1. Chain-of-thought prompt 結構

每個 agent 的 prompt 改為三段式：

```
【觀察】列出你從需求和前面討論中看到的關鍵事實（3-5 點）
【分析】基於觀察，推理出結論（你的專業判斷）
【建議】具體的行動建議（頁面/元件/流程）
```

**理由：** 強制 AI 先整理事實再下結論，避免「跳到答案」的表面回答。Flash 在有結構引導時表現大幅提升。

### 2. Few-shot examples

每個 agent 給一個「好的回答範例」和一個「差的回答範例」：

```
❌ 差的回答：「這個系統需要首頁、列表頁和詳情頁。」
✅ 好的回答：「【觀察】用戶要做花店網站，提到展示作品和預約。【分析】核心是展示+轉化...」
```

**理由：** Few-shot 是最有效的 prompt 技巧，Flash 對 examples 反應很好。

### 3. 對話歷史注入

`planAndReview` 新增 `history` 參數，從 chat.ts 傳入最近 5 輪對話。注入到每個 agent prompt 的開頭：

```
【先前對話】
用戶：我想做一個花店網站
助手：已生成原型（5 頁）
用戶：我只有一個元件要重新設計  ← 當前訊息
```

**理由：** 讓 agent 知道「這是第幾次對話」「之前做了什麼」，不會重複生成一樣的東西。

### 4. Echo 確認輪

4 agent 討論完後，Echo (PM) 再看一次所有人的意見：

```
Echo（確認輪）：
你是 Echo，剛聽完所有人的討論。
請做最終確認：
1. 有沒有被遺漏的頁面或功能？
2. 導航流程有沒有死角？
3. 最終頁面清單（確認版）
```

**理由：** 多一輪但品質提升大。Echo 看到完整討論後能補漏。只多 1 次 API call。

### 5. Plan 自我驗證

JSON plan 產出後，用一次 Flash call 驗證：

```
請檢查這個 plan：
- 每個頁面都有 navigateOut 嗎？
- 有沒有頁面沒被任何其他頁面連結到？（孤島頁面）
- 必備功能有沒有對應的頁面？
回傳修正後的 plan JSON。
```

**理由：** 比人工 QA 便宜，一次 Flash call 能抓到最明顯的漏洞。

### 6. 場景模板強化

現有 7 種模板（shopping, travel, education, medical, saas, news, library）只有頁面 spec。加入：
- 每種場景的必備頁面清單
- 每個頁面的必備元件（不能省略）
- 頁面間的標準導航規則
- 常見缺陷提醒

**理由：** 模板越完整，AI 需要「猜」的越少，錯誤率越低。

## Risks / Trade-offs

- **多 2 次 API call（Echo 確認 + plan 自檢）** → 約多 3-4 秒延遲，但 Flash RPD 1500 夠用
- **Prompt 變長** → 每個 agent prompt 從 ~300 tokens 增到 ~500 tokens，仍在 Flash context window 內
- **Few-shot examples 可能讓回答變得太制式** → examples 只給結構框架，不限定具體內容
