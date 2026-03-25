# Tasks: parallel-agent-v2

## 1. Server — 砍掉多餘 API calls

- [ ] 1.1 Remove analysis reasoning call (the streaming thinking call) — replace with local thinking text based on keyword detection
- [ ] 1.2 Remove analyzePageStructure call — keyword page templates already handle this
- [ ] 1.3 Remove confirm dialog logic (already done in previous commit)
- [ ] 1.4 Make isObviousGenerate smarter — use AI classifyIntent result, not regex

## 2. Server — Key Dispatch

- [ ] 2.1 Add `assignBatchKeys(count: number): string[]` to geminiKeys.ts — returns N unique available keys
- [ ] 2.2 Update parallelGenerator to use assignBatchKeys instead of per-iteration getGeminiApiKey
- [ ] 2.3 Each sub-agent gets its own dedicated key — no key sharing within a batch

## 3. Server — Force Parallel Path

- [ ] 3.1 In chat.ts: when isMultiPage, ALWAYS use parallel path (no single-call fallback for multi-page)
- [ ] 3.2 parallelGenerator: ALWAYS use buildLocalPlan (skip master agent AI call entirely)
- [ ] 3.3 If sub-agent fails, retry with different key (already implemented) — but limit to 2 retries per page
- [ ] 3.4 If >50% of pages fail after retries, THEN fallback to single-call (last resort)

## 4. Server — Per-Page Streaming

- [ ] 4.1 Emit `{ type: 'page-start', page: name }` when each sub-agent starts
- [ ] 4.2 Emit `{ type: 'page-done', page: name }` when each sub-agent completes
- [ ] 4.3 Emit `{ type: 'page-error', page: name, retrying: true }` on failure with retry
- [ ] 4.4 Emit `{ type: 'phase', phase: 'assembling' }` before assembly

## 5. Client — Per-Page Progress UI

- [ ] 5.1 Replace single stepper with per-page progress list in ChatPanel
- [ ] 5.2 Each page shows: ⏳ → 🔄 → ✅ / ❌ with page name
- [ ] 5.3 Show "X/Y 頁面完成" counter
- [ ] 5.4 Optionally: show partial preview when first page completes (stretch goal)

## 6. Server — buildLocalPlan Enhancement

- [ ] 6.1 Add more page templates: 旅遊, 教育, 醫療, 預約, 新聞, SaaS, portfolio
- [ ] 6.2 Each template has detailed page specs (layout, components, data, interactions) — not generic placeholders
- [ ] 6.3 Page specs include explicit `onclick="showPage('target')"` instructions for sub-agents
- [ ] 6.4 sharedCss includes all HousePrice design tokens + full component library

## 7. Testing

- [ ] 7.1 E2E: "我要一個購物網站" → 5 pages, all with real content, navigation works
- [ ] 7.2 E2E: "我要一個旅遊網站" → 5 pages, correct travel-related content
- [ ] 7.3 E2E: "設計一個後台管理系統" → 4 pages, dashboard layout
- [ ] 7.4 Performance: generation time < 60 seconds for 5 pages
- [ ] 7.5 Stress: 3 concurrent generations don't 429
