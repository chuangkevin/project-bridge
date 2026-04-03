## ADDED Requirements

### Requirement: Component CRUD operations
The system SHALL provide full CRUD operations for UI components in a global component library.

#### Scenario: Create a component
- **WHEN** user submits a new component with name, category, HTML, and CSS
- **THEN** system creates a record in `components` table with auto-generated UUID and version=1
- **AND** creates a corresponding entry in `component_versions` table
- **AND** generates a thumbnail via Playwright screenshot of the HTML/CSS

#### Scenario: List components with filtering
- **WHEN** client sends `GET /api/components?category=card&search=房價`
- **THEN** system returns components matching category AND name/tags containing search term
- **AND** results are paginated (default 20 per page) and sorted by updated_at DESC

#### Scenario: Update a component
- **WHEN** user updates a component's HTML or CSS
- **THEN** system increments the version number
- **AND** saves the previous version to `component_versions`
- **AND** regenerates the thumbnail
- **AND** updates `updated_at` timestamp

#### Scenario: Delete a component
- **WHEN** user deletes a component
- **THEN** system removes the component, all its versions, and all project bindings
- **AND** returns success confirmation

#### Scenario: View version history
- **WHEN** client sends `GET /api/components/:id`
- **THEN** response includes the current component data AND an array of previous versions (id, version, thumbnail, created_at)

### Requirement: Component Library UI page
The system SHALL provide a global component library page accessible from the main navigation.

#### Scenario: Browse components
- **WHEN** user navigates to the component library page
- **THEN** system displays all components as cards with thumbnail, name, category badge, and last updated time
- **AND** provides category filter tabs (全部 / 導航列 / 卡片 / 表單 / 按鈕 / 主視覺 / 頁尾 / 彈窗 / 表格 / 其他)
- **AND** provides a search input for keyword filtering

#### Scenario: Preview a component
- **WHEN** user clicks a component card
- **THEN** system shows a detail panel with: live iframe preview, HTML/CSS source code, version history, and edit/delete actions

### Requirement: Project component binding
The system SHALL allow binding components from the library to specific projects.

#### Scenario: Bind components to project
- **WHEN** user opens a project's component picker and selects components
- **THEN** system creates entries in `project_component_bindings`
- **AND** the selected components appear in the project's component panel

#### Scenario: Unbind component from project
- **WHEN** user removes a component binding from a project
- **THEN** system deletes the binding record
- **AND** the component remains in the global library
