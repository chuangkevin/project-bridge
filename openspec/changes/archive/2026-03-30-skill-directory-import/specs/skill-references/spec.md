## ADDED Requirements

### Requirement: Cross-reference detection
The system SHALL detect references between skills by scanning each skill's content for mentions of other skill names (exact match, case-insensitive) and storing the result in the `depends_on` JSON array field.

#### Scenario: Skill content mentions another skill name
- **WHEN** skill "houseprice-object-sync" contains the text "houseprice-object-management" in its body
- **THEN** the system adds "houseprice-object-management" to the `depends_on` array of "houseprice-object-sync"

#### Scenario: Reference recalculation after batch import
- **WHEN** a batch import completes
- **THEN** the system recalculates `depends_on` for ALL skills (not just imported ones), because new skills may be referenced by existing ones

#### Scenario: Self-reference ignored
- **WHEN** a skill's content contains its own name
- **THEN** the system does not include self-references in `depends_on`

### Requirement: Reference query API
The system SHALL provide `GET /api/skills/:id/references` returning the skill's outgoing references (skills it depends on) and incoming references (skills that depend on it).

#### Scenario: Skill with both incoming and outgoing references
- **WHEN** client requests references for a skill that references 2 other skills and is referenced by 3 skills
- **THEN** the API returns `{ outgoing: ["skill-a", "skill-b"], incoming: ["skill-c", "skill-d", "skill-e"] }`

### Requirement: Reference visualization in UI
The system SHALL display reference tags on each skill card in the settings page, showing outgoing and incoming references as clickable tags.

#### Scenario: Skill card with references
- **WHEN** a skill has outgoing references ["houseprice-object-management"] and incoming references ["houseprice-object-sync-consolidation"]
- **THEN** the skill card displays "引用: houseprice-object-management" and "被引用: houseprice-object-sync-consolidation" as clickable tags that scroll to the referenced skill

#### Scenario: Delete warning for referenced skill
- **WHEN** user attempts to delete a skill that has incoming references (other skills depend on it)
- **THEN** the system shows a warning listing the dependent skills before confirming deletion
