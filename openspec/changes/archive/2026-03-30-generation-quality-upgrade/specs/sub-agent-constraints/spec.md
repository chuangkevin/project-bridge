## ADDED Requirements

### Requirement: Design system enforcement in sub-agent
The sub-agent prompt SHALL include the full design system with mandatory rules and a violations list that the AI must not violate.

#### Scenario: Sub-agent receives anti-patterns
- **WHEN** sub-agent generates a page fragment
- **THEN** the prompt includes a "VIOLATIONS THAT WILL BE REJECTED" section listing at least 6 specific prohibited patterns (white bg, large color blocks, heavy shadows, non-system fonts, rounded-full buttons, empty placeholder cards)

#### Scenario: Sub-agent uses CSS variables
- **WHEN** sub-agent generates HTML
- **THEN** the generated HTML uses `var(--primary)`, `var(--bg)`, `var(--text)` etc. instead of hardcoded hex values for all brand colors

### Requirement: Sub-agent content quality
The sub-agent SHALL generate realistic, content-rich page fragments with domain-appropriate data, not generic placeholders.

#### Scenario: Product listing page
- **WHEN** sub-agent generates a product listing page
- **THEN** it contains at least 6 product cards with varied names, prices, descriptions, and images (using placeholder image URLs), not "商品名稱" repeated 6 times

#### Scenario: Form page
- **WHEN** sub-agent generates a form/checkout page
- **THEN** it contains labeled form fields with appropriate input types, validation hints, and a realistic layout matching e-commerce checkout patterns

### Requirement: Single-call generation also follows design system
The non-parallel (single-call) generation path SHALL also include the design system anti-patterns in its system prompt.

#### Scenario: Single page generation
- **WHEN** a user requests a single-page prototype
- **THEN** the generation prompt includes the same anti-patterns list and design system constraints as the parallel path
