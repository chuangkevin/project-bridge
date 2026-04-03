## ADDED Requirements

### Requirement: Extract component from prototype preview
The system SHALL allow users to select a DOM fragment from the prototype iframe and save it as a reusable component.

#### Scenario: Select and save element as component
- **WHEN** user right-clicks (or uses a "Save as Component" button) on an element in the prototype preview
- **THEN** system extracts the element's outerHTML and its scoped CSS (computed styles or matching stylesheet rules)
- **AND** opens a dialog to set component name, category, and tags
- **AND** on confirmation, calls `POST /api/components/extract` with the HTML/CSS

#### Scenario: Extract with scoped CSS
- **WHEN** the selected element uses CSS classes shared across the page
- **THEN** system extracts only the CSS rules that apply to the selected element and its descendants
- **AND** rewrites class names to avoid global conflicts (prefix with `comp-{id}-`)

#### Scenario: Auto-generate thumbnail
- **WHEN** a component is created via extraction
- **THEN** server renders the HTML/CSS in a Playwright page (400x300 viewport)
- **AND** takes a screenshot and stores it as base64 thumbnail

### Requirement: Server extract endpoint
The system SHALL provide `POST /api/components/extract` that processes raw HTML/CSS into a stored component.

#### Scenario: Successful extraction
- **WHEN** client sends `{ html: "...", css: "...", name: "Card", category: "card" }`
- **THEN** server sanitizes the HTML (remove scripts, event handlers)
- **AND** creates the component record with auto-generated thumbnail
- **AND** returns the created component object

#### Scenario: Missing required fields
- **WHEN** client sends extraction request without html or name
- **THEN** server returns 400 with descriptive error
