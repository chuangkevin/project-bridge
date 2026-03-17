## ADDED Requirements

### Requirement: Create annotation on prototype element
The system SHALL allow PM to click on an element in the prototype iframe and add a text annotation. Annotations bind to elements via `data-bridge-id`.

#### Scenario: Add annotation to element
- **WHEN** PM is in annotation mode and clicks an element with `data-bridge-id` in the prototype
- **THEN** system highlights the element, shows annotation editor, and on save creates an annotation via POST `/api/projects/:id/annotations` with bridgeId, label, content, and position

#### Scenario: Element without data-bridge-id
- **WHEN** PM clicks an element that has no `data-bridge-id`
- **THEN** system finds the nearest parent with `data-bridge-id`, or shows a message "This element cannot be annotated"

### Requirement: Annotation CRUD API
The system SHALL provide CRUD endpoints for annotations.

#### Scenario: Create annotation
- **WHEN** POST `/api/projects/:id/annotations` with bridgeId, label, content, specData, positionX, positionY
- **THEN** system creates annotation with uuid, returns the annotation object

#### Scenario: List annotations
- **WHEN** GET `/api/projects/:id/annotations`
- **THEN** system returns all annotations for the project

#### Scenario: Update annotation
- **WHEN** PUT `/api/projects/:id/annotations/:aid` with updated content or specData
- **THEN** system updates the annotation and returns it

#### Scenario: Delete annotation
- **WHEN** DELETE `/api/projects/:id/annotations/:aid`
- **THEN** system deletes the annotation, returns 204

### Requirement: Annotation indicators on prototype
The system SHALL display small numbered indicators on annotated elements in the prototype iframe.

#### Scenario: Show annotation indicators
- **WHEN** prototype is loaded and has annotations
- **THEN** system injects indicator badges at the position of each annotated element via postMessage to iframe bridge script

### Requirement: Annotation list in sidebar
The system SHALL show a list of all annotations in the right panel, each showing the element label and annotation content preview.

#### Scenario: Click annotation in list
- **WHEN** PM clicks an annotation in the sidebar list
- **THEN** system scrolls the prototype to the annotated element and highlights it

### Requirement: Bridge script injection
The system SHALL inject a bridge script into the prototype HTML (before `</body>`) that enables postMessage communication between the iframe and the parent page.

#### Scenario: Bridge script handles click
- **WHEN** user clicks inside the prototype iframe while in annotation mode
- **THEN** bridge script finds the nearest element with `data-bridge-id`, sends a postMessage with `{ type: 'element-click', bridgeId, tagName, label, rect }` to the parent
