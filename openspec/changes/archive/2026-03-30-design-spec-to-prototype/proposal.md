## Why

When users upload a design spec (PDF or image), the system currently only extracts text — it ignores visual patterns entirely. AI-generated prototypes end up looking generic because the system has no knowledge of the design's actual card layouts, color palette, search bar style, or tag components. This gap makes the feature useless for users who want a prototype that faithfully reflects their brand and design language.

## What Changes

- PDF upload pipeline gains a **page-to-image rendering** step before text extraction
- Each rendered page is analyzed by Vision API to extract component-level visual patterns (cards, search bars, tag chips, nav, layout grid, color palette, typography)
- Analysis results are stored as a structured **Design Spec Analysis** document per project
- AI prototype generation injects the Design Spec Analysis into the system prompt alongside the existing Design Profile
- UI: uploaded design files show a "Visual Analysis" badge and component pattern summary in the Design Panel

## Capabilities

### New Capabilities
- `design-spec-analysis`: Per-project visual analysis derived from uploaded design spec files — extracts color palette, component patterns (cards, search bars, tags, nav), layout rules, and typography; stored and injected into AI generation prompt

### Modified Capabilities
- (none — existing file-upload and AI generation behaviors are extended, not spec-level replaced)

## Impact

- **packages/server**: new PDF-to-image rendering dependency (pdf2pic or pdf-to-img); new Vision API analysis route; new DB column or table for design spec analysis; updated AI prompt assembly
- **packages/client**: Design Panel shows analysis results; upload flow shows analysis status
- **AI prompts**: system prompt gains a "Component Spec" section populated from analysis
- **Dependencies**: adds `pdf2pic` or equivalent (node canvas / ghostscript wrapper) for PDF rendering
