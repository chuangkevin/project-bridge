# Spec: arch-state-switching

## Summary

Components of type select, radio, or tab can define multiple states, where each state maps to a target page or section. This enables the architecture to express behaviors like "Tab with options buy/rent/community, each leading to a different page."

## Data

### ArchComponent.states

```ts
states: Array<{
  value: string;       // e.g. "買屋", "租屋", "社區"
  targetPage: string;  // target page name, e.g. "買屋列表"
}>;
```

- Only meaningful for types: `select`, `radio`, `tab`.
- Each entry maps one option value to a target page.
- Empty array means no stateful navigation defined.

## UI Behavior

### Component Editor — states section

- Shown only when `type` is `select`, `radio`, or `tab`.
- Rendered as a repeatable row group labeled "狀態列表".
- Each row has:
  - Text input for `value` (the option label, e.g. "買屋").
  - Select dropdown for `targetPage` (all page names from archData, plus blank).
- "新增狀態" button adds a new empty row.
- Each row has a delete button to remove that state entry.
- Minimum 0 rows; no maximum enforced.

### Visual Indicator in Component List

- Components with states show a badge: `"N 個狀態"` (e.g. "3 個狀態") next to their name.

### Validation

- On save, remove any state rows where `value` is empty.
- Duplicate `value` entries are allowed (user's responsibility) but a warning could be shown.

## Prompt Generation

When a component has states, the architectureBlock in chat.ts outputs:

```
- 類型切換 [tab]: 切換買屋/租屋/社區
  States:
    "買屋" → showPage('買屋列表')
    "租屋" → showPage('租屋列表')
    "社區" → showPage('社區列表')
```

This tells the AI to generate actual onclick/onchange handlers that call `showPage()` for the appropriate target.

## Files Affected

- `packages/client/src/components/ComponentEditorModal.tsx` — add states section
- `packages/client/src/components/ArchPageNode.tsx` — show state count badge
- `packages/server/src/routes/chat.ts` — include states in architectureBlock output
