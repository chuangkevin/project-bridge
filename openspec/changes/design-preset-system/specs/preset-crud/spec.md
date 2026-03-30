## ADDED Requirements

### Requirement: Preset CRUD API
Server provides full CRUD for design presets with admin auth.

#### Scenario: Create preset
Given admin sends POST /api/design-presets with { name, tokens, description }
Then a new preset is created with generated UUID
And response includes the full preset object

#### Scenario: List presets
Given GET /api/design-presets
Then returns array of all presets sorted by is_default DESC, name ASC

#### Scenario: Update preset
Given admin sends PUT /api/design-presets/:id with partial fields
Then preset is updated, updated_at refreshed

#### Scenario: Delete preset
Given admin sends DELETE /api/design-presets/:id
When preset is_default = false
Then preset is deleted
When preset is_default = true
Then returns 400 error "cannot delete default preset"

#### Scenario: Copy preset
Given admin sends POST /api/design-presets/:id/copy
Then a new preset is created with name "(original) 副本"
And all fields copied except id and is_default (set to false)

### Requirement: Settings UI
SettingsPage shows "設計風格庫" section with preset cards.

#### Scenario: Card display
Each card shows 3 color dots, name, description, default badge, action buttons

#### Scenario: Edit modal
Click edit opens modal with name, description, color pickers, font selector, radius slider, shadow select
