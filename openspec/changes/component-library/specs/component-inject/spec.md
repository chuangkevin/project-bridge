## ADDED Requirements

### Requirement: Inject component library references into AI generation prompt
The system SHALL inject matching component HTML/CSS into the AI generation prompt so that AI prioritizes reusing existing components over generating from scratch.

#### Scenario: Project has bound components
- **WHEN** AI generation is triggered for a project with bound components
- **THEN** system retrieves all bound components from `project_component_bindings`
- **AND** matches component categories against the page architecture's element types
- **AND** injects matched components into the sub-agent prompt as reference blocks:
  ```
  [元件庫參考 — 請優先使用以下已驗證的元件結構]
  [component: {name} (category: {category})]
  <HTML>
  <style>CSS</style>
  [/component]
  ```

#### Scenario: Category matching logic
- **WHEN** a page's architecture specifies element types (e.g., "navigation", "card-list", "search-form")
- **THEN** system maps these to component categories:
  - "navigation", "nav", "sidebar", "menu" → category `navigation`
  - "card", "card-list", "listing", "grid" → category `card`
  - "form", "search", "filter", "input" → category `form`
  - "button", "cta", "action" → category `button`
  - "hero", "banner" → category `hero`
  - "footer" → category `footer`
  - "modal", "dialog", "popup" → category `modal`
  - "table", "data-grid" → category `table`

#### Scenario: No matching components
- **WHEN** no bound components match the page's element types
- **THEN** system does not inject any component reference (AI generates freely)

#### Scenario: Token budget management
- **WHEN** injecting component references would exceed 4000 tokens
- **THEN** system prioritizes components by: (1) exact category match, (2) most recently updated, (3) smallest HTML size
- **AND** truncates at the token budget with a note: "更多元件已省略，請參考元件庫"

#### Scenario: Post-generation component tracking
- **WHEN** AI generation completes for a page
- **THEN** system compares the generated HTML against injected component references
- **AND** tags elements that closely match library components (>80% structural similarity) as `data-component-ref="{component-id}"`
- **AND** tags newly generated elements as `data-component-ref="new"`

### Requirement: Component picker in project workspace
The system SHALL provide a component picker UI within the project workspace.

#### Scenario: Open component picker
- **WHEN** user clicks "元件庫" button in the project workspace sidebar
- **THEN** system shows a panel listing all global components, grouped by category
- **AND** highlights components already bound to this project

#### Scenario: Quick-bind from picker
- **WHEN** user toggles a component in the picker
- **THEN** system immediately creates/removes the binding via API
- **AND** updates the UI to reflect the new binding state
