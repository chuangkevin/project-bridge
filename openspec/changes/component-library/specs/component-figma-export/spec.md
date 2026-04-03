## ADDED Requirements

### Requirement: Export library components as Figma Components
The system SHALL mark component library elements during Figma export so they become Figma Components (not plain frames).

#### Scenario: Export prototype with library components
- **WHEN** user triggers Figma export for a prototype that used library components
- **THEN** system identifies elements with `data-component-ref="{component-id}"` attributes
- **AND** wraps each identified element as a Figma Component node in the export payload
- **AND** duplicate instances of the same component become Figma Component Instances

#### Scenario: Component naming in Figma
- **WHEN** a library component is exported to Figma
- **THEN** the Figma Component name follows the format: `{category}/{component-name}` (e.g., `card/房價卡片`, `navigation/主導航列`)

#### Scenario: Standalone component export
- **WHEN** user exports individual components from the component library page
- **THEN** system exports each selected component as a separate Figma Component
- **AND** arranges them on a single Figma page with 40px spacing
