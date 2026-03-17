## ADDED Requirements

### Requirement: Server extracts component HTML by bridge-id and regenerates it
The system SHALL provide `POST /api/projects/:id/prototype/regenerate-component` accepting `{ bridgeId: string, instruction: string }`. The server SHALL parse the current prototype HTML, extract the outerHTML of the element with the matching `data-bridge-id`, send it to AI with the instruction and relevant design context (design spec analysis, design profile), and stream the AI response as SSE chunks. On completion, the server SHALL replace the original component HTML in the full prototype and save a new prototype version.

#### Scenario: Successful component regeneration
- **WHEN** a POST request is made with a valid `bridgeId` and `instruction`
- **THEN** the server streams SSE chunks of the new component HTML and ends with `{ done: true, html: <new-component-html>, bridgeId }`

#### Scenario: Unknown bridge-id returns 404
- **WHEN** a POST is made with a `bridgeId` that does not exist in the current prototype
- **THEN** the server returns HTTP 404 with `{ error: "Component not found" }`

#### Scenario: No current prototype returns 404
- **WHEN** a POST is made for a project with no prototype yet
- **THEN** the server returns HTTP 404 with `{ error: "No prototype found" }`

#### Scenario: Missing bridgeId or instruction returns 400
- **WHEN** a POST is made without `bridgeId` or `instruction`
- **THEN** the server returns HTTP 400

### Requirement: AI returns only the component HTML, preserving bridge-id
The AI prompt for component regeneration SHALL instruct the model to return ONLY the updated component HTML (same root element tag, same `data-bridge-id` value). The returned HTML SHALL NOT include DOCTYPE, html, head, or body elements.

#### Scenario: Returned HTML preserves bridge-id
- **WHEN** the AI returns the regenerated component
- **THEN** the root element of the returned HTML contains the original `data-bridge-id` attribute

### Requirement: Client swaps component in live iframe without full reload
After receiving the completed SSE response, the client SHALL send a `swap-component` PostMessage to the prototype iframe with `{ bridgeId, html }`. The bridge script SHALL replace the `outerHTML` of the element with the matching `data-bridge-id` with the new HTML.

#### Scenario: Live swap updates iframe content
- **WHEN** the client receives `{ done: true, html, bridgeId }` from the regenerate endpoint
- **THEN** the iframe component is replaced in-place without a full page reload

### Requirement: Regenerate button appears on annotated elements in annotation mode
In annotation mode, when the user clicks an element that has an existing annotation, the annotation popup SHALL include a "Regenerate" button. Clicking it SHALL open an inline instruction input. Submitting the instruction SHALL call the regenerate-component endpoint and stream the result.

#### Scenario: Regenerate button visible in annotation mode
- **WHEN** annotation mode is active and the user clicks an annotated element
- **THEN** the annotation popup shows a "Regenerate" button alongside existing Edit/Delete actions

#### Scenario: Instruction-less regeneration uses annotation content as default
- **WHEN** the user clicks Regenerate without entering a custom instruction
- **THEN** the annotation content is used as the instruction

### Requirement: New prototype version saved after component swap
After a successful component regeneration and swap, the system SHALL save a new `prototype_versions` row with incremented version number and `is_current = 1`, containing the full prototype HTML with the component replaced.

#### Scenario: Version history updated after regeneration
- **WHEN** a component is successfully regenerated
- **THEN** a new prototype version exists with the updated HTML and version number incremented by 1
