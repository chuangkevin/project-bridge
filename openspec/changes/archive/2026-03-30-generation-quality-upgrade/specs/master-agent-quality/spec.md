## ADDED Requirements

### Requirement: Comprehensive page spec generation
The master agent SHALL generate page specifications with at least 200 words per page, including: layout description, complete component list with data fields and interactions, navigation flow, and empty states.

#### Scenario: Shopping website with 4 pages
- **WHEN** master agent plans a shopping website with pages: 首頁, 商品詳情, 購物車, 結帳
- **THEN** each page spec contains layout description (grid/flex, columns, max-width), at least 5 specific components with their data fields (e.g. "product card: image 16:9, title, price, add-to-cart button"), navigation links to other pages, and empty/error states

#### Scenario: SharedCss is comprehensive
- **WHEN** master agent generates the plan
- **THEN** sharedCss contains at least 150 lines of CSS including: CSS reset, :root variables with HousePrice tokens, .container, .card, .btn-primary, .btn-secondary, .btn-cta, .form-group, .form-input, nav styles, footer styles, .badge, grid utilities, and responsive @media rules

### Requirement: Design system injection into master prompt
The master agent prompt SHALL include the full HousePrice design system as context, with explicit instructions to follow color tokens, typography, and anti-patterns.

#### Scenario: Master agent receives design convention
- **WHEN** design convention is available
- **THEN** the master agent prompt includes: all color tokens, typography scale, component patterns, layout rules, and the complete anti-patterns list

### Requirement: Master agent identifies brand context
The master agent prompt SHALL identify itself as a HousePrice (好房網) architect and enforce brand-specific constraints.

#### Scenario: Prompt identity
- **WHEN** master agent is invoked
- **THEN** the system prompt begins with "You are a senior UI architect for HousePrice (好房網)" and includes explicit rules about page background (#FAF4EB), primary color (#8E6FA7), and information-dense layout
