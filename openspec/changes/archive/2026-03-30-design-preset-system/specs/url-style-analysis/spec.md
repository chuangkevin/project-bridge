## ADDED Requirements

### Requirement: URL Style Analysis
AI analyzes 1-3 website URLs to extract design style and generate a preset.

#### Scenario: Single URL analysis
Given POST /api/design-presets/analyze-url with { urls: ["https://example.com"] }
Then server fetches the URL content
And extracts CSS computed styles (colors, fonts, spacing, shadows)
And sends extracted data to Gemini AI
And AI returns structured design tokens + convention text
And response includes { tokens, analysis, convention }

#### Scenario: Multi-URL analysis
Given POST with { urls: ["url1", "url2", "url3"] }
Then server fetches all URLs
And AI cross-analyzes to find common design patterns
And produces a merged style that represents the shared aesthetic

#### Scenario: Analysis failure
Given a URL that cannot be fetched (404, timeout, blocked)
Then that URL is skipped with a warning
And analysis proceeds with remaining URLs
And response includes { warnings: ["url1: fetch failed"] }

### Requirement: URL Input UI
Preset editor modal has URL input section.

#### Scenario: Add URLs
User can add up to 3 URL input fields
Each shows validation state (valid URL format)
"AI 分析風格" button triggers analysis
Loading spinner during analysis
Results populate the tokens and analysis fields
