## ADDED Requirements

### Requirement: Sub-agent HTML validated immediately after generation
After each `generatePageFragment()` returns success, the system SHALL immediately validate the HTML structure BEFORE adding it to fragments. Validation checks: (1) contains page wrapper div, (2) text content > 50 chars, (3) div balance within ±2, (4) no full HTML document markers.

#### Scenario: Valid HTML passes gate
- **WHEN** sub-agent returns `<div class="page" id="page-首頁">...200 chars of text...</div>`
- **THEN** HTML passes validation and is added to fragments

#### Scenario: Empty HTML fails gate
- **WHEN** sub-agent returns `<div class="page" id="page-首頁"><div class="container"></div></div>`
- **THEN** validation fails (text content < 50 chars) and triggers immediate retry

#### Scenario: Unbalanced divs fail gate
- **WHEN** sub-agent returns HTML with 10 open divs and 5 close divs
- **THEN** validation fails (balance diff > 2) and triggers immediate retry

#### Scenario: Full HTML document fails gate
- **WHEN** sub-agent returns `<!DOCTYPE html><html>...<body>...</body></html>`
- **THEN** validation fails (contains document markers) and triggers immediate retry

### Requirement: Failed gate triggers immediate retry with different key
When pre-assembly validation fails, the system SHALL retry with a different API key immediately (not wait for the batch retry phase). Maximum 1 gate-retry per page.

#### Scenario: Gate retry succeeds
- **WHEN** first HTML fails gate AND retry produces valid HTML
- **THEN** retry HTML is used, original discarded

#### Scenario: Gate retry also fails
- **WHEN** first HTML fails gate AND retry also fails gate
- **THEN** page is marked as failed, will get fallback div in assembler

### Requirement: Gate validation results logged
Each gate validation SHALL log the result: page name, pass/fail, reason for failure, text length, div balance.

#### Scenario: Validation logging
- **WHEN** page "首頁" passes with 350 chars, balance +1
- **THEN** log: `[pre-gate] "首頁" PASS: 350 chars, div balance +1`
