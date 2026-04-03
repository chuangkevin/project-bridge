## ADDED Requirements

### Requirement: Code view tab in workspace
The workspace SHALL provide a Code tab alongside Preview, allowing users to switch between visual preview and source code view.

#### Scenario: Switch to code view
- **WHEN** user clicks the "Code" tab button (or `</>` icon)
- **THEN** the preview iframe SHALL be replaced by a syntax-highlighted code panel showing the full generated HTML

#### Scenario: Switch back to preview
- **WHEN** user clicks the "Preview" tab button (or eye icon)
- **THEN** the code panel SHALL be replaced by the iframe preview

### Requirement: Syntax highlighted HTML display
The code panel SHALL display the generated HTML with syntax highlighting for HTML tags, attributes, CSS properties, and JavaScript keywords.

#### Scenario: HTML syntax highlighting
- **WHEN** code view is active
- **THEN** HTML tags SHALL be colored distinctly from attributes, string values, and text content

#### Scenario: Line numbers displayed
- **WHEN** code view is active
- **THEN** each line of code SHALL have a line number in a gutter column

### Requirement: One-click code copy
The code panel SHALL provide a copy button that copies the full HTML source to clipboard.

#### Scenario: Copy full code
- **WHEN** user clicks the copy button in code view
- **THEN** the complete HTML source code SHALL be copied to the system clipboard
- **AND** a brief "已複製" toast notification SHALL appear

#### Scenario: Copy per-page code (multi-page)
- **WHEN** user clicks copy while a specific page is selected in a multi-page project
- **THEN** only the selected page's HTML section SHALL be copied

### Requirement: Code search
The code panel SHALL support text search within the displayed code.

#### Scenario: Search for text
- **WHEN** user presses Ctrl+F (or Cmd+F) while code view is focused
- **THEN** a search bar SHALL appear at the top of the code panel
- **AND** matching text SHALL be highlighted in the code

### Requirement: Multi-page code navigation
For multi-page prototypes, the code view SHALL allow switching between pages, scrolling to the corresponding code section.

#### Scenario: Page tab switches code section
- **WHEN** user clicks a page tab in the code view (same tabs as preview)
- **THEN** the code panel SHALL scroll to the `<!-- PAGE: name -->` marker for that page
- **AND** the page section SHALL be visually highlighted
