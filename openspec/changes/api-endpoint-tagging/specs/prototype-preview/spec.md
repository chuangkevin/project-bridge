## MODIFIED Requirements

### Requirement: Interaction mode toggle supports API binding mode
The PreviewPanel SHALL support a third interaction mode: `'api-binding'`, in addition to existing `'browse'` and `'annotate'` modes. The parent component (WorkspacePage) SHALL render a mode toggle control in the toolbar allowing the user to switch between Browse, Annotate, and API Binding modes.

#### Scenario: Toggle to API binding mode
- **WHEN** user clicks the "API Binding" toggle button in the toolbar
- **THEN** the preview enters API binding mode: element hover shows a distinct highlight style (e.g., blue border instead of annotation yellow), and clicking an element dispatches an `element-click` event with the bridge-id

#### Scenario: Mode exclusivity
- **WHEN** user is in API binding mode
- **THEN** annotation mode is disabled — clicks open the ApiBindingPanel, not the annotation editor

#### Scenario: Switch back to browse mode
- **WHEN** user clicks "Browse" in the mode toggle
- **THEN** element clicks are ignored (normal prototype interaction resumes)

### Requirement: API binding mode visual indicators
When in API binding mode, elements that already have API bindings SHALL display a visual indicator (e.g., a small API icon badge or colored dot) to show they are bound.

#### Scenario: Element with binding shows indicator
- **WHEN** API binding mode is active and element "submit-btn" has a saved binding
- **THEN** a small indicator (e.g., blue dot) appears on or near the element in the preview

#### Scenario: Element without binding has no indicator
- **WHEN** API binding mode is active and element "logo-img" has no binding
- **THEN** no indicator is shown on that element

### Requirement: Bridge script handles API binding mode messages
The bridge script injected into the prototype iframe SHALL handle a `set-api-binding-mode` message and a `show-api-indicators` message, following the same pattern as existing `set-annotation-mode` and `show-indicators` messages.

#### Scenario: Bridge script receives API binding mode
- **WHEN** parent sends `{ type: 'set-api-binding-mode', enabled: true }` to iframe
- **THEN** bridge script enables API binding hover highlights and click handling

#### Scenario: Bridge script receives API indicators
- **WHEN** parent sends `{ type: 'show-api-indicators', bindings: [{ bridgeId: 'btn-1' }] }` to iframe
- **THEN** bridge script renders indicator badges on the specified elements
