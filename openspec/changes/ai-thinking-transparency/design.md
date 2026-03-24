## Context

目前的生成流程：使用者送訊息 → SSE 串流 HTML tokens → 完成。等待過程中前端顯示一個簡單的 phase stepper（thinking → writing → finalizing），但沒有實際的 AI 思考內容。

Gemini 2.5 Flash 支援 `thinkingConfig`，可在 `generateContentStream` 回傳中區分 `thought` 和 `text` parts。目前 `chat.ts` 已有 SSE 基礎設施（`phase`、`content`、`done` 事件）和前端 stepper UI。

現有 SSE 事件類型：
- `{ content: string }` — HTML token 串流
- `{ phase: string, message: string }` — 階段通知（parallel generation 使用）
- `{ done: true, html, ... }` — 完成
- `{ error: string }` — 錯誤

前端已有 `generationPhase` state 和 3-step stepper UI（thinking/writing/finalizing）。

## Goals / Non-Goals

**Goals:**
- 啟用 Gemini thinking mode，將 AI 思考過程串流到前端
- 前端顯示即時思考內容（類似 Figma AI 的 Reasoning 區塊）
- 生成階段更細緻：分析需求 → 規劃結構 → 生成程式碼 → 完成
- 思考內容可收合/展開，不干擾主要生成結果

**Non-Goals:**
- 不改變 Gemini prompt 內容或生成品質
- 不支援 thinking 內容的持久化儲存（僅即時顯示）
- 不改變 parallel generation pipeline（僅影響 single-call path）

## Decisions

### 1. Gemini Thinking Config

使用 `thinkingConfig: { thinkingBudget: 2048 }` 啟用 thinking mode。Gemini 2.5 Flash 在 `generateContentStream` 回傳的 chunk 中，`candidate.content.parts` 會包含 `thought: true` 的 part（thinking token）和普通 text part（輸出 token）。

```typescript
const model = genAI.getGenerativeModel({
  model: geminiModel,
  generationConfig: { ... },
  thinkingConfig: { thinkingBudget: 2048 },
});
```

**替代方案**: 不用 thinking mode，改用自定義 prompt 要求 AI 先輸出 `<thinking>` block。
**為什麼選 thinking mode**: 原生支援，不佔用 output token quota，且 Gemini 的 thinking 品質更好。

### 2. SSE 事件擴充

新增兩種 SSE 事件類型：

```typescript
// AI 思考內容（串流）
{ type: 'thinking', content: '分析使用者需求：需要一個講座報名頁面...' }

// 階段變更
{ type: 'phase', phase: 'analyzing' | 'planning' | 'generating' | 'done', message: string }
```

現有 `{ content }` 事件保持不變（HTML token 串流）。前端透過 `type` 欄位區分事件。

**向後相容**: 沒有 `type` 欄位的事件（現有格式）視為 `content` 類型。

### 3. 前端 Thinking Panel

在生成進度區域（現有 stepper 位置）新增可收合的 thinking 面板：

```
┌─────────────────────────────────┐
│ 🧠 AI 正在思考...        [收合 ▲] │
│ ─────────────────────────────── │
│ 分析使用者需求：需要一個講座報名    │
│ 頁面，包含標題、講師介紹、課程     │
│ 大綱、報名表單...                 │
│                                 │
│ 規劃頁面結構：                    │
│ 1. Hero section with title      │
│ 2. Speaker bio section          │
│ 3. Course outline               │
│ ...                             │
├─────────────────────────────────┤
│ ● 分析需求  ● 規劃結構  ○ 生成中  │
└─────────────────────────────────┘
```

- 思考內容自動捲動到最新
- 生成階段從 3 步改為 4 步：分析需求 → 規劃結構 → 生成程式碼 → 完成
- 思考面板在生成完成後自動收合

### 4. Phase Detection

透過解析 Gemini 回傳的 token 類型來判斷階段：
- **analyzing**: 第一個 thinking token 出現時
- **planning**: `analyzePageStructure` 執行時（已有 phase 事件）
- **generating**: 第一個非-thinking token（HTML output）出現時
- **done**: `done` 事件

## Risks / Trade-offs

- **[延遲增加]** Thinking mode 可能增加 first token latency 1-3 秒 → 可接受，因為使用者看到思考內容就不覺得在等
- **[Token 成本]** Thinking tokens 算入輸入 token 計費 → thinking budget 限制在 2048 tokens，成本可控
- **[Gemini API 版本相容]** 舊版 Gemini 不支援 thinkingConfig → 用 try/catch，fallback 到無 thinking 模式
- **[thinking 內容品質]** 思考內容可能包含英文或不相關的推理步驟 → 可接受，使用者主要看的是「AI 有在動」的感覺
