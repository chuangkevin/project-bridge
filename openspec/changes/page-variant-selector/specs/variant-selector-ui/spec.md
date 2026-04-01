## ADDED Requirements

### Requirement: Variant selection UI shown in ChatPanel
When variant-select SSE event is received, ChatPanel SHALL display a variant selection card showing 2-3 mini iframe previews side by side. Each variant has a label, a scaled-down iframe preview, and a "選這個" button.

#### Scenario: 3 variants received
- **WHEN** SSE sends `{ type: 'variant-select', page: '物件詳情', variants: [{id,label,html},...] }`
- **THEN** ChatPanel renders a card with 3 mini iframes (transform: scale(0.4)) and selection buttons

#### Scenario: User selects variant B
- **WHEN** user clicks "選這個" on variant B
- **THEN** client sends POST `/api/projects/:id/select-variant` with `{ page, variantId, variantHtml }`
- **AND** the selection card is replaced with "✅ 已選擇：方案 B"

#### Scenario: Variant previews are interactive
- **WHEN** user hovers over a mini iframe
- **THEN** the iframe scales up slightly (transform: scale(0.6)) for better visibility

### Requirement: Sidebar "其他方案" button per page
Each page in the WorkspacePage sidebar page list SHALL have a "🔄" button. Clicking it sends a request to generate variants for that specific page.

#### Scenario: User clicks 🔄 on a page
- **WHEN** user clicks 🔄 next to "首頁" in the sidebar
- **THEN** system generates 2 alternative variants for 首頁
- **AND** shows variant selection card in ChatPanel

#### Scenario: Generation in progress
- **WHEN** variants are being generated
- **THEN** the 🔄 button shows a loading spinner and is disabled

### Requirement: Server endpoint for variant selection
POST `/api/projects/:id/select-variant` SHALL accept `{ page, variantId, variantHtml }`, replace the specified page in the current prototype HTML, and save as a new version.

#### Scenario: Successful replacement
- **WHEN** server receives variant selection for "物件詳情"
- **THEN** the page div in the prototype HTML is replaced with the selected variant HTML
- **AND** a new prototype version is saved with is_current=1

#### Scenario: Page not found in prototype
- **WHEN** server cannot find the page div in the prototype
- **THEN** server returns 400 error with message
