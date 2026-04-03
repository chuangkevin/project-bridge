## ADDED Requirements

### Requirement: Directory picker for skill import
The system SHALL provide a "從目錄匯入" button in the Agent Skills settings section that opens the OS directory picker via File System Access API.

#### Scenario: User selects a directory with SKILL.md files
- **WHEN** user clicks "從目錄匯入" and selects a directory containing nested folders with SKILL.md files
- **THEN** the system recursively scans all subdirectories for files named exactly `SKILL.md`, parses each file's YAML frontmatter (name, description, depends) and markdown body, and displays a preview dialog showing all found skills with their name, description, and whether each is new or will update an existing skill

#### Scenario: User confirms import
- **WHEN** user reviews the preview and clicks "匯入"
- **THEN** the system calls `POST /api/skills/batch` with all parsed skills, performs upsert (insert new, update existing by name match), recalculates cross-references, and refreshes the skills list showing the result count ("新增 X，更新 Y")

#### Scenario: No SKILL.md files found
- **WHEN** user selects a directory that contains no SKILL.md files
- **THEN** the system displays an alert "未找到 SKILL.md 檔案" and does not call the API

#### Scenario: Browser does not support File System Access API
- **WHEN** the browser does not support `showDirectoryPicker`
- **THEN** the system falls back to `<input type="file" webkitdirectory>` for directory selection

### Requirement: SKILL.md frontmatter parsing
The system SHALL parse SKILL.md files with YAML frontmatter containing `name` (required), `description` (optional), and `depends` (optional, array of skill names).

#### Scenario: Frontmatter with depends field
- **WHEN** a SKILL.md has frontmatter `depends: [skill-a, skill-b]`
- **THEN** the system stores these as explicit references in the skill's `depends_on` field

#### Scenario: Missing or invalid frontmatter
- **WHEN** a SKILL.md has no `---` frontmatter block or no `name` field
- **THEN** the system skips this file and does not include it in the import

### Requirement: Batch upsert API
The `POST /api/skills/batch` endpoint SHALL accept an array of skills and perform upsert: insert new skills (by name), update existing skills (matching by name), and store source_path for re-sync.

#### Scenario: Mix of new and existing skills
- **WHEN** the batch contains 5 skills, 3 with names matching existing DB records and 2 new
- **THEN** the API updates 3 records and inserts 2, returning `{ imported: 2, updated: 3 }` with the full skills list
