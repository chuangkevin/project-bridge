## MODIFIED Requirements

### Requirement: Design panel shows inheritance controls
The DesignPanel component SHALL display an inheritance toggle and supplement field when a global design profile exists.

#### Scenario: Inheritance toggle visible when global design exists
- **WHEN** `GET /api/global-design` returns a non-empty profile
- **THEN** DesignPanel shows a toggle switch labeled「繼承全域設計」with its current state

#### Scenario: Global design preview shown when inheriting
- **WHEN** `inherit_global=true` and global profile has content
- **THEN** DesignPanel shows a read-only summary card below the toggle: global description (first 80 chars) and primary color swatch

#### Scenario: Supplement field visible when inheriting
- **WHEN** `inherit_global=true`
- **THEN** DesignPanel shows a「專案補充說明」textarea below the global preview card

#### Scenario: Supplement field hidden when not inheriting
- **WHEN** `inherit_global=false`
- **THEN** DesignPanel hides the supplement field and global preview card

#### Scenario: Save includes inheritGlobal and supplement
- **WHEN** user clicks 儲存設計規格
- **THEN** `PUT /api/projects/:id/design` body includes `inheritGlobal` (boolean) and `supplement` (string)

### Requirement: Global design page accessible from home
The system SHALL provide a dedicated page at `/global-design` for editing the global design profile.

#### Scenario: Navigate to global design from home
- **WHEN** user clicks「🌐 全域設計」button on the HomePage
- **THEN** browser navigates to `/global-design`

#### Scenario: Global design page has same fields as DesignPanel
- **WHEN** user is on `/global-design` page
- **THEN** page shows 設計方向 textarea, 視覺參考圖 upload, 設計細節 tokens (same UI as DesignPanel), and a save button
