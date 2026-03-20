# Spec: arch-component-navigation

## Summary

Components of type button, card, or link can specify a `navigationTo` target page. This replaces (or supplements) page-level edges with explicit component-to-page navigation, so the AI knows exactly which UI element triggers which page transition.

## Data

### ArchComponent.navigationTo

```ts
navigationTo: string | null;  // target page name (e.g. "搜尋結果頁")
```

- Only meaningful for types: `button`, `card`, `link`.
- Stores the **page name** (not page ID) for readability in prompts.
- `null` means no navigation (e.g. a submit button that stays on the same page).

## UI Behavior

### Component Editor — navigationTo field

- Shown only when `type` is `button`, `card`, or `link`.
- Rendered as a select dropdown labeled "導航目標".
- Options: all page names from `archData.nodes.filter(n => n.nodeType === 'page').map(n => n.name)`, plus a blank/null option ("無").
- Changing the value updates `component.navigationTo` and saves.

### Visual Indicator in Component List

- Components with a non-null `navigationTo` show a small right-arrow icon (`→ 目標頁`) next to their name in the collapsed component list row.

### Relationship to Page-Level Edges

- Component-level navigation does NOT create or remove ReactFlow edges. Edges and component navigation coexist.
- When generating the prompt, component-level navigation takes priority for pages that have components defined. Pages without components still use edge-based navigation.

## Files Affected

- `packages/client/src/components/ComponentEditorModal.tsx` — add navigationTo field
- `packages/client/src/components/ArchPageNode.tsx` — show navigation indicator
- `packages/server/src/routes/chat.ts` — include `navigationTo` in architectureBlock output
