# Spec: arch-generation-prompt-upgrade

## Summary

Upgrade the `architectureBlock` string in `chat.ts` from page-level navigation (`Page A -> Page B`) to component-level navigation instructions with state switching. This gives the AI precise knowledge of which UI element triggers which navigation.

## Current Behavior (chat.ts lines ~548-613)

For page-type architecture, the prompt currently generates:

```
=== APP ARCHITECTURE ===
Type: 多頁面網站
Pages: 首頁, 搜尋結果頁
Navigation edges:
  首頁 → 搜尋結果頁
Page navigation requirements:
- Page "首頁": clickable elements MUST call showPage('搜尋結果頁')
```

## New Behavior

### When page has components

For each page that has a non-empty `components` array, generate component-level instructions:

```
Page "首頁" components:
  - 搜尋按鈕 [button]: 點擊搜尋物件 → showPage('搜尋結果頁')
  - 類型切換 [tab]: 切換買屋/租屋/社區
    States:
      "買屋" → showPage('買屋列表')
      "租屋" → showPage('租屋列表')
      "社區" → showPage('社區列表')
  - 坪數輸入 [input]: 坪數欄位 (type: number, min: 0, max: 10000)
```

And in the navigation requirements section:

```
Page navigation requirements:
- Page "首頁":
  - "搜尋按鈕" (button): onClick → showPage('搜尋結果頁')
  - "類型切換" (tab): stateful — "買屋" → showPage('買屋列表'), "租屋" → showPage('租屋列表'), "社區" → showPage('社區列表')
```

### When page has NO components (fallback)

Fall back to existing edge-based format:

```
- Page "首頁": clickable elements MUST call showPage('搜尋結果頁')
```

### Constraint formatting

For `input` type components with constraints, append constraint info:

```
- 坪數輸入 [input]: 坪數欄位 (type: number, min: 0, max: 10000)
```

Format: `(key: value, key: value, ...)` for all non-null constraint fields.

### Mixed mode

A single architecture can have some pages with components and some without. Each page uses its own format independently.

## Implementation Location

`packages/server/src/routes/chat.ts` — the `architectureBlock` construction block starting around line 548. Specifically the `else if (archData.type === 'page')` branch.

### Algorithm

```
for each page node:
  if node.components?.length > 0:
    emit "Page <name> components:" section
    for each component:
      emit "- <name> [<type>]: <description>"
      if component.navigationTo:
        append " → showPage('<navigationTo>')"
      if component.states.length > 0:
        emit "  States:" subsection
        for each state:
          emit '    "<value>" → showPage("<targetPage>")'
      if component.type === 'input' and has constraints:
        append constraint summary

    in navigation requirements section:
      for each component with navigationTo or states:
        emit navigation instruction line
  else:
    use existing edge-based navigation format for this page
```

## Files Affected

- `packages/server/src/routes/chat.ts` — rewrite architectureBlock generation logic
