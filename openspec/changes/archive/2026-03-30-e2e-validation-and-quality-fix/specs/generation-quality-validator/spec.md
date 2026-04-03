## ADDED Requirements

### Requirement: Validate page completeness
The system SHALL verify that generated multi-page HTML contains all pages listed in the analysis result. Each page div MUST have more than 200 characters of content.

#### Scenario: All analysis pages present in output
- **WHEN** analysis result has pages ["選擇範本", "選擇物件", "選擇額度"] and HTML is generated
- **THEN** the validator confirms all 3 page names appear in `data-page` attributes

#### Scenario: Page with placeholder content flagged
- **WHEN** a page div contains fewer than 200 characters or contains "此處將顯示"
- **THEN** the validator logs a warning identifying the page as having insufficient content

### Requirement: Validate color convention applied
The system SHALL verify that the generated HTML's computed `--primary` CSS variable matches the convention's primary color when a design convention is active.

#### Scenario: Purple convention correctly applied
- **WHEN** design convention specifies `#8E6FA7` as primary and HTML is generated
- **THEN** the `:root` block in the HTML contains `--primary` set to `#8E6FA7` (not `#3b82f6`)

#### Scenario: No convention — default colors acceptable
- **WHEN** no design convention is configured
- **THEN** the validator accepts any primary color

### Requirement: Validate navigation flow
The system SHALL verify that `showPage()` calls in generated HTML match the navigation flow from the analysis result.

#### Scenario: Navigation matches analysis
- **WHEN** analysis says "選擇範本" navigates to "選擇物件"
- **THEN** the HTML contains `showPage('選擇物件')` within the 選擇範本 page div
