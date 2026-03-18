## ADDED Requirements

### Requirement: User can enter drag-edit mode in PreviewPanel
The PreviewPanel SHALL have a "拖放微調" toggle button. When activated, the user can drag elements with `data-bridge-id` attributes within the preview iframe to reposition them.

#### Scenario: Toggle drag-edit mode on
- **WHEN** user clicks the "拖放微調" button
- **THEN** the button MUST show active state and a drag-mode indicator banner MUST appear above the preview

#### Scenario: Toggle drag-edit mode off
- **WHEN** user clicks the active "拖放微調" button again
- **THEN** drag mode is deactivated and the indicator banner is hidden

### Requirement: Elements with data-bridge-id are draggable in drag-edit mode
When drag-edit mode is active, hovering over any element with a `data-bridge-id` attribute SHALL highlight it with a blue outline. Dragging SHALL reposition the element using CSS `transform: translate(dx, dy)`.

#### Scenario: Element highlights on hover in drag mode
- **WHEN** drag-edit mode is active and user hovers over a `data-bridge-id` element
- **THEN** that element MUST show a blue outline (`outline: 2px solid #3b82f6`)

#### Scenario: Dragging repositions element
- **WHEN** user drags a highlighted element in drag-edit mode
- **THEN** the element MUST move with the cursor and its position MUST update via CSS transform

#### Scenario: Drag is committed on mouseup
- **WHEN** user releases the mouse button after dragging
- **THEN** the element's new transform MUST be applied as an inline style and the drag handle is released

### Requirement: Drag edits are written back to the HTML string
After a drag operation is committed, the system SHALL read the modified DOM from `iframe.contentDocument` and update the parent component's HTML state.

#### Scenario: HTML state updated after drag
- **WHEN** a drag edit is committed
- **THEN** the HTML string in parent state MUST reflect the element's new `style` attribute with the updated transform

#### Scenario: Updated HTML can be re-generated from
- **WHEN** user sends a new generation message after making drag edits
- **THEN** the server MUST receive the updated HTML (not the pre-edit version) in the existing prototype context
