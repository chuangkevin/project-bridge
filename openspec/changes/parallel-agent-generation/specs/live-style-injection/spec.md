## MODIFIED Requirements

### Requirement: Inject live style overrides into prototype iframe
系統 SHALL 將 Style Tweaker 的變更即時注入到 prototype iframe 中。When design_tokens exist, the injection SHALL use the unified token format to generate the `:root` CSS variable block, ensuring both tweaker edits and design tokens are applied consistently.

#### Scenario: Design tokens exist and user tweaks a color
- **WHEN** project has design_tokens AND user changes `--primary` in style tweaker
- **THEN** system injects `:root` block with ALL design token values as CSS variables, with the user's tweak overriding the corresponding token value

#### Scenario: No design tokens, conventional tweaker flow
- **WHEN** project has no design_tokens
- **THEN** system uses current injection behavior (inject only the tweaked variables)
