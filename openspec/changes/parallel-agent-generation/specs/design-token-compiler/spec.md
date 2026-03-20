## ADDED Requirements

### Requirement: Compile design tokens from multiple sources with priority ordering
The system SHALL merge design data from three sources in strict priority order: (1) user reference images (highest), (2) spec documents, (3) crawled websites (lowest). Higher-priority sources override lower-priority values.

#### Scenario: Reference image specifies purple, crawled site uses blue
- **WHEN** reference image analysis identifies primary color as `#8E6FA7` AND crawled website uses `#3B82F6`
- **THEN** compiled tokens have `colors.primary: "#8E6FA7"` (reference image wins)

#### Scenario: Only crawled website data available (no reference images)
- **WHEN** no reference images are uploaded but a website has been crawled
- **THEN** compiled tokens use all values from crawled website as the base

#### Scenario: Spec document defines component requirements but no colors
- **WHEN** spec analysis identifies "button with 40px height" but no color data
- **THEN** compiled tokens include `components.button.height: "40px"` from spec, colors from crawled website or reference images

### Requirement: Output unified design tokens JSON
The system SHALL produce a JSON object matching the design token schema (colors, typography, spacing, borderRadius, shadows, components, source) and persist it to the project's `design_tokens` column.

#### Scenario: Full compilation with all three sources
- **WHEN** project has reference images, spec docs, and crawled URLs
- **THEN** system produces a complete token JSON with all fields filled and `source` tracking which layer each value came from

#### Scenario: Minimal compilation with only spec document
- **WHEN** project only has a spec document (no images, no URLs)
- **THEN** system produces tokens with sensible defaults for colors/typography and spec-derived values for components/layout

### Requirement: Recompile tokens when sources change
The system SHALL recompile tokens when a new reference image is uploaded, a new spec is analyzed, or a new website is crawled.

#### Scenario: User uploads new reference image after initial compilation
- **WHEN** a new reference image is uploaded and analyzed
- **THEN** system recompiles tokens, merging new image analysis (highest priority) with existing data

### Requirement: API endpoint for token compilation
The system SHALL expose `POST /api/projects/:projectId/compile-tokens` that triggers compilation and returns the result.

#### Scenario: Trigger compilation
- **WHEN** client calls `POST /api/projects/abc/compile-tokens`
- **THEN** server compiles from all available sources and returns `{ tokens: { ... }, sources: { images: 1, specs: 1, urls: 2 } }`
