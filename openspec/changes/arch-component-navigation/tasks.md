# Tasks: Architecture Component Navigation

## Phase 1: Data Model — ArchComponent type + store expansion

- [x] 1.1 Add `ArchComponent` interface to `useArchStore.ts` with fields: id, name, type, description, constraints, states, navigationTo
- [x] 1.2 Add `components: ArchComponent[]` to `ArchNode` interface (default `[]`)
- [x] 1.3 Update `ArchData` type exports so `ArchComponent` is importable
- [x] 1.4 Update `toRfNodes` in `ArchFlowchart.tsx` to pass `components` through node data
- [x] 1.5 Update `saveChanges` in `ArchFlowchart.tsx` to persist `components` when mapping nodes back to `ArchNode`
- [x] 1.6 Ensure backward compat: loading arch_data without `components` field defaults to `[]`
- [x] 1.7 Test: Playwright test — create a project, PATCH arch_data with components via API, GET it back, verify components array roundtrips
- [x] 1.8 Commit: "feat: add ArchComponent data model to useArchStore"

## Phase 2: Component Editor Modal

- [x] 2.1 Create `ComponentEditorModal.tsx` — modal overlay with form: name (text input), type (select dropdown with 7 options), description (textarea)
- [x] 2.2 Add constraints section in modal — conditionally shown when type is `input`; sub-fields: type (number/text/email select), min (number input), max (number input), pattern (text input), required (checkbox)
- [x] 2.3 Add navigationTo field — conditionally shown when type is button/card/link; select dropdown listing all page names from archData + a "無" null option
- [x] 2.4 Add states section — conditionally shown when type is select/radio/tab; repeatable rows with value (text input) + targetPage (page select); add/remove row buttons
- [x] 2.5 Implement save handler: generate `comp-${Date.now()}` id for new components, update node's components array, call `patchArchData`
- [x] 2.6 Implement edit mode: pre-populate fields when editing existing component
- [x] 2.7 Add cancel button that discards changes and closes modal
- [x] 2.8 Add CSS styles for modal in `ArchFlowchart.css` — consistent with existing paste modal styling
- [x] 2.9 Test: Playwright test — open modal, fill all fields for each component type, save, verify data persists
- [x] 2.10 Commit: "feat: add ComponentEditorModal with constraints and states"

## Phase 3: Expandable Component List on ArchPageNode

- [x] 3.1 Add collapsible "元件 (N)" section header to `ArchPageNode.tsx` below existing body content
- [x] 3.2 Render compact component list when expanded: type badge + name per row; clicking row opens ComponentEditorModal in edit mode
- [x] 3.3 Add delete button (x) per component row with confirmation prompt
- [x] 3.4 Add "+ 新增元件" button at bottom of expanded list that opens ComponentEditorModal in create mode
- [x] 3.5 Show navigation indicator (→ targetPage) for components with `navigationTo`
- [x] 3.6 Show state count badge ("N 個狀態") for components with states
- [x] 3.7 Wire callbacks through ArchFlowchart node data: `onComponentAdd`, `onComponentEdit`, `onComponentDelete`
- [x] 3.8 Add CSS styles for component list rows, badges, expand/collapse toggle
- [x] 3.9 Increase ArchPageNode width from 180px to accommodate component list (or use auto-width with min/max)
- [x] 3.10 Test: Playwright test — add page, expand component section, add/edit/delete components, verify UI updates
- [x] 3.11 Commit: "feat: add expandable component list to ArchPageNode"

## Phase 4: Server — architectureBlock Prompt Upgrade

- [x] 4.1 In `chat.ts`, refactor the `architectureBlock` construction for `archData.type === 'page'` branch
- [x] 4.2 For each page with non-empty `components` array, emit "Page <name> components:" section with per-component lines
- [x] 4.3 Format button/card/link components: `- name [type]: description → showPage('targetPage')`
- [x] 4.4 Format select/radio/tab components with states subsection: each state on its own line with `→ showPage('targetPage')`
- [x] 4.5 Format input components with constraints: `- name [input]: description (type: X, min: Y, max: Z)`
- [x] 4.6 In navigation requirements section, emit per-component navigation instructions for pages with components
- [x] 4.7 Fallback: pages without components continue using existing edge-based format
- [x] 4.8 Ensure mixed mode works: some pages with components, some without, in the same architecture
- [x] 4.9 Test: Playwright test — create project with arch_data containing components, trigger generation, verify the prompt sent to AI contains component-level navigation instructions (inspect via API or log)
- [x] 4.10 Commit: "feat: upgrade architectureBlock to component-level navigation prompt"

## Phase 5: Integration Test + Polish

- [x] 5.1 Full E2E scenario: create project → add pages → expand page → add button component with navigationTo → add tab component with 3 states → save → verify arch_data persists correctly via API
- [x] 5.2 Test backward compat: load existing project with old arch_data (no components) → verify flowchart renders normally, no errors
- [x] 5.3 Test prompt output: create arch with mixed pages (some with components, some without) → trigger chat generation → verify architectureBlock contains component instructions for component pages and edge-based instructions for plain pages
- [x] 5.4 Test component editor all types: create one component of each type (button, input, select, radio, tab, card, link) → verify type-specific fields show/hide correctly
- [x] 5.5 Test state management: add tab with 3 states, save, reload page, verify states persist
- [x] 5.6 Commit: "test: validate full component navigation pipeline + backward compat"
