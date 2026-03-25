# Tasks: generation-quality-upgrade

## 1. Design System Document

- [x] 1.1 Create comprehensive HousePrice design system v2 (~5000 chars) covering: color tokens (full purple/dark/brown/accent tables), typography scale, component patterns (button/card/input/badge/nav with exact CSS), layout conventions, anti-patterns list (10+ items)
- [x] 1.2 Update `global_design_profile.design_convention` in DB with v2 document
- [x] 1.3 Add seed logic: if design_convention is empty on server start, auto-populate with v2

## 2. Master Agent Prompt

- [x] 2.1 Rewrite master agent system identity: "senior UI architect for HousePrice (好房網)"
- [x] 2.2 Inject full design system into master prompt (color tokens, typography, component patterns, anti-patterns)
- [x] 2.3 Enforce spec quality: require 200+ word spec per page with layout, components (with data fields), navigation, empty states
- [x] 2.4 Enforce sharedCss quality: require 150+ lines with reset, tokens, nav, cards, buttons, forms, badges, grid, responsive
- [x] 2.5 Add explicit anti-pattern rules in master prompt: no white bg, no large color blocks, no heavy shadows

## 3. Sub-Agent Prompt

- [x] 3.1 Inject design system into sub-agent prompt (truncated to 6000 chars if needed)
- [x] 3.2 Add "VIOLATIONS THAT WILL BE REJECTED" section: white bg, large color blocks, heavy shadows, non-system fonts, rounded-full, empty placeholders
- [x] 3.3 Require CSS variable usage for all brand colors (var(--primary), var(--bg), etc.)
- [x] 3.4 Require realistic content: varied product names/prices, proper form fields, meaningful data
- [x] 3.5 Update single-call generation path to include same design system constraints

## 4. Post-Generation Validator

- [x] 4.1 Create `designSystemValidator.ts` with validation rules: white bg, heavy shadow, non-system font, CSS var usage rate
- [x] 4.2 Add auto-fix: replace white bg → #FAF4EB, cap shadow blur → 4px, fix font stack → system
- [x] 4.3 Integrate validator into chat.ts: run after generation, report violations in SSE
- [x] 4.4 Add "design" dimension to quality scoring (qualityScorer.ts)

## 5. Testing

- [x] 5.1 TypeScript check (server + client)
- [ ] 5.2 Test: generate "購物網站" — verify no large yellow/orange blocks, warm beige bg, purple accents
- [ ] 5.3 Test: verify CSS variable usage rate > 50% in generated HTML
- [ ] 5.4 Test: verify validator catches and fixes white backgrounds
