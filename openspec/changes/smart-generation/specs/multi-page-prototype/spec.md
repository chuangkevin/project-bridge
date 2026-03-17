## ADDED Requirements

### Requirement: Detect multi-page structure in requirements
Before HTML generation, the system SHALL analyze the user's message to determine if multiple distinct pages/screens are described. Uses a fast gpt-4o-mini call returning JSON `{multiPage: boolean, pages: string[]}`.

#### Scenario: Single page detected
- **WHEN** user describes a single view (e.g., "做一個登入頁")
- **THEN** system generates a single-page prototype (existing behavior)

#### Scenario: Multiple pages detected
- **WHEN** user describes multiple screens (e.g., "做一個有登入、首頁、個人設定的系統")
- **THEN** system detects pages: ["登入", "首頁", "個人設定"] and uses multi-page generation prompt

### Requirement: Multi-page HTML generation
When multi-page is detected, the system SHALL generate a single HTML file with all pages, a navigation element, and JS page switching logic.

#### Scenario: Generated multi-page HTML structure
- **WHEN** multi-page generation is triggered
- **THEN** HTML contains: a navigation element (sidebar or top nav), each page as `<div class="page" data-page="{name}">` (first visible, rest hidden), JS to show/hide pages, active nav state highlighting

#### Scenario: All pages follow Design Profile
- **WHEN** design profile is active and multi-page is generated
- **THEN** all pages use the same color tokens, typography, and spacing defined in the Design Profile

### Requirement: Page navigation bar above prototype preview
The system SHALL display a page tab bar above the iframe when the current prototype is multi-page.

#### Scenario: Page tabs visible for multi-page prototype
- **WHEN** current PrototypeVersion has is_multi_page=true
- **THEN** a tab bar appears above the iframe with one tab per page name

#### Scenario: Click tab navigates prototype
- **WHEN** user clicks a page tab
- **THEN** system sends postMessage `{ type: 'navigate', page: 'page-name' }` to the iframe, iframe bridge script switches to that page

#### Scenario: No tab bar for single-page prototype
- **WHEN** current PrototypeVersion has is_multi_page=false
- **THEN** no tab bar is shown

### Requirement: PrototypeVersion stores page metadata
The system SHALL store `is_multi_page BOOLEAN` and `pages TEXT` (JSON array of page names) on each PrototypeVersion record.

#### Scenario: Multi-page metadata stored
- **WHEN** a multi-page prototype is generated
- **THEN** PrototypeVersion is saved with is_multi_page=true and pages=["Page1","Page2",...]
