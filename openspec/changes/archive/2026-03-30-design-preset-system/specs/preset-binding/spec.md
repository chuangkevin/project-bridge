## ADDED Requirements

### Requirement: Project-Preset Binding
Projects can be bound to a design preset at creation or via settings.

#### Scenario: New project with preset
Given user creates a project and selects a preset from dropdown
Then project.design_preset_id is set to the preset ID
And generation uses that preset's design_convention and tokens

#### Scenario: No preset selected
Given user creates project without selecting a preset
Then project.design_preset_id is NULL
And generation falls back to global_design_profile (existing behavior)

#### Scenario: Change preset
Given user changes preset in project settings
Then project.design_preset_id is updated
And next generation uses the new preset

### Requirement: Generation Integration
Parallel generation pipeline reads preset convention.

#### Scenario: Preset overrides global
Given project has design_preset_id set
Then chat.ts reads design_presets.design_convention instead of global
And parallelGenerator replaces :root CSS variables from preset tokens
And sub-agents receive preset convention in their prompts
And planning agents receive preset design direction
