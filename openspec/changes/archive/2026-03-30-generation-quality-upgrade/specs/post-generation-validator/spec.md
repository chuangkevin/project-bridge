## ADDED Requirements

### Requirement: Automated design system validation
The system SHALL validate generated HTML against the HousePrice design system after generation completes, checking for common violations.

#### Scenario: Pure white background detected
- **WHEN** generated HTML contains `background: #FFFFFF` or `background-color: #fff` on a container element
- **THEN** the validator reports a warning: "Found #FFFFFF background, should use #FAF4EB or #F8F7F5"

#### Scenario: Heavy drop shadow detected
- **WHEN** generated HTML contains box-shadow with blur radius > 8px
- **THEN** the validator reports a warning: "Shadow too heavy, max blur should be 4px"

#### Scenario: Non-system font detected
- **WHEN** generated HTML contains font-family with a non-system font name (e.g. Roboto, Open Sans, Poppins)
- **THEN** the validator reports a warning: "Non-system font detected, use system sans-serif stack"

#### Scenario: CSS variable usage rate
- **WHEN** generated HTML uses hardcoded hex values for brand colors instead of CSS variables
- **THEN** the validator reports the CSS variable usage rate (e.g. "var() usage: 45% — should be >80%")

### Requirement: Auto-fix common violations
The system SHALL automatically fix certain violations in the generated HTML without re-generating.

#### Scenario: Replace white backgrounds
- **WHEN** validator detects `background-color: #ffffff` on body or main container
- **THEN** the system auto-replaces it with `background-color: #FAF4EB`

#### Scenario: Cap shadow blur
- **WHEN** validator detects box-shadow with blur > 8px
- **THEN** the system caps the blur at 4px

#### Scenario: Fix font stack
- **WHEN** validator detects custom font declaration
- **THEN** the system replaces it with `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`

### Requirement: Validation results in quality score
The design system validation results SHALL be included as an additional dimension in the quality scoring badge.

#### Scenario: Quality badge shows design compliance
- **WHEN** a prototype version has quality scores
- **THEN** the badge includes a "design" dimension showing the design system compliance score (0-100)
