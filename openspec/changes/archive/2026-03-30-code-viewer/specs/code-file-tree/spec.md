## ADDED Requirements

### Requirement: File tree for multi-page projects
For multi-page prototypes, the code view SHALL display a file tree panel showing the logical structure of the generated code.

#### Scenario: File tree shows page structure
- **WHEN** code view is active for a multi-page project
- **THEN** a file tree panel (200px wide) SHALL appear on the left showing:
  - 📁 pages/ folder containing each page as a virtual file
  - 📄 styles (embedded CSS section)
  - 📄 scripts (embedded JS section)

#### Scenario: Click file tree node navigates to code
- **WHEN** user clicks a page name in the file tree
- **THEN** the code panel SHALL scroll to that page's code section
- **AND** the clicked node SHALL be highlighted as active

#### Scenario: Single-page hides file tree
- **WHEN** code view is active for a single-page prototype
- **THEN** the file tree panel SHALL NOT be displayed
- **AND** the code panel SHALL use the full width

### Requirement: File tree reflects current state
The file tree SHALL update automatically when the prototype changes (new generation, page add/remove).

#### Scenario: New generation updates file tree
- **WHEN** a new prototype is generated with different pages
- **THEN** the file tree SHALL reflect the new page structure immediately
