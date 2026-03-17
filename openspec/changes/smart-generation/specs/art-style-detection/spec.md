## ADDED Requirements

### Requirement: Extract images from uploaded spec documents
The system SHALL extract embedded images from PPTX and DOCX files during upload. For PPTX: read `ppt/media/` from the ZIP. For DOCX: read `word/media/` from the ZIP. Take up to 3 images per document.

#### Scenario: PPTX with images
- **WHEN** user uploads a .pptx file that contains embedded images
- **THEN** system extracts up to 3 images from ppt/media/, analyzes them for art style via Vision API, stores the analysis

#### Scenario: DOCX with images
- **WHEN** user uploads a .docx file that contains embedded images
- **THEN** system extracts up to 3 images from word/media/, analyzes art style

#### Scenario: Document with no images
- **WHEN** uploaded document has no embedded images
- **THEN** system skips art style detection silently, no notification shown

### Requirement: Art style preference per project
The system SHALL store detected art style and apply preference in `art_style_preferences` table (project_id UNIQUE, detected_style TEXT, apply_style BOOLEAN DEFAULT FALSE).

#### Scenario: Store detected style
- **WHEN** art style is detected from a document
- **THEN** system upserts art_style_preferences with the detected style description

#### Scenario: Toggle apply_style
- **WHEN** PUT `/api/projects/:id/art-style` with `{ applyStyle: true/false }`
- **THEN** system updates apply_style, returns updated preference

### Requirement: Art style prompt card in chat panel
The system SHALL show a dismissible card in the chat panel when a detected_style is available, containing the style summary and a toggle switch.

#### Scenario: Card visible when style detected
- **WHEN** project has a non-empty detected_style
- **THEN** chat panel shows a card: "🎨 偵測到美術風格" with a 1-line summary and a toggle switch "套用至生成"

#### Scenario: Toggle switch
- **WHEN** user toggles the switch ON
- **THEN** system calls PUT `/api/projects/:id/art-style` with applyStyle: true, switch shows ON state

### Requirement: Art style injection into prompt
The system SHALL append an art style block to the generation prompt when apply_style is true.

#### Scenario: Art style block injected
- **WHEN** apply_style is true and user sends a generate message
- **THEN** system appends art style block after Design Profile block in the system prompt

#### Scenario: Art style and Design Profile both active
- **WHEN** both apply_style is true and design profile exists
- **THEN** both blocks are included; Design Profile tokens take precedence over conflicting art style attributes (stated explicitly in prompt)
