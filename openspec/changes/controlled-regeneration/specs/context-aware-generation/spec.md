## MODIFIED Requirements

### Requirement: Regenerate flow re-reads all project context
When `forceRegenerate: true`, the server SHALL execute the full context-loading pipeline: load design specs, uploaded files analysis, architecture block, design convention, global design profile, project design profile, art style, and platform shell — identical to the current full generation flow.

#### Scenario: Regenerate loads latest uploaded files
- **WHEN** user clicks Regenerate after uploading a new design spec
- **THEN** the generation SHALL include the newly uploaded file's analysis in the prompt

#### Scenario: Regenerate respects updated design profile
- **WHEN** user changes design tokens (e.g. primary color) then clicks Regenerate
- **THEN** the generated prototype SHALL use the updated design tokens

### Requirement: Micro-adjust flow does NOT load project context
When intent is `micro-adjust` (and `forceRegenerate` is not set), the server SHALL skip all project context loading and only use:
1. The current prototype HTML from `prototype_versions`
2. The user's chat message
3. The micro-adjust system prompt
4. Recent conversation history (last 10 messages, trimmed)

#### Scenario: Micro-adjust is fast
- **WHEN** micro-adjust is triggered
- **THEN** the server SHALL NOT query `uploaded_files`, `design_profiles`, `global_design_profile`, `platform_shells`, or `art_style_preferences` tables for prompt construction

### Requirement: chat.ts route accepts forceRegenerate parameter
The `POST /api/projects/:id/chat` endpoint SHALL accept an optional `forceRegenerate: boolean` field in the request body.

#### Scenario: forceRegenerate true triggers full generation
- **WHEN** request body includes `{ message: "...", forceRegenerate: true }`
- **THEN** the server SHALL skip micro-adjust override and use the full generation path with complete context loading

#### Scenario: forceRegenerate false or absent defaults to micro-adjust logic
- **WHEN** request body does not include `forceRegenerate` or it is false
- **THEN** the server SHALL apply the micro-adjust override logic (downgrade `full-page`/`in-shell` to `micro-adjust` when prototype exists)
