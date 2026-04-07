## ADDED Requirements

### Requirement: Merge duplicate style tags
The system SHALL merge multiple `<style>` tags in AI-generated HTML into a single `<style>` tag inside `<head>`. The content of all style blocks SHALL be concatenated in document order.

#### Scenario: Two style blocks merged into one
- **WHEN** AI generates HTML with `<style>` in `<head>` and another `<style>` in `<body>`
- **THEN** the sanitizer merges both into a single `<style>` tag in `<head>`, preserving all CSS rules from both blocks

#### Scenario: Single style block unchanged
- **WHEN** AI generates HTML with exactly one `<style>` tag in `<head>`
- **THEN** the sanitizer makes no changes to the style block

### Requirement: Detect and flag truncated HTML
The system SHALL detect when AI output is truncated (missing `</script>`, `</body>`, or `</html>`) and append the missing closing tags.

#### Scenario: Missing closing tags appended
- **WHEN** AI output ends without `</html>` (token limit reached)
- **THEN** the sanitizer appends `</script></body></html>` as needed to produce valid HTML

#### Scenario: Complete HTML unchanged
- **WHEN** AI output contains all closing tags
- **THEN** the sanitizer makes no changes

### Requirement: Validate showPage function for multi-page prototypes
The system SHALL verify that multi-page HTML prototypes contain a `showPage` function definition. If missing, it SHALL inject the standard showPage implementation.

#### Scenario: Missing showPage injected
- **WHEN** a multi-page prototype HTML has `data-page` attributes but no `showPage` function
- **THEN** the sanitizer injects the standard showPage function before `</body>`

#### Scenario: Existing showPage preserved
- **WHEN** a multi-page prototype HTML already contains a `showPage` function
- **THEN** the sanitizer makes no changes to the script
