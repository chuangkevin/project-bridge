# Spec: arch-component-list

## Summary

Each page node in the architecture flowchart gains an expandable component list. Components can be auto-imported from `analysis_result` or manually added. Each component has a name, type, description, and constraints.

## Data

### ArchComponent type

```ts
interface ArchComponent {
  id: string;                    // unique ID, e.g. `comp-${Date.now()}`
  name: string;                  // e.g. "搜尋按鈕"
  type: 'button' | 'input' | 'select' | 'radio' | 'tab' | 'card' | 'link';
  description: string;           // free-form
  constraints: {
    type?: string | null;        // "number", "email", "text"
    min?: number | null;
    max?: number | null;
    pattern?: string | null;
    required?: boolean;
  };
  states: Array<{ value: string; targetPage: string }>;
  navigationTo: string | null;
}
```

### ArchNode.components

`ArchNode` gains a `components: ArchComponent[]` field. Default `[]` for backward compat.

## UI Behavior

### Expandable section on ArchPageNode

- Below existing body content, render a collapsible header: `"元件 (N)"` where N = `components.length`.
- Default state: collapsed if 0 components, expanded if >= 1.
- Expanded view shows a compact vertical list of components.
- Each row: type icon/badge + component name. Clicking opens edit modal. Small `x` button to delete.
- Bottom of list: `"+ 新增元件"` button opens Component Editor with empty fields.

### Component Editor Modal

- Modal overlay with form fields: name (text, required), type (select), description (textarea).
- Constraints section: shown only when `type === 'input'`. Fields: type select (number/text/email), min (number), max (number), pattern (text), required (checkbox).
- On save: generates `id` if new, updates `archData.nodes[pageIndex].components` array, calls `patchArchData`.
- On cancel: discards changes, closes modal.

### Deletion

- Clicking the `x` on a component row shows a confirm prompt, then removes from the array and saves.

### Auto-import from analysis_result

- If the page node has a `referenceFileId` and the associated `uploaded_files` row has `analysis_result` with component data, show a "從分析結果載入" button in the expanded section.
- Clicking it fetches the analysis result, parses component names/types, and pre-populates the component list (user can still edit).
- This is a convenience feature; components can always be added manually.

## Backward Compatibility

- Existing arch_data without `components` renders as before (empty component list, collapsed).
- No DB migration required.

## Files Affected

- `packages/client/src/stores/useArchStore.ts` — add `ArchComponent` interface, add `components` to `ArchNode`
- `packages/client/src/components/ArchPageNode.tsx` — add expandable component section
- `packages/client/src/components/ComponentEditorModal.tsx` — new file, modal form
- `packages/client/src/components/ArchFlowchart.tsx` — pass component callbacks through node data
- `packages/client/src/components/ArchFlowchart.css` — styles for component list and modal
