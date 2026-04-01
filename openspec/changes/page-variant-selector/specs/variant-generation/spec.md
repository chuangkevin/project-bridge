## ADDED Requirements

### Requirement: Variant generation triggered by three conditions
The system SHALL generate 2 alternative HTML variants for a page when any of these conditions are met: (1) the page has a QA lesson from a previous generation, (2) the pre-assembly gate failed and retry also failed, (3) the user manually requests via "其他方案" button.

#### Scenario: QA lesson triggers variants
- **WHEN** project has lesson "物件詳情: 頁面內容不足" AND a new generation starts
- **THEN** after 物件詳情 is generated, 2 additional variants are generated with different prompt strategies

#### Scenario: Gate failure triggers variants
- **WHEN** a page fails pre-assembly gate AND gate-retry also fails
- **THEN** 2 additional variants are generated instead of using fallback div

#### Scenario: User manually requests variants
- **WHEN** user clicks "🔄 其他方案" on a page in the sidebar
- **THEN** system generates 2 variants using the page's current spec, plus keeps the original as variant A

### Requirement: Each variant uses a different prompt strategy
The 3 variants SHALL use distinct prompt strategies to ensure meaningful differences: Variant A is the standard sub-agent output, Variant B adds "結構導向" prompt emphasis (tables, forms, clear hierarchy), Variant C adds "視覺導向" prompt emphasis (cards, images, hero sections).

#### Scenario: Three distinct variants
- **WHEN** variants are generated for "物件詳情"
- **THEN** variant A uses standard prompt, variant B emphasizes structured layout, variant C emphasizes visual appeal
- **AND** the three outputs are visually distinguishable

### Requirement: Maximum 2 pages trigger variants per generation
To control API cost, at most 2 pages SHALL trigger variant generation in a single generation run. Additional pages with concerns use standard auto-retry.

#### Scenario: 3 pages have lessons
- **WHEN** 3 pages have QA lessons
- **THEN** only the 2 pages with the most severe/recent lessons get variants, the third uses auto-retry
