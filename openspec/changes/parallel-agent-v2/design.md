## Architecture

### 現在的 Pipeline（問題）
```
User Message
  → classifyIntent (AI call #1)
  → analyzePageStructure (AI call #2) — 常 429
  → Analysis reasoning (AI call #3) — 常 429
  → Master Agent plan (AI call #4) — 常 429
  → Sub-Agent × N (AI call #5-9) — key pool 已耗盡
  → Summary (AI call #10) — 常 429
  → Quality Score (AI call #11) — 常 429
Total: 7-11 API calls per generation
```

### 新的 Pipeline（目標）
```
User Message
  → classifyIntent (AI call #1 — 保留，token 很少)
  → keyword page detection (NO API call — instant)
  → buildLocalPlan (NO API call — instant)
  → Sub-Agent × 5 (AI call #2-6 — 5 把不同 key 並行)
  → Assembler (NO API call — instant)
  → Local summary (NO API call — instant)
  → Quality Score (background, non-blocking)
Total: 6 API calls, 5 of which are parallel
```

### Key Dispatch Strategy
```typescript
// Assign unique keys to each sub-agent batch
function assignKeys(count: number): string[] {
  const available = getAvailableKeys();
  const assigned: string[] = [];
  for (let i = 0; i < count; i++) {
    // Round-robin through available keys, skip already assigned
    const key = available.find(k => !assigned.includes(k)) || available[i % available.length];
    assigned.push(key);
  }
  return assigned;
}
```

### Per-Page Streaming
```
SSE Event Flow:
  { type: 'phase', phase: 'planning' }        — instant (local plan)
  { type: 'page-start', page: '首頁' }         — sub-agent starts
  { type: 'page-start', page: '商品列表' }      — parallel
  { type: 'page-done', page: '首頁' }          — first page done
  { type: 'page-start', page: '商品詳情' }      — next batch
  { type: 'page-done', page: '商品列表' }
  { type: 'page-done', page: '商品詳情' }
  ...
  { type: 'phase', phase: 'assembling' }
  { type: 'phase', phase: 'done' }
  { done: true, html: '...', pages: [...] }
```

### Client UI
- Stepper 改成 per-page progress bar
- 每個 page 顯示：⏳ pending → 🔄 generating → ✅ done → ❌ error (retry)
- 頁面完成時可以先 preview（不等全部完成）

## Files to Change

| File | Change |
|------|--------|
| `chat.ts` | 砍掉 analysis/pageStructure/confirm calls；always parallel for multi-page |
| `parallelGenerator.ts` | 強制 buildLocalPlan；batch key assignment；per-page SSE events |
| `geminiKeys.ts` | `assignBatchKeys(count)` function |
| `ChatPanel.tsx` | Per-page progress UI instead of single stepper |
| `masterAgent.ts` | buildLocalPlan 增加更多模板（旅遊/教育/醫療/etc） |
