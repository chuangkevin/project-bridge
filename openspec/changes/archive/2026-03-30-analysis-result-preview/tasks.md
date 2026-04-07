## 1. Core Panel Component

- [x] 1.1 Create `AnalysisPreviewPanel.tsx` with slide-out drawer layout, accepting `analysisResult: DocumentAnalysisResult | null` and `isOpen: boolean` props
- [x] 1.2 Render document type badge, summary text, and collapsible page sections (name, viewport, component count)
- [x] 1.3 Inside each page section, render component list, business rules, interactions, data fields, and navigationTo targets
- [x] 1.4 Render global rules section
- [x] 1.5 Add CSS styles for the panel (drawer animation, collapsible sections, badges)
- [x] 1.6 Write Playwright test: mock analysis data, open panel, verify all sections render correctly
- [x] 1.7 Commit: "feat: add AnalysisPreviewPanel component with structured analysis display"

## 2. Skills Output Display

- [x] 2.1 Add Explore section rendering (domain, user types, edge cases, flow summary)
- [x] 2.2 Add UX Review section rendering (overall score, issues list with severity)
- [x] 2.3 Add Design Proposal section rendering (design direction, color suggestions, typography)
- [x] 2.4 Handle missing skills fields gracefully (conditional rendering)
- [x] 2.5 Write Playwright test: verify skills sections appear when data present, hidden when absent
- [x] 2.6 Commit: "feat: display skills output (explore, UX review, design proposal) in analysis preview"

## 3. Navigation Flow Diagram

- [x] 3.1 Build text-based navigation diagram from `pages[].navigationTo` arrays, grouped by source page with arrow notation
- [x] 3.2 Render diagram in a styled code-block section of the panel
- [x] 3.3 Write Playwright test: verify navigation diagram text matches expected flow arrows
- [x] 3.4 Commit: "feat: add text-based navigation flow diagram to analysis preview"

## 4. Entry Points (File Chip + Toggle)

- [x] 4.1 Add click handler to file chips in upload area that fetches analysis-status and opens AnalysisPreviewPanel with the result
- [x] 4.2 Show "Analysis in progress..." with spinner when status is 'running'
- [x] 4.3 Add a toolbar toggle button for opening the panel with the most recent analysis, including file selector for multiple files
- [x] 4.4 Write Playwright test: upload a file, wait for analysis, click file chip, verify panel opens with correct data
- [x] 4.5 Commit: "feat: add file chip click and toggle entry points for analysis preview panel"

## 5. Inline Editing

- [x] 5.1 Make page names editable (click-to-edit input field) with local state tracking
- [x] 5.2 Add remove buttons for components in the component list, updating local state
- [x] 5.3 Add ability to modify navigationTo targets (add/remove target page names)
- [x] 5.4 Add visual indicator that edits are session-only (info banner)
- [x] 5.5 Write Playwright test: edit a page name, remove a component, verify changes reflected in panel
- [x] 5.6 Commit: "feat: add inline editing for page names, components, and navigation in analysis preview"
