# Tasks: Architecture Component Navigation

## Phase 1: Data Model — ArchComponent type + store expansion

- [ ] 1.1 Add `ArchComponent` interface to `useArchStore.ts` with fields: id, name, type, description, constraints, states, navigationTo
- [ ] 1.2 Add `components: ArchComponent[]` to `ArchNode` interface (default `[]`)
- [ ] 1.3 Update `ArchData` type exports so `ArchComponent` is importable
- [ ] 1.4 Update `toRfNodes` in `ArchFlowchart.tsx` to pass `components` through node data
- [ ] 1.5 Update `saveChanges` in `ArchFlowchart.tsx` to persist `components` when mapping nodes back to `ArchNode`
- [ ] 1.6 Ensure backward compat: loading arch_data without `components` field defaults to `[]`
- [ ] 1.7 Test: Playwright test — create a project, PATCH arch_data with components via API, GET it back, verify components array roundtrips
- [ ] 1.8 Commit: "feat: add ArchComponent data model to useArchStore"

## Phase 2: Component Editor Modal

- [ ] 2.1 Create `ComponentEditorModal.tsx` — modal overlay with form: name (text input), type (select dropdown with 7 options), description (textarea)
- [ ] 2.2 Add constraints section in modal — conditionally shown when type is `input`; sub-fields: type (number/text/email select), min (number input), max (number input), pattern (text input), required (checkbox)
- [ ] 2.3 Add navigationTo field — conditionally shown when type is button/card/link; select dropdown listing all page names from archData + a "無" null option
- [ ] 2.4 Add states section — conditionally shown when type is select/radio/tab; repeatable rows with value (text input) + targetPage (page select); add/remove row buttons
- [ ] 2.5 Implement save handler: generate `comp-${Date.now()}` id for new components, update node's components array, call `patchArchData`
- [ ] 2.6 Implement edit mode: pre-populate fields when editing existing component
- [ ] 2.7 Add cancel button that discards changes and closes modal
- [ ] 2.8 Add CSS styles for modal in `ArchFlowchart.css` — consistent with existing paste modal styling
- [ ] 2.9 Test: Playwright test — open modal, fill all fields for each component type, save, verify data persists
- [ ] 2.10 Commit: "feat: add ComponentEditorModal with constraints and states"

## Phase 3: Expandable Component List on ArchPageNode

- [ ] 3.1 Add collapsible "元件 (N)" section header to `ArchPageNode.tsx` below existing body content
- [ ] 3.2 Render compact component list when expanded: type badge + name per row; clicking row opens ComponentEditorModal in edit mode
- [ ] 3.3 Add delete button (x) per component row with confirmation prompt
- [ ] 3.4 Add "+ 新增元件" button at bottom of expanded list that opens ComponentEditorModal in create mode
- [ ] 3.5 Show navigation indicator (→ targetPage) for components with `navigationTo`
- [ ] 3.6 Show state count badge ("N 個狀態") for components with states
- [ ] 3.7 Wire callbacks through ArchFlowchart node data: `onComponentAdd`, `onComponentEdit`, `onComponentDelete`
- [ ] 3.8 Add CSS styles for component list rows, badges, expand/collapse toggle
- [ ] 3.9 Increase ArchPageNode width from 180px to accommodate component list (or use auto-width with min/max)
- [ ] 3.10 Test: Playwright test — add page, expand component section, add/edit/delete components, verify UI updates
- [ ] 3.11 Commit: "feat: add expandable component list to ArchPageNode"

## Phase 4: Server — architectureBlock Prompt Upgrade

- [ ] 4.1 In `chat.ts`, refactor the `architectureBlock` construction for `archData.type === 'page'` branch
- [ ] 4.2 For each page with non-empty `components` array, emit "Page <name> components:" section with per-component lines
- [ ] 4.3 Format button/card/link components: `- name [type]: description → showPage('targetPage')`
- [ ] 4.4 Format select/radio/tab components with states subsection: each state on its own line with `→ showPage('targetPage')`
- [ ] 4.5 Format input components with constraints: `- name [input]: description (type: X, min: Y, max: Z)`
- [ ] 4.6 In navigation requirements section, emit per-component navigation instructions for pages with components
- [ ] 4.7 Fallback: pages without components continue using existing edge-based format
- [ ] 4.8 Ensure mixed mode works: some pages with components, some without, in the same architecture
- [ ] 4.9 Test: Playwright test — create project with arch_data containing components, trigger generation, verify the prompt sent to AI contains component-level navigation instructions (inspect via API or log)
- [ ] 4.10 Commit: "feat: upgrade architectureBlock to component-level navigation prompt"

## Phase 5: Integration Test + Polish

- [ ] 5.1 Full E2E scenario: create project → add pages → expand page → add button component with navigationTo → add tab component with 3 states → save → verify arch_data persists correctly via API
- [ ] 5.2 Test backward compat: load existing project with old arch_data (no components) → verify flowchart renders normally, no errors
- [ ] 5.3 Test prompt output: create arch with mixed pages (some with components, some without) → trigger chat generation → verify architectureBlock contains component instructions for component pages and edge-based instructions for plain pages
- [ ] 5.4 Test component editor all types: create one component of each type (button, input, select, radio, tab, card, link) → verify type-specific fields show/hide correctly
- [ ] 5.5 Test state management: add tab with 3 states, save, reload page, verify states persist
- [ ] 5.6 Commit: "test: validate full component navigation pipeline + backward compat"
