## ADDED Requirements

### Requirement: Complete design system document
The system SHALL store a comprehensive design system document (~5000 chars) in `global_design_profile.design_convention` covering: color palette with full token table, typography scale, component patterns (buttons, cards, inputs, badges, navigation), layout conventions, and anti-patterns list.

#### Scenario: Design system includes anti-patterns
- **WHEN** the design convention is loaded for generation
- **THEN** it MUST include at least 10 explicit anti-patterns (things to avoid) such as large solid color blocks, pure white backgrounds, heavy shadows, and non-system fonts

#### Scenario: Design system includes component patterns
- **WHEN** the design convention is loaded
- **THEN** it MUST include specific CSS patterns for: primary button, CTA button, card, input, badge/tag, navigation header, and sub-navigation with exact hex values and CSS properties

### Requirement: Seed design system on fresh install
The system SHALL automatically seed the HousePrice design system document when `global_design_profile` has no `design_convention` value, using the comprehensive v2 document.

#### Scenario: Fresh database
- **WHEN** server starts with empty design_convention
- **THEN** the system seeds the full v2 design system document into the DB
