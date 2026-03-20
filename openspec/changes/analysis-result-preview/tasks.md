## 1. Core Panel Component

- [ ] 1.1 Create `AnalysisPreviewPanel.tsx` with slide-out drawer layout, accepting `analysisResult: DocumentAnalysisResult | null` and `isOpen: boolean` props
- [ ] 1.2 Render document type badge, summary text, and collapsible page sections (name, viewport, component count)
- [ ] 1.3 Inside each page section, render component list, business rules, interactions, data fields, and navigationTo targets
- [ ] 1.4 Render global rules section
- [ ] 1.5 Add CSS styles for the panel (drawer animation, collapsible sections, badges)
- [ ] 1.6 Write Playwright test: mock analysis data, open panel, verify all sections render correctly
- [ ] 1.7 Commit: "feat: add AnalysisPreviewPanel component with structured analysis display"

## 2. Skills Output Display

- [ ] 2.1 Add Explore section rendering (domain, user types, edge cases, flow summary)
- [ ] 2.2 Add UX Review section rendering (overall score, issues list with severity)
- [ ] 2.3 Add Design Proposal section rendering (design direction, color suggestions, typography)
- [ ] 2.4 Handle missing skills fields gracefully (conditional rendering)
- [ ] 2.5 Write Playwright test: verify skills sections appear when data present, hidden when absent
- [ ] 2.6 Commit: "feat: display skills output (explore, UX review, design proposal) in analysis preview"

## 3. Navigation Flow Diagram

- [ ] 3.1 Build text-based navigation diagram from `pages[].navigationTo` arrays, grouped by source page with arrow notation
- [ ] 3.2 Render diagram in a styled code-block section of the panel
- [ ] 3.3 Write Playwright test: verify navigation diagram text matches expected flow arrows
- [ ] 3.4 Commit: "feat: add text-based navigation flow diagram to analysis preview"

## 4. Entry Points (File Chip + Toggle)

- [ ] 4.1 Add click handler to file chips in upload area that fetches analysis-status and opens AnalysisPreviewPanel with the result
- [ ] 4.2 Show "Analysis in progress..." with spinner when status is 'running'
- [ ] 4.3 Add a toolbar toggle button for opening the panel with the most recent analysis, including file selector for multiple files
- [ ] 4.4 Write Playwright test: upload a file, wait for analysis, click file chip, verify panel opens with correct data
- [ ] 4.5 Commit: "feat: add file chip click and toggle entry points for analysis preview panel"

## 5. Inline Editing

- [ ] 5.1 Make page names editable (click-to-edit input field) with local state tracking
- [ ] 5.2 Add remove buttons for components in the component list, updating local state
- [ ] 5.3 Add ability to modify navigationTo targets (add/remove target page names)
- [ ] 5.4 Add visual indicator that edits are session-only (info banner)
- [ ] 5.5 Write Playwright test: edit a page name, remove a component, verify changes reflected in panel
- [ ] 5.6 Commit: "feat: add inline editing for page names, components, and navigation in analysis preview"
